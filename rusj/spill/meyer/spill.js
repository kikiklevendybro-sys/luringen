/* Meyer — the Scandinavian dice-bluffing game, family style (lives, no drinking). One phone is
   passed round: shake two dice under the cup, peek in secret (hold-to-reveal), and say a value that
   beats the last one — true or a bluff. The next player believes it (and must beat it) or calls
   «Løgn!»: the cup is lifted and whoever was wrong loses a life. Optional phone players at three
   levels. The rules, the game steps and the phone's choices are pure functions at the top
   (window.RusjMeyer); test/meyer.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Rules ----------

  // Every outcome of two dice, highest first. The higher die is named first (4 and 6 is 64);
  // 2-1 is Meyer and 3-1 Lille Meyer, then the pairs, then the rest. 3-2 is the lowest.
  const RANG = ["21", "31", "66", "55", "44", "33", "22", "11", "65", "64", "63", "62", "61", "54", "53", "52", "51", "43", "42", "41", "32"];
  const MEYER = "21";
  const LILLE = "31";
  const FELLES = "F"; // «Fellesrunde»: a 3-2, announced outside the ranking (when the rule is on)
  const NIVAER = ["lett", "middels", "vanskelig"];
  // R.t before the kit's R is in scope (the rules also load in the unit tests, without the kit).
  const Rt = { t: (s) => (window.Rusj && window.Rusj.t ? window.Rusj.t(s) : s) };
  const PARNAVN = { 6: Rt.t("Par seksere"), 5: Rt.t("Par femmere"), 4: Rt.t("Par firere"), 3: Rt.t("Par treere"), 2: Rt.t("Par toere"), 1: Rt.t("Par enere") };

  const verdi = (a, b) => `${Math.max(a, b)}${Math.min(a, b)}`;
  // 21 for Meyer down to 1 for 3-2; −1 for anything that is not in the ranking.
  const styrke = (v) => {
    const i = RANG.indexOf(v);
    return i < 0 ? -1 : RANG.length - i;
  };
  const slar = (a, b) => styrke(a) > styrke(b);
  const erPar = (v) => v.length === 2 && v[0] === v[1];
  const odds = (v) => (v === FELLES ? 2 : erPar(v) ? 1 : 2); // ways out of 36
  const navn = (v) => (v === MEYER ? Rt.t("Meyer") : v === LILLE ? Rt.t("Lille Meyer") : v === FELLES ? Rt.t("Fellesrunde") : erPar(v) ? PARNAVN[v[0]] : v);
  const ojne = (v) => (v === FELLES ? [3, 2] : [Number(v[0]), Number(v[1])]);
  const strek = (v) => ojne(v).join("-");

  // What may be said after `forrige` (highest first). After Meyer nothing beats it.
  function lovlige(forrige, felles) {
    if (forrige === MEYER) return [];
    const min = forrige && forrige !== FELLES ? styrke(forrige) : 0;
    const ut = RANG.filter((v) => styrke(v) > min && !(felles && v === "32"));
    if (felles) ut.push(FELLES);
    return ut;
  }
  // The dice show what was said, or better. «Fellesrunde» must be exactly 3-2.
  function erSann(kast, v) {
    if (!Array.isArray(kast) || kast.length !== 2) return false;
    const e = verdi(kast[0], kast[1]);
    if (v === FELLES) return e === "32";
    return styrke(e) >= styrke(v);
  }
  const pMinst = (v) => (v === FELLES ? 2 / 36 : RANG.filter((x) => styrke(x) >= styrke(v)).reduce((s, x) => s + odds(x), 0) / 36);
  const pOver = (v) => (!v || v === FELLES ? 1 : RANG.filter((x) => styrke(x) > styrke(v)).reduce((s, x) => s + odds(x), 0) / 36);

  // ---------- A game, step by step (pure: the page and the tests drive the same functions) ----------

  function nytt(o = {}) {
    const antall = Math.max(2, Math.min(10, o.antall | 0 || 2));
    const liv = Math.max(1, Math.min(6, o.liv | 0 || 6));
    return {
      antall,
      mennesker: o.mennesker == null ? antall : Math.max(0, Math.min(antall, o.mennesker | 0)),
      nivaa: NIVAER.includes(o.nivaa) ? o.nivaa : "middels",
      felles: o.felles !== false,
      maksLiv: liv,
      liv: Array.from({ length: antall }, () => liv),
      ute: [], // seats in the order they went out
      uteRunde: Array.from({ length: antall }, () => 0),
      runde: 1,
      tur: Math.max(0, Math.min(antall - 1, o.starter | 0)),
      fase: "rist", // rist → skjult → svar → (rist for the next | resultat)
      kast: null,
      melding: null, // { v, av }
      kjede: [], // everything said this round: [{ v, av }]
      valgt: null,
      utfall: null,
      starter: null,
      vinner: null,
      tall: Array.from({ length: antall }, () => ({ blof: 0, hjem: 0, avslort: 0, loft: 0, treff: 0 })),
      steg: 0,
    };
  }
  const inne = (sp, i) => sp.liv[i] > 0;
  const igjen = (sp) => sp.liv.map((_, i) => i).filter((i) => inne(sp, i));
  function neste(sp, i) {
    for (let k = 1; k <= sp.antall; k++) {
      const j = (i + k) % sp.antall;
      if (inne(sp, j)) return j;
    }
    return i;
  }
  const svarer = (sp) => neste(sp, sp.melding ? sp.melding.av : sp.tur);
  const forrigeV = (sp) => (sp.melding ? sp.melding.v : null);

  function rull(sp, kast) {
    if (sp.fase !== "rist" || sp.vinner != null) return false;
    sp.kast = [kast[0], kast[1]];
    sp.fase = "skjult";
    sp.valgt = null;
    sp.steg++;
    return true;
  }
  function meld(sp, v) {
    if (sp.fase !== "skjult" || !lovlige(forrigeV(sp), sp.felles).includes(v)) return false;
    if (!erSann(sp.kast, v)) sp.tall[sp.tur].blof++;
    sp.melding = { v, av: sp.tur };
    sp.kjede.push({ v, av: sp.tur });
    sp.valgt = null;
    sp.fase = "svar";
    sp.steg++;
    return true;
  }
  function tap(sp, i, n) {
    const for0 = sp.liv[i];
    sp.liv[i] = Math.max(0, for0 - n);
    if (for0 > 0 && sp.liv[i] === 0) {
      sp.ute.push(i);
      sp.uteRunde[i] = sp.runde;
    }
  }
  function etterTap(sp, taper) {
    const rest = igjen(sp);
    if (rest.length === 1) sp.vinner = rest[0];
    sp.starter = inne(sp, taper) ? taper : neste(sp, taper);
    sp.fase = "resultat";
    sp.steg++;
  }
  // «Tror det»: the next player takes the cup and must beat it. A believed «Fellesrunde» ends the round.
  function tro(sp) {
    if (sp.fase !== "svar" || !sp.melding || sp.melding.v === MEYER) return false;
    const m = sp.melding;
    const s = svarer(sp);
    if (!erSann(sp.kast, m.v)) sp.tall[m.av].hjem++;
    if (m.v === FELLES) {
      sp.utfall = { type: "felles", av: m.av, svarer: s, v: m.v };
      sp.starter = s;
      sp.fase = "resultat";
      sp.steg++;
      return true;
    }
    sp.tur = s;
    sp.kast = null;
    sp.fase = "rist";
    sp.steg++;
    return true;
  }
  // «Løgn!»: lift the cup. Wrong caller or caught bluffer loses a life; two when Meyer was said.
  function loft(sp) {
    if (sp.fase !== "svar" || !sp.melding) return false;
    const m = sp.melding;
    const s = svarer(sp);
    const sann = erSann(sp.kast, m.v);
    const taper = sann ? s : m.av;
    const n = m.v === MEYER ? 2 : 1;
    sp.tall[s].loft++;
    if (!sann) {
      sp.tall[s].treff++;
      sp.tall[m.av].avslort++;
    }
    tap(sp, taper, n);
    sp.utfall = { type: "loft", sann, taper, tap: n, av: m.av, svarer: s, v: m.v, kast: sp.kast.slice(), ute: !inne(sp, taper) };
    etterTap(sp, taper);
    return true;
  }
  // After Meyer: give in without lifting — one life instead of risking two.
  function godta(sp) {
    if (sp.fase !== "svar" || !sp.melding || sp.melding.v !== MEYER) return false;
    const m = sp.melding;
    const s = svarer(sp);
    if (!erSann(sp.kast, m.v)) sp.tall[m.av].hjem++;
    tap(sp, s, 1);
    sp.utfall = { type: "godta", taper: s, tap: 1, av: m.av, svarer: s, v: m.v, ute: !inne(sp, s) };
    etterTap(sp, s);
    return true;
  }
  function nyRunde(sp) {
    if (sp.fase !== "resultat" || sp.vinner != null) return false;
    sp.runde++;
    sp.tur = sp.starter != null && inne(sp, sp.starter) ? sp.starter : neste(sp, sp.tur);
    sp.melding = null;
    sp.kjede = [];
    sp.kast = null;
    sp.valgt = null;
    sp.utfall = null;
    sp.fase = "rist";
    sp.steg++;
    return true;
  }
  // Places: the winner, then the others by lives left, then the last to go out first.
  function rangering(sp) {
    const plass = sp.liv.map((liv, i) => ({ i, liv, ut: sp.ute.indexOf(i) }));
    return plass.sort((a, b) => (b.i === sp.vinner) - (a.i === sp.vinner) || b.liv - a.liv || b.ut - a.ut);
  }

  // ---------- The phone's choices ----------
  // How the phone thinks, by level: how often it bluffs with a good roll, how far above the last
  // value it bluffs, how often it bluffs «Fellesrunde», and how much noise there is in its doubts.
  const NIV = {
    lett: { blof: 0.05, steg: 4, felles: 0.12, stoy: 0.25 },
    middels: { blof: 0.12, steg: 2, felles: 0.08, stoy: 0.1 },
    vanskelig: { blof: 0.18, steg: 3, felles: 0.06, stoy: 0.03 },
  };

  function robotMelding(kast, forrige, felles, nivaa, rnd) {
    const N = NIV[nivaa] || NIV.middels;
    const lov = lovlige(forrige, felles);
    if (!lov.length) return null;
    const e = verdi(kast[0], kast[1]);
    const ekte = felles && e === "32" ? FELLES : e;
    const rangert = lov.filter((v) => v !== FELLES).reverse(); // lowest first
    if (lov.includes(ekte)) {
      if (ekte === FELLES) return rnd() < 0.85 || !rangert.length ? FELLES : rangert[0];
      // A weak true value is sometimes pushed a little higher.
      if (rangert.length > 1 && pMinst(ekte) > 0.5 && rnd() < N.blof) {
        const i = rangert.indexOf(ekte);
        return rangert[Math.min(rangert.length - 1, i + 1 + Math.floor(rnd() * 2))];
      }
      return ekte;
    }
    if (felles && (rnd() < N.felles || !rangert.length)) return FELLES;
    if (!rangert.length) return lov[0];
    return rangert[Math.min(rangert.length - 1, Math.floor(rnd() * N.steg))];
  }

  // How likely is it that `v` is true, said after `forrige`? People tell the truth with what they
  // rolled (or a bit less), and bluff just above the last value when they could not beat it.
  function pSann(v, forrige, felles) {
    if (v === FELLES) {
      const a = 2 / 36;
      return a / (a + (1 - pOver(forrige)) * 0.12 + 0.02);
    }
    const lov = lovlige(forrige, felles).filter((x) => x !== FELLES).reverse();
    const k = Math.max(0, lov.indexOf(v));
    const q = k < 3 ? [0.35, 0.2, 0.12][k] : 0.33 / Math.max(1, lov.length - 3);
    const kunneIkke = forrige ? 1 - pOver(forrige) : 0.08;
    const sannV = odds(v) / 36 + 0.3 * pOver(v) * q;
    const blofV = kunneIkke * q;
    return sannV / (sannV + blofV);
  }

  // "loft" (Løgn!), "tro" or — only after Meyer — "godta".
  function robotSvar(v, forrige, felles, nivaa, rnd) {
    const N = NIV[nivaa] || NIV.middels;
    const stoy = (rnd() * 2 - 1) * N.stoy;
    if (v === MEYER) {
      const p = nivaa === "lett" ? 0.5 + stoy * 2 : pSann(v, forrige, felles) + stoy;
      return 2 * p < 1 ? "loft" : "godta";
    }
    if (v === FELLES) {
      // Believing costs nobody anything; only a sharp player lifts an unlikely one.
      if (nivaa === "vanskelig") return pSann(v, forrige, felles) < 0.3 ? "loft" : "tro";
      return rnd() < (nivaa === "lett" ? 0.08 : 0.15) ? "loft" : "tro";
    }
    if (nivaa === "lett") {
      const p = pMinst(v);
      return rnd() < (1 - p) * 0.6 ? "loft" : "tro";
    }
    const p = nivaa === "vanskelig" ? pSann(v, forrige, felles) : pMinst(v) * 0.8;
    const troRisiko = (1 - pOver(v)) * 0.6; // must beat it, and a forced bluff may be caught
    return p + stoy < troRisiko ? "loft" : "tro";
  }

  const Regler = { RANG, MEYER, LILLE, FELLES, NIVAER, verdi, styrke, slar, navn, strek, lovlige, erSann, pMinst, pOver, pSann, nytt, rull, meld, tro, loft, godta, nyRunde, neste, svarer, igjen, rangering, robotMelding, robotSvar };
  window.RusjMeyer = Regler;

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  // ---------- The page ----------

  const esc = R.esc;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const terning = () => 1 + Math.floor(tilfeldig() * 6);
  // Every text goes through R.t (rusj/SPRAK.md): the key is the Norwegian text.
  const ROBOTER = [R.t("Robo"), R.t("Bipp"), R.t("Bopp")];
  const NIVANAVN = { lett: R.t("Lett"), middels: R.t("Middels"), vanskelig: R.t("Vanskelig") };
  const erRobot = (sp, i) => i >= sp.mennesker;
  const navnFor = (sp, i) => (erRobot(sp, i) ? ROBOTER[i - sp.mennesker] || ROBOTER[0] : R.navn(i));
  const avatarFor = (sp, i, st) =>
    erRobot(sp, i) ? `<span class="avatar my-robot ${st || ""}" style="--pf: var(--p${(i % 20) + 1})" aria-hidden="true">🤖</span>` : R.avatar(i, st);

  let H;
  let robotId = null;
  let robotSteg = -1; // the step the phone's pending move belongs to
  let rister = false; // the cup is shaking
  let animerSteg = -1; // the step whose result should be animated (not after a reload)

  // ---------- Dice ----------
  // Flat faces (tiles, lives, rules) and CSS cubes as in Terninga for the dice under the cup.
  const PUNKT = {
    1: [[50, 50]],
    2: [[71, 29], [29, 71]],
    3: [[71, 29], [50, 50], [29, 71]],
    4: [[29, 29], [71, 29], [29, 71], [71, 71]],
    5: [[29, 29], [71, 29], [50, 50], [29, 71], [71, 71]],
    6: [[29, 27], [71, 27], [29, 50], [71, 50], [29, 73], [71, 73]],
  };
  const ansikt = (n, klasse) =>
    `<svg class="${klasse || "my-ansikt"}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect x="7" y="7" width="86" height="86" rx="22" fill="#fffaf2" stroke="#170e2b" stroke-width="8"/>${(PUNKT[n] || [])
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 13 : 9.5}" fill="${n === 1 ? "#e3364f" : "#170e2b"}"/>`)
      .join("")}</svg>`;
  const par = (v) => ojne(v).map((n) => ansikt(n)).join("");

  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const SIDE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const KUBE = [1, 2, 3, 4, 5, 6].map((n) => `<span class="my-side s${n}">${PIPS[n].map((p) => `<i class="p${p}"></i>`).join("")}</span>`).join("");
  const pose = (v, z, tx, ty) => `rotateX(-21deg) rotateY(12deg) rotateZ(${z}deg) rotateX(${SIDE[v][0] + 360 * (tx || 0)}deg) rotateY(${SIDE[v][1] + 360 * (ty || 0)}deg)`; // sprak-ok
  const kube = (v, z, klasse) =>
    `<span class="my-t ${klasse || ""}" aria-hidden="true"><span class="my-skygge"></span><span class="my-hopp"><span class="my-kube" style="transform: ${pose(v, z)}">${KUBE}</span></span></span>`;
  const kuber = (kast) => `<span class="my-terninger">${kube(kast[0], -9)}${kube(kast[1], 11)}</span>`;

  // The leather cup, upside down on the felt.
  const BEGER = `<svg class="my-beger-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <path d="M18 112 L32 16 Q60 6 88 16 L102 112 Q60 122 18 112Z" fill="#7a2338" stroke="#170e2b" stroke-width="5" stroke-linejoin="round"/>
    <path d="M22 88 Q60 98 98 88 L101 106 Q60 116 19 106Z" fill="#a9364f"/>
    <path d="M30 30 Q60 22 90 30 L92 42 Q60 34 28 42Z" fill="#a9364f"/>
    <path d="M24 86 Q60 96 96 86M30 44 Q60 36 90 44" fill="none" stroke="#ffd23f" stroke-width="2.5" stroke-dasharray="4 5" stroke-linecap="round"/>
    <path d="M40 50 L34 84" stroke="rgba(255,241,221,.35)" stroke-width="6" stroke-linecap="round"/>
    <ellipse cx="60" cy="15" rx="26" ry="6" fill="#5c1a2b" stroke="#170e2b" stroke-width="4"/>
  </svg>`;

  // Lives: a die that shows how many are left (as when Meyer is played round a table).
  const livTerning = (sp, i) =>
    sp.liv[i] > 0
      ? ansikt(Math.min(6, sp.liv[i]), "my-liv-terning")
      : `<svg class="my-liv-terning ute" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect x="7" y="7" width="86" height="86" rx="22" fill="none" stroke="currentColor" stroke-width="8" stroke-dasharray="14 10"/><path d="M34 34 L66 66M66 34 L34 66" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>`;

  // Sounds as in Terninga: a rattle in the cup and a woody clack.
  function rasle(n = 7) {
    for (let k = 0; k < n; k++) R.lyd.stoy(k * 0.034 + Math.random() * 0.012, 0.024, 0.08 + Math.random() * 0.07, 2600 + Math.random() * 2800);
  }
  function klakk(t, styrke) {
    R.lyd.stoy(t, 0.04, 0.3 * styrke, 1300 + Math.random() * 700);
    R.lyd.tone(160 + Math.random() * 80, t, 0.07, "triangle", 0.15 * styrke, 105);
  }

  // ---------- Pieces of the screen ----------

  function livRad(sp, aktiv) {
    return `<ol class="my-liv" aria-label="${esc(R.t("Liv igjen"))}">${sp.liv
      .map((liv, i) => {
        const ute = liv <= 0;
        return `<li class="${i === aktiv ? "na" : ""}${ute ? " ute" : ""}" style="--pf: var(--p${(i % 20) + 1})"${i === aktiv ? ' aria-current="true"' : ""}>
          ${avatarFor(sp, i)}<span class="my-liv-navn">${esc(navnFor(sp, i))}</span>${livTerning(sp, i)}<span class="vh">: ${esc(ute ? R.t("ute") : R.flertall(liv, "liv", "liv"))}</span>
        </li>`;
      })
      .join("")}</ol>`;
  }

  function meldingKort(sp, m, o = {}) {
    return `<div class="my-melding${o.klasse ? " " + o.klasse : ""}">
      <p class="my-melding-hvem">${avatarFor(sp, m.av)}<span>${esc(R.t("{navn} sier", { navn: navnFor(sp, m.av) }))}</span></p>
      <p class="my-melding-verdi"><span class="my-melding-par">${par(m.v)}</span><b>${esc(navn(m.v))}</b></p>
      ${m.v !== FELLES && navn(m.v) !== m.v ? `<p class="my-melding-sub">${esc(strek(m.v))}</p>` : ""}
    </div>`;
  }

  function kjedeHtml(sp) {
    if (sp.kjede.length < 2) return "";
    const tidligere = sp.kjede.slice(0, -1).slice(-4);
    return `<p class="my-kjede"><span class="vh">${esc(R.t("Sagt før i runden:"))} </span>${tidligere
      .map((k) => `<span>${esc(navnFor(sp, k.av))} <b>${esc(k.v === FELLES ? navn(FELLES) : strek(k.v))}</b></span>`)
      .join('<i aria-hidden="true">→</i>')}</p>`;
  }

  function maaSla(sp) {
    const f = forrigeV(sp);
    if (!f) return `<p class="my-maal">${esc(R.t("Ny runde – du begynner og kan si hva du vil."))}</p>`;
    return `<p class="my-maal">${esc(R.t("Du må slå"))} <b>${esc(navn(f))}</b>${navn(f) !== f ? ` <span>(${esc(strek(f))})</span>` : ""}</p>`;
  }

  function begerBrett(sp, o = {}) {
    const klasse = ["my-brett", o.rister ? "rister" : "", o.kikker ? "kikker" : "", o.loftet ? "loftet" : "", o.anim ? "anim" : ""].filter(Boolean).join(" ");
    return `<div class="${klasse}" id="my-brett">
      ${o.kast ? kuber(o.kast) : ""}
      <span class="my-beger">${BEGER}</span>
      ${o.stempel || ""}
    </div>`;
  }

  function valgGrid(sp) {
    const lov = lovlige(forrigeV(sp), sp.felles);
    const rangert = lov.filter((v) => v !== FELLES);
    return `<div class="my-valg" role="group" aria-label="${esc(R.t("Hva sier du?"))}">
      ${rangert
        .map((v) => {
          const spes = navn(v) !== v;
          return `<button data-h="velg" class="my-valg-knapp${spes ? " spes" : ""}${v === MEYER ? " meyer" : ""}" data-v="${v}" aria-pressed="${sp.valgt === v}" aria-label="${esc(spes ? `${navn(v)}, ${strek(v)}` : v)}">
            <span class="my-valg-par">${par(v)}</span><b>${esc(spes ? navn(v) : v)}</b>
          </button>`;
        })
        .join("")}
      ${lov.includes(FELLES) ? `<button class="my-valg-knapp felles" data-h="velg" data-v="F" aria-pressed="${sp.valgt === FELLES}" aria-label="${esc(navn(FELLES))}, 3-2"><span class="my-valg-par">${par(FELLES)}</span><b>${esc(navn(FELLES))}</b><small>${esc(R.t("3-2 · ingen mister liv"))}</small></button>` : ""}
    </div>`;
  }

  function resultatTekst(sp) {
    const u = sp.utfall;
    if (!u) return { tittel: "", tekst: "" };
    const a = navnFor(sp, u.av);
    const s = navnFor(sp, u.svarer);
    if (u.type === "felles") return { tittel: R.t("Fellesrunde!"), tekst: R.t("{navn} trodde på det. Ingen mister liv – ny runde.", { navn: s }) };
    const t = navnFor(sp, u.taper);
    const ute = u.ute ? " " + R.t("{navn} er ute!", { navn: t }) : "";
    if (u.type === "godta") return { tittel: R.t("{navn} godtar Meyer", { navn: s }), tekst: R.t("{navn} mister ett liv uten å løfte.", { navn: s }) + ute };
    const ub = (v) => strek(v).replace("-", "\u2011"); // never split 3-1 over two lines
    const hadde = ub(verdi(u.kast[0], u.kast[1]));
    // «… mister to liv» / «… mister ett liv»
    const mister = (navn) => (u.tap === 2 ? R.t("{navn} mister to liv.", { navn }) : R.t("{navn} mister ett liv.", { navn }));
    if (u.sann) return { tittel: R.t("Det var sant!"), tekst: `${R.t("{navn} hadde {kast}.", { navn: a, kast: hadde })} ${mister(s)}${ute}` };
    return { tittel: R.t("Bløff!"), tekst: `${R.t("{navn} sa {sa}, men hadde {kast}.", { navn: a, sa: u.v === FELLES ? navn(FELLES) : ub(u.v), kast: hadde })} ${mister(a)}${ute}` };
  }

  // ---------- Statistics on this phone (names only, never sent anywhere) ----------

  function lagreStat(S) {
    const sp = S.spill;
    if (!sp || sp.registrert) return;
    sp.registrert = true;
    const rang = rangering(sp);
    const folk = rang.filter((r) => !erRobot(sp, r.i));
    if (!S.stat || typeof S.stat !== "object") S.stat = {};
    for (const r of folk) {
      const n = R.kutt(R.navn(r.i), 16);
      const st = S.stat[n] || (S.stat[n] = { spill: 0, seirer: 0, blof: 0, hjem: 0 });
      st.spill++;
      if (r.i === sp.vinner) st.seirer++;
      st.blof += sp.tall[r.i].blof;
      st.hjem += sp.tall[r.i].hjem;
    }
    const navnene = Object.keys(S.stat);
    if (navnene.length > 40) for (const n of navnene.sort((a, b) => S.stat[a].spill - S.stat[b].spill).slice(0, navnene.length - 40)) delete S.stat[n];
    if (sp.vinner != null) S.sist = { navn: navnFor(sp, sp.vinner), robot: erRobot(sp, sp.vinner) };
    if (folk.length >= 2) R.kveld.registrer(folk.map((r, k) => ({ i: r.i, poeng: folk.length - k })));
    R.statistikk("ferdig", { spillere: sp.mennesker, roboter: sp.antall - sp.mennesker, runder: sp.runde, robot: sp.vinner != null && erRobot(sp, sp.vinner) });
  }

  function statHtml(S) {
    const stat = S.stat || {};
    const best = Object.entries(stat)
      .filter(([, s]) => s.hjem > 0)
      .sort((a, b) => b[1].hjem - a[1].hjem || b[1].seirer - a[1].seirer)
      .slice(0, 3);
    const linjer = [];
    if (best.length) {
      const [n, s] = best[0];
      linjer.push(`<li><span aria-hidden="true">🎭</span> <span><b>${esc(R.t("Beste bløffer:"))}</b> ${esc(R.t("{navn} – {antall} gikk hjem", { navn: n, antall: R.flertall(s.hjem, "bløff", "bløffer") }))}</span></li>`);
      if (best.length > 1) linjer.push(`<li class="my-stat-rest"><span aria-hidden="true"></span> <span>${esc(R.t("Så: {navn}", { navn: R.ramsOpp(best.slice(1).map(([m, t]) => `${m} (${t.hjem})`)) }))}</span></li>`);
    }
    if (S.sist && S.sist.navn) linjer.push(`<li><span aria-hidden="true">🏆</span> <span><b>${esc(R.t("Sist:"))}</b> ${esc(S.sist.robot ? R.t("{navn} vant – mobilen tok den", { navn: S.sist.navn }) : R.t("{navn} vant", { navn: S.sist.navn }))}</span></li>`);
    if (!linjer.length) return "";
    return `<section class="my-stat" aria-label="${esc(R.t("Statistikk på denne mobilen"))}"><p class="etikett">${esc(R.t("På denne mobilen"))}</p><ul>${linjer.join("")}</ul></section>`;
  }

  // ---------- Rules sheet ----------

  const rangTabell = () => `
    <h3>${esc(R.t("Rangeringen – fra høyest til lavest"))}</h3>
    <p class="hjelp">${esc(R.t("Den høyeste terningen sies først: 4 og 6 er 64. Like verdier er like gode, uansett hvilken terning som viser hva."))}</p>
    <ol class="my-rang">
      ${RANG.map(
        (v) =>
          `<li><span class="my-rang-par">${par(v)}</span><b>${esc(navn(v) !== v ? navn(v) : v)}</b><span>${esc(
            v === MEYER ? R.t("Høyest. Løftes den, mister taperen to liv") : v === LILLE ? R.t("Nest høyest") : v === "66" ? R.t("Så parene, seksere til enere") : v === "65" ? R.t("Så resten, høyeste terning først") : v === "32" ? R.t("Lavest – eller Fellesrunde") : navn(v) !== v ? strek(v) : "",
          )}</span></li>`,
      ).join("")}
    </ol>
    <h3>${esc(R.t("Fellesrunde (kan slås av)"))}</h3>
    <p class="hjelp">${esc(R.t("Slår du 3-2, kan du si «Fellesrunde» – når som helst i runden. Tror neste på det, mister ingen liv, og en ny runde begynner. Det kan også være en bløff – og da kan den løftes."))}</p>`;

  const REGLER = {
    intro: R.t("Rist begeret, kikk i hemmelighet og si et tall som slår det forrige – sant eller bløff. Den som tar feil, mister et liv."),
    steg: [
      [R.t("Rist og kikk"), R.t("Rist begeret og hold fingeren på kortet for å se terningene. Bare du ser dem.")],
      [R.t("Si noe som slår det forrige"), R.t("Velg hva du sier fra lista. Det kan være sant – eller en bløff. Så går mobilen videre.")],
      [R.t("Tror det eller «Løgn!»"), R.t("Neste tror det (og må slå det) eller roper «Løgn!». Da løftes begeret: tok du feil, mister du et liv. Sist med liv igjen vinner.")],
    ],
    tips: [
      R.t("Det er sant hvis terningene viser det som ble sagt – eller bedre."),
      R.t("Etter Meyer kan ingen slå det: løft (taperen mister to liv) eller godta Meyer og mist ett."),
      R.t("Taperen begynner neste runde. Alle har seks liv – terningen ved navnet viser hvor mange som er igjen."),
      R.t("Når du tror på det forrige, slår du nye terninger. Du trenger ikke kikke før du sier noe."),
    ],
    ekstraHtml: rangTabell(),
  };

  // ---------- Setup ----------

  const MAKS = 10;
  function motMobilenHtml(S) {
    const folk = R.klamp(Number(S.antall) || 1, 1, MAKS);
    const maks = Math.min(3, MAKS - folk);
    const r = Math.min(S.oppsett.roboter, maks);
    return `<section class="seksjon">
      <div class="seksjon-hode"><h2>${esc(R.t("Mot mobilen"))}</h2><span class="tall">${esc(r ? R.t("{antall} i alt", { antall: R.flertall(folk + r, "spiller", "spillere") }) : R.t("Av"))}</span></div>
      ${R.ui.seg("roboter", [[0, R.t("Ingen")], [1, "1"], [2, "2"], [3, "3"]], r, { etikett: R.t("Hvor mange spillere mobilen er"), av: (v) => Number(v) > maks })}
      ${r ? R.ui.seg("nivaa", NIVAER.map((n) => [n, NIVANAVN[n]]), S.oppsett.nivaa, { etikett: R.t("Hvor flink mobilen er") }) : ""}
      <p class="hjelp">${r ? `${esc(R.t("Mobilen spiller som {navn}", { navn: R.ramsOpp(ROBOTER.slice(0, r)) }))} 🤖 – ${esc({ lett: R.t("tror på det meste og bløffer vilt"), middels: R.t("regner litt og bløffer av og til"), vanskelig: R.t("regner på sjansene og er vanskelig å lure") }[S.oppsett.nivaa])}.` : esc(R.t("Få nok? Legg til spillere som mobilen styrer."))}</p>
    </section>`;
  }

  function nyttSpill(S) {
    const folk = R.klamp(Number(S.antall) || 2, 1, MAKS);
    const roboter = R.klamp(Number(S.oppsett.roboter) || 0, 0, Math.min(3, MAKS - folk));
    if (folk + roboter < 2) return false;
    const sp = nytt({ antall: folk + roboter, mennesker: folk, liv: S.oppsett.liv, felles: S.oppsett.felles, nivaa: S.oppsett.nivaa, starter: Math.floor(tilfeldig() * folk) });
    S.spill = sp;
    rister = false;
    animerSteg = -1;
    R.statistikk("start", { spillere: folk, roboter, liv: sp.maksLiv, felles: sp.felles });
    return true;
  }

  // ---------- The phone's turn ----------

  function stoppRobot() {
    clearTimeout(robotId);
    robotId = null;
    robotSteg = -1;
  }
  const tempo = (ms) => (R.rolig() ? Math.round(ms * 0.6) : ms);

  function driv() {
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || S.skjerm !== "spill" || rister) return;
    if (robotId && robotSteg === sp.steg) return; // already planned
    stoppRobot();
    let ms = 0;
    let steg = null;
    const folkInne = igjen(sp).some((i) => !erRobot(sp, i));
    if (sp.fase === "rist" && erRobot(sp, sp.tur)) {
      ms = 1000;
      steg = () => H.rist(null, null, R.S, true);
    } else if (sp.fase === "skjult" && erRobot(sp, sp.tur)) {
      ms = 1500;
      steg = () => {
        const v = robotMelding(sp.kast, forrigeV(sp), sp.felles, sp.nivaa, tilfeldig);
        if (v) gjorMelding(sp, v);
      };
    } else if (sp.fase === "svar" && erRobot(sp, svarer(sp))) {
      ms = 1700;
      steg = () => {
        const kjede = sp.kjede;
        const forrige = kjede.length > 1 ? kjede[kjede.length - 2].v : null;
        const valg = robotSvar(sp.melding.v, forrige, sp.felles, sp.nivaa, tilfeldig);
        svar(sp, valg);
      };
    } else if (sp.fase === "resultat" && sp.vinner == null && !folkInne) {
      ms = 2600; // nobody left to press «Ny runde»: the phone plays on by itself
      steg = () => H.runde(null, null, R.S);
    }
    if (!steg) return;
    if (R.arkApent()) ms = Math.max(ms, 600);
    robotSteg = sp.steg;
    robotId = setTimeout(() => {
      robotId = null;
      if (R.S.spill !== sp || robotSteg !== sp.steg || R.S.skjerm !== "spill") return;
      if (R.arkApent()) {
        robotSteg = -1;
        robotId = setTimeout(driv, 400);
        return;
      }
      robotSteg = -1;
      steg();
    }, tempo(ms));
  }

  function gjorMelding(sp, v) {
    if (!meld(sp, v)) return false;
    R.lyd.pop();
    R.vibrer(10);
    const s = svarer(sp);
    R.si(R.t("{navn} sier {verdi}.", { navn: navnFor(sp, sp.melding.av), verdi: navn(v) }) + (erRobot(sp, s) ? "" : " " + R.t("Gi mobilen til {navn}.", { navn: navnFor(sp, s) })));
    R.vis();
    return true;
  }

  function svar(sp, valg) {
    const s = svarer(sp);
    if (valg === "tro") {
      const v = sp.melding.v;
      if (!tro(sp)) return;
      R.lyd.klikk();
      if (sp.fase === "resultat") {
        R.lyd.pling();
        R.si(R.t("{navn} tror det. Fellesrunde – ingen mister liv.", { navn: navnFor(sp, s) }));
      } else R.si(R.t("{navn} tror på {verdi} og må slå det.", { navn: navnFor(sp, s), verdi: navn(v) }));
      if (erRobot(sp, s)) R.toast(R.t("{navn} tror det", { navn: navnFor(sp, s) }));
      R.vis();
      return;
    }
    const ok = valg === "godta" ? godta(sp) : loft(sp);
    if (!ok) return;
    animerSteg = sp.steg;
    if (erRobot(sp, s)) R.toast(valg === "godta" ? R.t("{navn} godtar Meyer", { navn: navnFor(sp, s) }) : R.t("{navn} roper «Løgn!»", { navn: navnFor(sp, s) }));
    R.vis();
    avslor(sp);
  }

  // The reveal: a drum roll while the cup lifts, then the verdict.
  function avslor(sp) {
    const u = sp.utfall;
    if (!u) return;
    const r = resultatTekst(sp);
    if (u.type === "loft") {
      R.lyd.trommevirvel(0.6);
      setTimeout(() => {
        klakk(0, 0.8);
        if (u.sann) R.lyd.feil();
        else R.lyd.riktig();
        R.vibrer(u.ute ? [60, 40, 160] : [30, 30, 60]);
        if (u.ute) setTimeout(() => R.lyd.bom(), 380);
      }, R.rolig() ? 100 : 820);
    } else {
      R.lyd.snu();
      if (u.ute) setTimeout(() => R.lyd.bom(), 300);
    }
    R.si(`${r.tittel} ${r.tekst}`);
  }

  // ---------- Start ----------

  const STANDARD = { roboter: 0, nivaa: "middels", liv: 6, felles: true };

  R.start({
    id: "meyer",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: Math.max(2, Math.min(MAKS, R.felles.navn.filter((n) => String(n || "").trim()).length || 3)),
      oppsett: Object.assign({}, STANDARD),
      stat: {},
      sist: null,
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({}, STANDARD, S.oppsett || {});
      S.oppsett.roboter = R.klamp(Number(S.oppsett.roboter) || 0, 0, 3);
      if (!NIVAER.includes(S.oppsett.nivaa)) S.oppsett.nivaa = "middels";
      S.oppsett.liv = [3, 6].includes(Number(S.oppsett.liv)) ? Number(S.oppsett.liv) : 6;
      S.oppsett.felles = S.oppsett.felles !== false;
      S.antall = R.klamp(Number(S.antall) || 2, 1, MAKS);
      if (!S.stat || typeof S.stat !== "object" || Array.isArray(S.stat)) S.stat = {};
      for (const n of Object.keys(S.stat)) {
        const s = S.stat[n];
        if (!s || typeof s !== "object" || !["spill", "seirer", "blof", "hjem"].every((k) => Number.isInteger(s[k]) && s[k] >= 0)) delete S.stat[n];
      }
      if (S.sist && typeof S.sist.navn !== "string") S.sist = null;
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const sete = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const terning = (x) => Number.isInteger(x) && x >= 1 && x <= 6;
        const ok =
          Number.isInteger(n) && n >= 2 && n <= MAKS &&
          Number.isInteger(sp.mennesker) && sp.mennesker >= 1 && sp.mennesker <= n &&
          Array.isArray(sp.liv) && sp.liv.length === n && sp.liv.every((l) => Number.isInteger(l) && l >= 0 && l <= 6) &&
          Array.isArray(sp.ute) && sp.ute.every(sete) &&
          Array.isArray(sp.tall) && sp.tall.length === n &&
          Array.isArray(sp.kjede) && sp.kjede.every((k) => k && sete(k.av) && (k.v === FELLES || RANG.includes(k.v))) &&
          sete(sp.tur) &&
          ["rist", "skjult", "svar", "resultat"].includes(sp.fase) &&
          (sp.kast == null || (Array.isArray(sp.kast) && sp.kast.length === 2 && sp.kast.every(terning))) &&
          (sp.fase === "rist" || sp.kast || sp.fase === "resultat") &&
          (sp.fase !== "svar" || (sp.melding && sete(sp.melding.av))) &&
          (sp.fase !== "resultat" || (sp.utfall && typeof sp.utfall.type === "string")) &&
          igjen(sp).length >= 1;
        if (!ok) S.spill = null;
        else {
          if (!NIVAER.includes(sp.nivaa)) sp.nivaa = "middels";
          if (!Array.isArray(sp.uteRunde) || sp.uteRunde.length !== n) sp.uteRunde = sp.liv.map(() => 0);
          if (!Number.isInteger(sp.steg)) sp.steg = 0;
          if (sp.valgt != null && !lovlige(forrigeV(sp), sp.felles).includes(sp.valgt)) sp.valgt = null;
          if (sp.vinner == null && igjen(sp).length === 1) sp.vinner = igjen(sp)[0];
        }
      }
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = S.spill ? "spill" : "hjem";
    },

    regler: REGLER,

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "skjult" || !sp.kast || erRobot(sp, sp.tur)) return { html: "" };
        const e = verdi(sp.kast[0], sp.kast[1]);
        const v = sp.felles && e === "32" ? FELLES : e;
        const spes = navn(v) !== v;
        return {
          html: `${kuber(sp.kast)}<div class="my-bak-tekst"><p class="etikett">${esc(R.t("Du slo"))}</p><p class="my-bak-verdi">${esc(spes ? navn(v) : v)}</p>${spes && v !== FELLES ? `<p class="my-bak-sub">${esc(strek(v))}</p>` : v === FELLES ? `<p class="my-bak-sub">${esc(R.t("3-2 – du kan si Fellesrunde"))}</p>` : ""}</div>`,
          klasse: "my-bak",
          si: R.t("Du slo {a} og {b}: {verdi}.", { a: sp.kast[0], b: sp.kast[1], verdi: spes ? navn(v) : v }),
        };
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Rist, kikk – og si noe som slår det."))}<br><em>${esc(R.t("Sant eller bløff?"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: pagar(S),
                fortsettTekst: pagar(S) ? (sp.vinner != null ? R.t("Fortsett · se kåringen") : R.t("Fortsett · runde {n}", { n: sp.runde })) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [],
            }) +
            statHtml(S) +
            R.ui.merker([
              ["2–10", R.t("spillere")],
              ["6", R.t("liv")],
              ["0", R.t("reklame")],
            ])
          );
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          ${R.ui.spillere({
            min: 1,
            max: Math.max(1, MAKS - S.oppsett.roboter),
            tittel: R.t("Hvem spiller?"),
            hjelp: (S.antall || 1) > 1 ? R.t("Send mobilen videre når du har sagt ditt.") : R.t("Alene? Spill mot mobilen."),
          })}
          ${motMobilenHtml(S)}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Liv"))}</h2><span class="tall">${esc(R.t("{antall} hver", { antall: R.flertall(S.oppsett.liv, "liv", "liv") }))}</span></div>
            ${R.ui.seg("liv", [[3, R.t("3 · kjapt")], [6, R.t("6 · vanlig")]], S.oppsett.liv, { etikett: R.t("Hvor mange liv hver spiller har") })}
          </section>
          <section class="seksjon">
            ${R.ui.bryter("felles", S.oppsett.felles, navn(FELLES), R.t("Slår du 3-2, kan du si «Fellesrunde»: ingen mister liv, og runden starter på nytt."))}
          </section>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🎲" }))}`,
      },

      spill: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.runde }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
          const regler = R.ui.lenke(R.t("Rangeringen"), "regler");
          // ----- Roll -----
          if (sp.fase === "rist") {
            const robot = erRobot(sp, sp.tur);
            const f = forrigeV(sp);
            return `
              ${livRad(sp, sp.tur)}
              <div class="my-hode">
                ${avatarFor(sp, sp.tur, "mid")}
                <div><p class="etikett">${esc(robot ? `${R.t("Mobilen")} · ${NIVANAVN[sp.nivaa]}` : f ? R.t("Du tror det – din tur") : R.t("Din tur"))}</p><h1 id="skjerm-tittel">${esc(navnFor(sp, sp.tur))}</h1></div>
              </div>
              ${robot ? `<p class="my-maal">${f ? `${esc(R.t("{navn} må slå", { navn: navnFor(sp, sp.tur) }))} <b>${esc(navn(f))}</b>` : esc(R.t("{navn} begynner runden", { navn: navnFor(sp, sp.tur) }))}</p>` : maaSla(sp)}
              ${kjedeHtml(sp)}
              ${begerBrett(sp, { rister })}
              ${R.ui.dokk(
                robot ? R.ui.knapp(R.t("{navn} rister …", { navn: navnFor(sp, sp.tur) }), "rist", { variant: "stor", av: true, ikon: "🤖" }) : R.ui.knapp(R.t("Rist begeret"), "rist", { variant: "stor", ikon: "🎲", av: rister }),
                R.ui.lenkerad(regler, avslutt),
              )}`;
          }
          // ----- Peek and say something -----
          if (sp.fase === "skjult") {
            if (erRobot(sp, sp.tur)) {
              return `
                ${livRad(sp, sp.tur)}
                <div class="my-hode">${avatarFor(sp, sp.tur, "mid")}<div><p class="etikett">${esc(`${R.t("Mobilen")} · ${NIVANAVN[sp.nivaa]}`)}</p><h1 id="skjerm-tittel">${esc(navnFor(sp, sp.tur))}</h1></div></div>
                <p class="my-maal">${esc(R.t("{navn} kikker under begeret …", { navn: navnFor(sp, sp.tur) }))}</p>
                ${kjedeHtml(sp)}
                ${begerBrett(sp, { kikker: true })}
                ${R.ui.dokk(R.ui.knapp(R.t("{navn} tenker …", { navn: navnFor(sp, sp.tur) }), "meld", { variant: "stor", av: true, ikon: "🤖" }), R.ui.lenkerad(regler, avslutt))}`;
            }
            const v = sp.valgt;
            return `
              <div class="my-hode kompakt">
                ${avatarFor(sp, sp.tur)}
                <div><p class="etikett">${esc(navnFor(sp, sp.tur))} · ${esc(R.t("bare du ser"))}</p><h1 id="skjerm-tittel">${esc(R.t("Hva sier du?"))}</h1></div>
              </div>
              <div class="my-titt">${R.ui.mappe({ id: "kast", etikett: R.t("Under begeret"), tekst: R.t("Hold fingeren på kortet for å se"), etikettAria: R.t("Under begeret. Hold fingeren på kortet for å se terningene dine") })}</div>
              ${maaSla(sp)}
              ${valgGrid(sp)}
              ${R.ui.dokk(
                R.ui.knapp(v ? R.t("Si {verdi}", { verdi: navn(v) }) : R.t("Velg hva du sier"), "meld", { variant: "stor", av: !v, ikon: v ? "📣" : "" }),
                R.ui.lenkerad(regler, avslutt),
              )}`;
          }
          // ----- Believe it or call «Løgn!» -----
          if (sp.fase === "svar") {
            const s = svarer(sp);
            const robot = erRobot(sp, s);
            const m = sp.melding;
            const knapper = robot
              ? R.ui.knapp(R.t("{navn} tenker …", { navn: navnFor(sp, s) }), "tro", { variant: "stor", av: true, ikon: "🤖" })
              : m.v === MEYER
                ? `<div class="knapprad my-svar">${R.ui.knapp(R.t("Godta Meyer"), "godta", { variant: "papir", etikett: R.t("Godta Meyer og mist ett liv") })}${R.ui.knapp(R.t("Løgn!"), "loft", { variant: "rod", ikon: "✋" })}</div>`
                : `<div class="knapprad my-svar">${R.ui.knapp(R.t("Tror det"), "tro", { variant: "mynte", ikon: "👍" })}${R.ui.knapp(R.t("Løgn!"), "loft", { variant: "rod", ikon: "✋" })}</div>`;
            return `
              ${livRad(sp, s)}
              <div class="my-hode">
                ${avatarFor(sp, s, "mid")}
                <div><p class="etikett">${esc(robot ? `${R.t("Mobilen")} · ${NIVANAVN[sp.nivaa]}` : erRobot(sp, m.av) ? R.t("Din tur") : R.t("Gi mobilen til"))}</p><h1 id="skjerm-tittel">${esc(navnFor(sp, s))}</h1></div>
              </div>
              ${meldingKort(sp, m)}
              ${kjedeHtml(sp)}
              <p class="my-hint">${
                robot
                  ? esc(R.t("{navn} tenker på om det er sant …", { navn: navnFor(sp, s) }))
                  : m.v === MEYER
                    ? esc(R.t("Meyer kan ikke slås. Løft – taperen mister to liv – eller godta og mist ett."))
                    : m.v === FELLES
                      ? esc(R.t("Tror du det, mister ingen liv. Løgn? Løft begeret!"))
                      : esc(R.t("Tror du det, må du slå det. Tror du ikke, roper du «Løgn!»."))
              }</p>
              ${R.ui.dokk(knapper, R.ui.lenkerad(regler, avslutt))}`;
          }
          // ----- The result of the round -----
          const u = sp.utfall;
          const r = resultatTekst(sp);
          const anim = animerSteg === sp.steg && !R.rolig();
          const stempel =
            u.type === "loft" ? `<span class="stempel my-stempel ${u.sann ? "mynte" : ""}" aria-hidden="true">${esc(u.sann ? R.t("Sant!") : R.t("Bløff!"))}</span>` : u.type === "felles" ? `<span class="stempel my-stempel lampe" aria-hidden="true">${esc(navn(FELLES))}</span>` : "";
          const ferdig = sp.vinner != null;
          const folkInne = igjen(sp).some((i) => !erRobot(sp, i));
          return `
            ${livRad(sp, u.taper != null ? u.taper : -1)}
            <h1 id="skjerm-tittel" class="my-res-tittel">${esc(r.tittel)}</h1>
            ${u.type === "loft" ? `<p class="my-sa">${esc(R.t("{navn} sa", { navn: navnFor(sp, u.av) }))} <b>${esc(navn(u.v))}</b>${navn(u.v) !== u.v && u.v !== FELLES ? ` (${esc(strek(u.v))})` : ""}</p>` : ""}
            ${begerBrett(sp, { kast: u.type === "loft" ? u.kast : null, loftet: u.type === "loft", anim, stempel })}
            <p class="my-res-tekst${u.type === "loft" && u.ute ? " ute" : ""}" role="status">${esc(r.tekst)}</p>
            ${!ferdig ? `<p class="my-neste">${avatarFor(sp, sp.starter)}<span>${esc(R.t("{navn} begynner neste runde", { navn: navnFor(sp, sp.starter) }))}</span></p>` : ""}
            ${R.ui.dokk(
              ferdig
                ? R.ui.knapp(R.t("Til kåringen"), "kaaring", { variant: "stor", ikon: "🏆" })
                : folkInne
                  ? R.ui.knapp(R.t("Ny runde"), "runde", { variant: "stor", etikett: R.t("Ny runde – {navn} begynner", { navn: navnFor(sp, sp.starter) }) })
                  : R.ui.knapp(R.t("Mobilen spiller videre …"), "runde", { variant: "stor", av: true, ikon: "🤖" }),
              R.ui.lenkerad(regler, ferdig ? "" : avslutt),
            )}`;
        },
        etter() {
          driv();
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          rister = false;
          R.holdVaken();
          R.vedForlat(stoppRobot);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rang = rangering(sp);
          const ledere = sp.vinner != null ? [sp.vinner] : rang.filter((r) => r.liv === rang[0].liv).map((r) => r.i);
          const robotVant = ledere.every((i) => erRobot(sp, i));
          const etikett = (r) => (r.i === sp.vinner ? R.t("{antall} igjen", { antall: R.flertall(r.liv, "liv", "liv") }) : r.liv > 0 ? R.t("{antall} igjen", { antall: R.flertall(r.liv, "liv", "liv") }) : R.t("ute i runde {n}", { n: sp.uteRunde[r.i] }));
          // The kit's podium ranks by points: give places as points and write lives / round out on it.
          const rader = rang.map((r, k) => ({ i: r.i, poeng: rang.length - k, ...(erRobot(sp, r.i) ? { navn: navnFor(sp, r.i) } : {}) }));
          let pall = R.ui.pall(rader);
          const iPall = rader.slice(0, 3);
          const rekke = iPall.length >= 3 ? [iPall[1], iPall[0], iPall[2]] : [iPall[1], iPall[0]];
          let n = 0;
          pall = pall.replace(/<span class="poeng">[^<]*<\/span>/g, () => {
            const r = rekke[n++];
            return `<span class="poeng">${r ? esc(etikett(rang.find((x) => x.i === r.i))) : ""}</span>`;
          });
          for (let i = sp.mennesker; i < sp.antall; i++) pall = pall.split(R.avatar(i, "stor")).join(avatarFor(sp, i, "stor"));
          const liste = `<ol class="my-plasser">${rang
            .map((r, k) => {
              const t = sp.tall[r.i];
              return `<li class="${ledere.includes(r.i) ? "leder" : ""}"><span class="plass-nr">${k + 1}</span>${avatarFor(sp, r.i)}<span class="navn">${esc(navnFor(sp, r.i))}<small>${esc(etikett(r))}${t.hjem ? ` · ${esc(R.t("{antall} gikk hjem", { antall: R.flertall(t.hjem, "bløff", "bløffer") }))}` : ""}${t.treff ? ` · ${esc(R.t("avslørte {n}", { n: t.treff }))}` : ""}</small></span>${livTerning(sp, r.i)}</li>`;
            })
            .join("")}</ol>`;
          const tittel = ledere.length > 1 ? R.t("{navn} leder!", { navn: R.ramsOpp(ledere.map((i) => navnFor(sp, i))) }) : R.t("{navn} vinner!", { navn: navnFor(sp, ledere[0]) });
          const besteBlof = rang.slice().sort((a, b) => sp.tall[b.i].hjem - sp.tall[a.i].hjem)[0];
          const tekst = robotVant
            ? R.t("Mobilen vant denne gangen. Revansj?")
            : sp.vinner == null
              ? R.t("Spillet ble avsluttet før det var ferdig.")
              : sp.tall[besteBlof.i].hjem > 0
                ? R.t("Kveldens bløffer: {navn} – {antall} gikk hjem.", { navn: navnFor(sp, besteBlof.i), antall: R.flertall(sp.tall[besteBlof.i].hjem, "bløff", "bløffer") })
                : R.t("Godt jobba – ærlig spilt!");
          return `
            <div class="banner aksent">
              ${ledere.length === 1 ? `<span class="my-vinner">${avatarFor(sp, ledere[0], "gigant")}<span class="my-krone" aria-hidden="true">👑</span></span>` : R.ui.figur(null, { stemning: robotVant ? "lei" : "jubel" })}
              <p class="etikett">${esc(R.t("Kåringen"))}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${esc(tekst)}</p>
            </div>
            ${pall}
            <section class="seksjon"><h2>${esc(R.t("Slik gikk det"))}</h2>${liste}</section>
            ${R.ui.flereSpill({ antall: sp.mennesker })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const robotVant = sp.vinner != null && erRobot(sp, sp.vinner);
          if (sp.vinner != null && !robotVant) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else {
            R.lyd.pling();
          }
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("spill");
      },
      roboter(el, e, S) {
        S.oppsett.roboter = R.klamp(Number(el.dataset.v) || 0, 0, 3);
        S.antall = R.klamp(S.antall, 1, MAKS - S.oppsett.roboter);
        R.vis();
      },
      nivaa(el, e, S) {
        S.oppsett.nivaa = NIVAER.includes(el.dataset.v) ? el.dataset.v : "middels";
        R.vis();
      },
      liv(el, e, S) {
        S.oppsett.liv = Number(el.dataset.v) === 3 ? 3 : 6;
        R.vis();
      },
      felles(el, e, S) {
        S.oppsett.felles = !S.oppsett.felles;
        R.vis();
      },
      start(el, e, S) {
        if (!nyttSpill(S)) {
          R.toast(R.t("Dere må være minst to. Legg til en spiller – eller mobilen."));
          return;
        }
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        const sp = S.spill;
        if (sp) {
          S.antall = sp.mennesker;
          S.oppsett.roboter = sp.antall - sp.mennesker;
          S.oppsett.nivaa = sp.nivaa;
          S.oppsett.liv = sp.maksLiv;
          S.oppsett.felles = sp.felles;
        }
        if (!nyttSpill(S)) return R.gaTil("oppsett");
        R.gaTil("spill");
      },

      // Shake the cup (people press; the phone calls it with robot = true).
      async rist(el, e, S, robot) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "rist" || rister) return;
        if (erRobot(sp, sp.tur) !== !!robot) return;
        const steg = sp.steg;
        rister = true;
        stoppRobot();
        R.vis();
        rasle(8);
        setTimeout(() => rasle(6), 280);
        setTimeout(() => rasle(5), 560);
        R.vibrer([14, 50, 14, 50, 14]);
        await new Promise((ok) => setTimeout(ok, R.rolig() ? 200 : 900));
        rister = false;
        if (R.S.spill !== sp || sp.steg !== steg || R.S.skjerm !== "spill") return;
        rull(sp, [terning(), terning()]);
        klakk(0, 0.7);
        klakk(0.08, 0.4);
        if (!erRobot(sp, sp.tur)) R.si(R.t("Terningene ligger under begeret. Hold fingeren på kortet for å se."));
        R.vis();
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "skjult" || erRobot(sp, sp.tur)) return;
        const v = el.dataset.v;
        if (!lovlige(forrigeV(sp), sp.felles).includes(v)) return;
        sp.valgt = sp.valgt === v ? null : v;
        R.lyd.tone(sp.valgt ? 520 : 380, 0, 0.07, "sine", 0.14, 300);
        R.vis();
      },
      meld(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "skjult" || erRobot(sp, sp.tur) || !sp.valgt) return;
        gjorMelding(sp, sp.valgt);
      },
      tro(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "svar" || erRobot(sp, svarer(sp))) return;
        svar(sp, "tro");
      },
      loft(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "svar" || erRobot(sp, svarer(sp))) return;
        svar(sp, "loft");
      },
      godta(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "svar" || erRobot(sp, svarer(sp))) return;
        svar(sp, "godta");
      },
      runde(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !nyRunde(sp)) return;
        R.lyd.klikk();
        R.si(R.t("Runde {n}. {navn} begynner.", { n: sp.runde, navn: navnFor(sp, sp.tur) }));
        R.gaTil("spill");
      },
      kaaring(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.vinner == null) return;
        lagreStat(S);
        sp.ferdig = true;
        R.gaTil("slutt");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const urort = sp.liv.every((l) => l === sp.maksLiv);
        if (urort) {
          if (!(await R.bekreft(R.t("Avslutte spillet?"), R.t("Ingen har mistet liv ennå. Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"))) || !fortsatt()) return;
          stoppRobot();
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (!(await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere går rett til kåringen. Flest liv igjen leder."), R.t("Avslutt"), R.t("Spill videre"))) || !fortsatt() || !pagar(S)) return;
        stoppRobot();
        lagreStat(S);
        sp.ferdig = true;
        R.gaTil("slutt");
      },
    }),
  });
})();
