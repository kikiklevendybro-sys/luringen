/* Kameleonen — «Følelsesbyttet» (an improv game for one phone).
   The phone picks two actors and a scene («Tannlege og pasient»). They act it out while the phone
   shows a big emotion with its colour — and at random moments it beeps and switches to a new one
   (sint, forelsket, robot, opera …): the actors switch at once, mid-sentence. When the clock
   rings, the audience decides who was best: one of them (2 points) or both (1 point each), with
   «Angre» until the next scene. In each round every player acts twice, with different partners.

   The switch moments and the emotions of a scene are drawn up front from a seed and kept in S,
   so a reload mid-scene continues where it was. The rules are pure functions on
   window.RusjKameleonen, so test/kameleonen.test.mjs can load this file in node:vm without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const TIDER = [45, 60, 90];
  const RUNDER = [1, 2, 3];
  // Seconds between two switches, per tempo: [shortest, longest].
  const TEMPO = { rolig: [10, 18], vanlig: [6, 15], kaos: [4, 9] };
  const SLUTTFRI = 3; // no switch in the last seconds of a scene
  const DOMMER = ["a", "b", "begge"];

  // mulberry32: a small seeded generator (the same as the kit's R.rng).
  function rng(fro) {
    let a = fro >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stokk(liste, r) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const delt = (p, q) => p[0] === q[0] || p[0] === q[1] || p[1] === q[0] || p[1] === q[1];

  // Who acts with whom. Each round is a random cycle through all players (A–B, B–C, … , last–A),
  // so everyone acts exactly twice per round with two different partners. From five players up the
  // scenes are ordered so nobody acts two scenes in a row.
  function lagPar(antall, runder, r) {
    const par = [];
    for (let runde = 0; runde < runder; runde++) {
      let beste = null;
      for (let forsok = 0; forsok < 60; forsok++) {
        const p = stokk(Array.from({ length: antall }, (_, i) => i), r);
        const kanter = p.map((x, k) => (r() < 0.5 ? [x, p[(k + 1) % antall]] : [p[(k + 1) % antall], x]));
        let rekke = kanter;
        if (antall >= 5) {
          const partall = kanter.filter((_, k) => k % 2 === 0);
          const odde = kanter.filter((_, k) => k % 2 === 1);
          rekke = antall % 2 ? kanter.map((_, k) => kanter[(k * 2) % antall]) : partall.concat(odde);
        }
        beste = rekke;
        const forrige = par[par.length - 1];
        if (!forrige || !delt(forrige, rekke[0])) break;
      }
      par.push(...beste);
    }
    return par;
  }

  // The scene's plan: the seconds (from the start) when the emotion switches, and the emotions in
  // order — never the same twice in a scene, and never the one the previous scene ended on first.
  function plan(fro, tid, tempo, antall, forrige) {
    const r = rng(fro);
    const [a, b] = TEMPO[tempo] || TEMPO.vanlig;
    const bytt = [];
    let t = 0;
    for (;;) {
      t += a + Math.floor(r() * (b - a + 1));
      if (t > tid - SLUTTFRI) break;
      bytt.push(t);
    }
    const n = bytt.length + 1;
    let f = [];
    while (f.length < n) {
      const runde = stokk(Array.from({ length: antall }, (_, i) => i), r);
      const sist = f.length ? f[f.length - 1] : forrige;
      if (runde[0] === sist && antall > 1) [runde[0], runde[1]] = [runde[1], runde[0]];
      f = f.concat(runde);
    }
    return { fro: fro >>> 0, bytt, f: f.slice(0, n) };
  }
  // Which emotion of the plan is on at `sek` seconds into the scene.
  const indeks = (pl, sek) => pl.bytt.filter((t) => t <= sek).length;

  const M = {
    TIDER,
    RUNDER,
    TEMPO,
    SLUTTFRI,
    DOMMER,
    rng,
    lagPar,
    plan,
    indeks,
    nyttSpill(o, antall, fro) {
      const r = rng(fro);
      const tid = TIDER.includes(o.tid) ? o.tid : 60;
      const runder = RUNDER.includes(o.runder) ? o.runder : 1;
      const par = lagPar(antall, runder, r);
      return {
        antall,
        runder,
        tid,
        tempo: TEMPO[o.tempo] ? o.tempo : "vanlig",
        fro: fro >>> 0,
        par,
        tur: 0,
        turer: par.length,
        poeng: Array(antall).fill(0),
        fase: "klar", // klar → scene → dom → (next scene) klar …
        scene: 0, // the scene on the table (index in the data)
        plan: null,
        igjen: tid,
        fi: 0, // the emotion on screen (index in plan.f)
        pause: false,
        forrige: -1, // the emotion the previous scene ended on
        dom: null, // "a" | "b" | "begge" — counted when the next scene starts
        bytter: 0, // switches this game
        logg: [],
        ferdig: false,
      };
    },
    aktorer: (sp) => sp.par[sp.tur],
    runde: (sp) => Math.floor(sp.tur / sp.antall) + 1,
    sisteTur: (sp) => sp.tur + 1 >= sp.turer,
    // «Start»: the clock and the emotions of the scene. `antall`: how many emotions there are.
    startScene(sp, fro, antall) {
      sp.plan = plan(fro, sp.tid, sp.tempo, antall, sp.forrige);
      sp.igjen = sp.tid;
      sp.fi = 0;
      sp.pause = false;
      sp.dom = null;
      sp.fase = "scene";
    },
    // A clock tick with `sek` seconds left. True when the emotion switched just now.
    tikk(sp, sek) {
      if (sp.fase !== "scene" || !sp.plan) return false;
      sp.igjen = sek;
      const i = Math.min(sp.plan.f.length - 1, indeks(sp.plan, sp.tid - sek));
      if (i <= sp.fi) return false;
      sp.bytter += i - sp.fi;
      sp.fi = i;
      return true;
    },
    folelse: (sp) => (sp.plan ? sp.plan.f[sp.fi] : -1),
    // The emotions the actors have been through this scene.
    vist: (sp) => (sp.plan ? sp.plan.f.slice(0, sp.fi + 1) : []),
    // «Kutt!» or the clock rang: the audience judges.
    kutt(sp) {
      if (sp.fase !== "scene") return false;
      sp.fase = "dom";
      sp.dom = null;
      sp.pause = false;
      return true;
    },
    dom(sp, v) {
      if (sp.fase !== "dom" || !DOMMER.includes(v)) return false;
      sp.dom = v;
      return true;
    },
    angre(sp) {
      if (sp.fase !== "dom" || !sp.dom) return false;
      sp.dom = null;
      return true;
    },
    // The points of the verdict on screen: [[player, points], …]. Always 2 points per scene.
    pluss(sp) {
      if (sp.fase !== "dom" || !sp.dom) return [];
      const [a, b] = M.aktorer(sp);
      if (sp.dom === "a") return [[a, 2]];
      if (sp.dom === "b") return [[b, 2]];
      return [[a, 1], [b, 1]];
    },
    // Count the verdict and move on. `scene`: the next scene (index). Returns true when the game is over.
    neste(sp, scene) {
      if (sp.fase !== "dom" || !sp.dom) return false;
      M.pluss(sp).forEach(([i, p]) => (sp.poeng[i] += p));
      const [a, b] = M.aktorer(sp);
      sp.logg.push({ a, b, s: sp.scene, dom: sp.dom, f: M.vist(sp) });
      sp.logg = sp.logg.slice(-60);
      sp.forrige = M.folelse(sp);
      sp.dom = null;
      sp.plan = null;
      sp.fi = 0;
      sp.igjen = sp.tid;
      if (M.sisteTur(sp)) {
        sp.ferdig = true;
        return true;
      }
      sp.tur += 1;
      sp.scene = scene;
      sp.fase = "klar";
      return false;
    },
    // Score rows as R.ui.poengliste takes them; medDom also counts the verdict on screen (as «+n»).
    rader(sp, medDom) {
      const pluss = {};
      if (medDom) M.pluss(sp).forEach(([i, p]) => (pluss[i] = p));
      return sp.poeng.map((p, i) => (pluss[i] ? { i, poeng: p + pluss[i], pluss: pluss[i] } : { i, poeng: p }));
    },
    vinnere(sp) {
      const topp = Math.max(0, ...sp.poeng);
      return topp > 0 ? sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    },
  };
  window.RusjKameleonen = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const esc = R.esc;
  const D = window.RUSJ_DATA.innhold;
  const FOLELSER = D.folelser;
  const SCENER = D.scener;
  // The chameleon's colour for each emotion (light enough for ink text on top).
  const FARGE = {
    sint: "#ff7a6b", forelsket: "#ff9fcf", livredd: "#c3b1ff", opera: "#ffd84d", sovnig: "#a9cdfa", begeistret: "#ffe36b",
    agent: "#9adbc9", baby: "#ffd3df", sjorover: "#e8b984", robot: "#c3cbdc", trist: "#94b8ff", sjenert: "#ffc4ad",
    superhelt: "#7fd9ff", kommentator: "#8ce6a8", sakte: "#cfe8a6", kongelig: "#f6cd73", mistenksom: "#d4bd96", iskald: "#b3e9ff",
    steikvarm: "#ffab73", kjedelig: "#ddd6ec", kul: "#87e3da", drama: "#e6a8ff", nervos: "#ffe2a3", cowboy: "#edbb88",
    zombie: "#afdc93", sulten: "#ffd27f", hikke: "#ffd9ad", turist: "#a3eaff", gammel: "#eadabb", hvisker: "#cbbfff",
    rock: "#ff86b0", katt: "#ffcd78", forvirret: "#cbe6ff", ler: "#ffe680", romvesen: "#b0f2c6", forkjolet: "#d3ebd4",
  };
  const farge = (i) => (FOLELSER[i] && FARGE[FOLELSER[i].id]) || "#7bd88f";
  const stokkScener = R.kortstokk("scener", SCENER.length);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const KLOKKE = "kam-tid";
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "kameleonen") + "/";
  const OPPSETT = () => ({ tid: 60, tempo: "vanlig", runder: 1 });
  const TEMPONAVN = { rolig: R.t("Rolig"), vanlig: R.t("Vanlig"), kaos: R.t("Kaos") };
  const TEMPOTEKST = {
    rolig: R.t("Ny følelse hvert 10.–18. sekund. Fint for de minste."),
    vanlig: R.t("Ny følelse hvert 6.–15. sekund."),
    kaos: R.t("Ny følelse hvert 4.–9. sekund. Hold dere fast!"),
  };

  let H;
  let startetNa = false; // the scene screen was entered from the countdown: start the clock
  let opptatt = false; // the countdown runs: ignore extra taps
  let byttetNa = false; // the emotion switched: pop the card on the next draw
  let feire = false; // the end screen is entered from the game just now: fanfare

  const rundeTittel = (S) => (S.spill ? R.t("Runde {n} av {av}", { n: Math.min(M.runde(S.spill), S.spill.runder), av: S.spill.runder }) : "");
  const scene = (sp) => SCENER[sp.scene] || SCENER[0];
  const trekkScene = () => {
    const i = stokkScener.neste();
    return i >= 0 ? i : 0;
  };

  // ---------- The clock ----------

  const klokke = () => R.timer(KLOKKE);
  function lagKlokke(S) {
    const sp = S.spill;
    const tur = sp.tur;
    const gjelder = () => S.spill === sp && sp.tur === tur && sp.fase === "scene";
    const t = new R.Timer({
      id: KLOKKE,
      sekunder: Math.max(1, sp.igjen),
      visning: "sek",
      vedTikk: (sek) => {
        if (!gjelder()) return;
        if (M.tikk(sp, sek)) bytte(S);
        else R.lagre();
      },
      vedSlutt: () => {
        if (gjelder()) tilDom(S);
      },
    });
    t.total = sp.tid; // the ring shows the whole scene, also after a pause or reload
    return t;
  }
  // The phone beeps and the chameleon changes colour.
  function bytte(S) {
    const sp = S.spill;
    R.lyd.pling();
    R.vibrer([60, 40, 60]);
    byttetNa = !R.rolig();
    R.vis();
    const f = FOLELSER[M.folelse(sp)];
    if (f) R.si(R.t("Bytt! {folelse}.", { folelse: f.t }));
  }
  function tilDom(S) {
    const sp = S.spill;
    if (!M.kutt(sp)) return;
    R.slippVaken();
    R.gaTil("dom");
  }
  function stoppKlokke(sp) {
    const t = klokke();
    if (t) {
      t.pause();
      sp.igjen = Math.max(1, Math.ceil(t.igjen));
    }
  }
  function pause(S) {
    const sp = S.spill;
    if (!sp || sp.pause || sp.fase !== "scene") return;
    stoppKlokke(sp);
    sp.pause = true;
    if (S.skjerm === "scene") R.vis();
  }
  function fortsett(S) {
    const sp = S.spill;
    if (!sp || sp.fase !== "scene") return;
    sp.pause = false;
    const t = klokke() || lagKlokke(S);
    R.vis();
    t.start();
    R.holdVaken();
  }
  // A phone that is locked or switches app in the middle of a scene pauses it.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "scene") pause(S);
  });

  // ---------- Pieces ----------

  // An actor with the role: avatar, name and «som tannlegen».
  function aktor(i, rolle, klasse) {
    return `<div class="kam-aktor ${klasse || ""}">${R.avatar(i, "stor")}<span class="kam-aktor-navn">${esc(R.navn(i))}</span><span class="kam-rolle">${esc(R.t("som {rolle}", { rolle }))}</span></div>`;
  }
  const folelseChip = (i) => {
    const f = FOLELSER[i];
    return f ? `<li class="kam-chip" style="--kf: ${farge(i)}"><span aria-hidden="true">${f.e}</span> ${esc(f.t)}</li>` : "";
  };

  function vinnerTekst(v) {
    if (v.length > 3) return R.t("{n} spillere vinner!", { n: v.length });
    return R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(v.map((i) => R.navn(i))), n: v.length });
  }
  function domTekst(sp) {
    const [a, b] = M.aktorer(sp);
    if (sp.dom === "a") return R.t("+2 til {navn}", { navn: R.navn(a) });
    if (sp.dom === "b") return R.t("+2 til {navn}", { navn: R.navn(b) });
    return R.t("+1 til hver: {navn}", { navn: R.ramsOpp([R.navn(a), R.navn(b)]) });
  }
  function estimat(S) {
    const o = S.oppsett;
    const scener = R.klamp(S.antall, 3, 12) * o.runder;
    return R.t("{scener} · ca. {n} min", { scener: R.flertall(scener, "scene", "scener"), n: Math.max(3, Math.round((scener * (o.tid + 40)) / 60)) });
  }

  // ---------- Start ----------

  R.start({
    id: "kameleonen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 4, 3, 12),
      oppsett: OPPSETT(),
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(OPPSETT(), S.oppsett));
      if (!TIDER.includes(o.tid)) o.tid = 60;
      if (!TEMPO[o.tempo]) o.tempo = "vanlig";
      if (!RUNDER.includes(o.runder)) o.runder = 1;
      S.antall = R.klamp(Number(S.antall) || 4, 3, 12);
      const sp = S.spill;
      const iSpill = (i) => Number.isInteger(i) && i >= 0 && sp && i < sp.antall;
      const ok =
        sp &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 3 &&
        sp.antall <= 12 &&
        TIDER.includes(sp.tid) &&
        !!TEMPO[sp.tempo] &&
        Array.isArray(sp.par) &&
        sp.par.length === sp.turer &&
        sp.par.every((p) => Array.isArray(p) && p.length === 2 && iSpill(p[0]) && iSpill(p[1]) && p[0] !== p[1]) &&
        Number.isInteger(sp.tur) &&
        sp.tur >= 0 &&
        sp.tur < sp.turer &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === sp.antall &&
        sp.poeng.every((n) => Number.isInteger(n) && n >= 0) &&
        Number.isInteger(sp.scene) &&
        !!SCENER[sp.scene] &&
        ["klar", "scene", "dom"].includes(sp.fase) &&
        Array.isArray(sp.logg);
      if (!ok) S.spill = null;
      else {
        const pl = sp.plan;
        const planOk = pl && Array.isArray(pl.bytt) && Array.isArray(pl.f) && pl.f.length === pl.bytt.length + 1 && pl.f.every((i) => !!FOLELSER[i]);
        if (!planOk) {
          sp.plan = null;
          if (sp.fase !== "klar") sp.fase = "klar";
        }
        sp.fi = R.klamp(Math.floor(Number(sp.fi)) || 0, 0, sp.plan ? sp.plan.f.length - 1 : 0);
        sp.igjen = R.klamp(Math.ceil(Number(sp.igjen)) || sp.tid, 1, sp.tid);
        if (!DOMMER.includes(sp.dom) || sp.fase !== "dom") sp.dom = null;
        if (sp.fase === "scene") sp.pause = true; // a reload mid-scene comes back paused, at the same second
      }
      const skjermer = ["klar", "scene", "dom", "slutt"];
      if (!S.spill) {
        if (skjermer.includes(S.skjerm)) S.skjerm = "hjem";
      } else if (S.spill.ferdig) {
        if (skjermer.includes(S.skjerm)) S.skjerm = "slutt";
      } else if (skjermer.includes(S.skjerm)) S.skjerm = S.spill.fase;
    },

    regler: {
      intro: R.t("To spiller en scene. Mobilen bestemmer følelsen – og bytter den når dere minst venter det."),
      steg: [
        [R.t("Scenen"), R.t("Mobilen velger to skuespillere og en scene, for eksempel «Tannlege og pasient». Resten er publikum.")],
        [R.t("Bytt følelse!"), R.t("Mobilen viser en følelse. Når den piper og skifter farge, bytter dere til den nye med en gang – midt i setningen.")],
        [R.t("Publikum kårer"), R.t("Når tiden er ute, velger publikum hvem som var best: to poeng. Like gode? Ett poeng hver.")],
      ],
      tips: [
        R.t("Legg mobilen der skuespillerne ser den, eller la noen i publikum holde den opp."),
        R.t("Hver runde spiller alle to scener – med to forskjellige partnere."),
        R.t("Velg «Rolig» når de minste er med, og «Kaos» når dere er varme."),
        R.t("Trykket feil? «Angre» tar dommen tilbake før neste scene."),
        R.t("Ingen ord er feil i impro. Si ja til det den andre finner på, og bygg videre!"),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Spill scenen."))}<br><em>${esc(R.t("Bytt følelse når mobilen piper."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · scene {n} av {av}", { n: S.spill.tur + 1, av: S.spill.turer }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [["3–12", R.t("spillere")], [String(SCENER.length), R.t("scener")], [String(FOLELSER.length), R.t("følelser")]],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          ${R.ui.spillere({ min: 3, max: 12, hjelp: R.t("To spiller, resten er publikum. Alle får spille.") })}
          <section class="seksjon">
            <h2>${esc(R.t("Tempo"))}</h2>
            ${R.ui.seg("tempo", Object.keys(TEMPO).map((k) => [k, TEMPONAVN[k]]), o.tempo, { etikett: R.t("Hvor ofte følelsen bytter") })}
            <p class="hjelp">${esc(TEMPOTEKST[o.tempo])}</p>
          </section>
          <div class="kam-to">
            <section class="seksjon"><h2>${esc(R.t("Tid per scene"))}</h2>${R.ui.seg("tid", TIDER.map((t) => [String(t), R.t("{n} s", { n: t })]), String(o.tid), { etikett: R.t("Tid per scene") })}</section>
            <section class="seksjon"><h2>${esc(R.t("Runder"))}</h2>${R.ui.seg("runder", RUNDER.map((r) => [String(r), String(r)]), String(o.runder), { etikett: R.t("Antall runder") })}</section>
          </div>
          <p class="hjelp kam-tett">${esc(R.t("Hver runde spiller alle to scener."))}</p>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"), `<p class="hjelp kam-estimat">${esc(estimat(S))}</p>`)}`;
        },
      },

      // The next scene: who acts, as whom — and «Start».
      klar: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const [a, b] = M.aktorer(sp);
          const [tittel, ra, rb] = scene(sp);
          return `
            ${R.ui.fremdrift(sp.turer, sp.tur)}
            <p class="etikett kam-etikett">${esc(R.t("Scene {n} av {av}", { n: sp.tur + 1, av: sp.turer }))}</p>
            <h1 id="skjerm-tittel" class="kam-tittel">${esc(tittel)}</h1>
            <div class="kam-aktorer">${aktor(a, ra)}<span class="kam-og" aria-hidden="true">&amp;</span>${aktor(b, rb)}</div>
            <p class="hjelp kam-forklar">${esc(R.t("Følg følelsen på mobilen. Når den piper, bytter dere – med en gang!"))}</p>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Start"), "start-scene", { variant: "stor", ikon: "🎬" }),
              R.ui.lenkerad(R.ui.lenke(R.t("Bytt scene"), "bytt"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
      },

      // The scene runs: the emotion fills the screen and changes colour on every switch.
      scene: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const [a, b] = M.aktorer(sp);
          const fi = M.folelse(sp);
          const f = FOLELSER[fi] || FOLELSER[0];
          const pauset = sp.pause || (!startetNa && !klokke());
          const pop = byttetNa && !pauset ? " pop" : "";
          return `
            <div class="kam-scene${pauset ? " pauset" : ""}" style="--kf: ${farge(fi)}">
              <p class="kam-scenenavn">🎬 ${esc(scene(sp)[0])}</p>
              <div class="kam-folelse${pop}" data-folelse="${esc(f.id)}">
                <span class="kam-emoji" aria-hidden="true">${f.e}</span>
                <h1 id="skjerm-tittel" class="kam-ord ${R.lengdeKlasse(f.t)}">${esc(f.t)}</h1>
                <p class="kam-hint">${esc(f.h)}</p>
                ${pauset ? `<p class="kam-pause">⏸ ${esc(R.t("Pause"))}</p>` : ""}
              </div>
              <div class="kam-bunn">
                <p class="kam-hvem">${esc(R.ramsOpp([R.navn(a), R.navn(b)]))}<small>${esc(R.flertall(sp.fi + 1, "følelse", "følelser"))}</small></p>
                ${R.ui.timer({ id: KLOKKE, sekunder: sp.igjen, visning: "sek" })}
              </div>
            </div>
            ${
              pauset
                ? R.ui.dokk(R.ui.knapp(R.t("Fortsett"), "fortsett-scene"), R.ui.lenkerad(R.ui.lenke(R.t("Kutt!"), "kutt"), R.ui.lenke(R.t("Avslutt"), "avslutt")))
                : R.ui.dokk(R.ui.knapp(R.t("Kutt!"), "kutt", { variant: "papir" }), R.ui.lenkerad(R.ui.lenke(R.t("Pause"), "pause"), R.ui.lenke(R.t("Avslutt"), "avslutt")))
            }`;
        },
        etter() {
          byttetNa = false;
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          const fersk = startetNa;
          startetNa = false;
          if (sp.fase !== "scene") return;
          const t = lagKlokke(S);
          if (fersk && !sp.pause) {
            t.start();
            R.holdVaken();
          } else {
            sp.pause = true;
            R.vis();
          }
        },
        ut(S) {
          const sp = S.spill;
          const t = klokke();
          if (sp && t && sp.fase === "scene") {
            sp.igjen = Math.max(1, Math.ceil(t.igjen));
            sp.pause = true;
          }
        },
      },

      // The audience judges: who was best?
      dom: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const [a, b] = M.aktorer(sp);
          const valgt = sp.dom === "a" ? a : sp.dom === "b" ? b : sp.dom === "begge" ? [a, b] : null;
          const venter = !sp.dom;
          const siste = M.sisteTur(sp);
          return `
            <p class="etikett kam-etikett">🎬 ${esc(scene(sp)[0])}</p>
            <h1 id="skjerm-tittel" class="kam-tittel">${esc(R.t("Hvem var best?"))}</h1>
            <ul class="kam-chips" aria-label="${esc(R.t("Følelsene i scenen"))}">${M.vist(sp).map(folelseChip).join("")}</ul>
            ${R.ui.velgere("dom", [a, b], valgt)}
            <button class="knapp-2 kam-begge" data-h="dom" data-v="begge" aria-pressed="${sp.dom === "begge"}">🤝 ${esc(R.t("Like gode"))}</button>
            <p class="hjelp kam-tett">${esc(venter ? R.t("Publikum bestemmer. Best gir to poeng, like gode gir ett hver.") : domTekst(sp))}</p>
            ${R.ui.poengliste(M.rader(sp, true))}
            ${R.ui.dokk(
              R.ui.knapp(venter ? R.t("Velg hvem som var best") : siste ? R.t("Til kåringen") : R.t("Neste scene"), "neste", { av: venter }),
              R.ui.lenkerad(sp.dom ? R.ui.lenke(`↶ ${R.t("Angre")}`, "angre", { id: "angre" }) : "", siste ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn: () => R.slippVaken(),
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = M.vinnere(sp);
          const rader = M.rader(sp);
          const scener = sp.logg.length;
          const tekst = R.t("{scener} og {bytter}.", { scener: R.flertall(scener, "scene", "scener"), bytter: R.flertall(sp.bytter, "følelsesbytte", "følelsesbytter") });
          return `
            ${R.ui.banner({ klasse: "aksent", etikett: v.length ? R.t("Kveldens kameleon") : R.t("Ingen vinner"), tittel: v.length ? vinnerTekst(v) : R.t("Ingen poeng denne gangen"), tekst, stemning: v.length ? "jubel" : "" })}
            ${v.length ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${v.length ? `<div class="kam-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          R.slippVaken();
          if (!feire) return; // a reload or a visit from the home screen: no second fanfare
          feire = false;
          if (M.vinnere(S.spill).length) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) S.spill = null;
        R.gaTil("oppsett");
      },
      // Back to where the game was. A running scene comes back paused.
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        R.gaTil(S.spill.fase);
      },
      regler(el, e, S) {
        if (S.skjerm === "scene") pause(S);
        R.visRegler();
      },
      tempo(el, e, S) {
        if (TEMPO[el.dataset.v]) S.oppsett.tempo = el.dataset.v;
        R.vis();
      },
      tid(el, e, S) {
        const t = Number(el.dataset.v);
        if (TIDER.includes(t)) S.oppsett.tid = t;
        R.vis();
      },
      runder(el, e, S) {
        const r = Number(el.dataset.v);
        if (RUNDER.includes(r)) S.oppsett.runder = r;
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        const o = S.oppsett;
        const antall = R.klamp(S.antall || 4, 3, 12);
        S.spill = M.nyttSpill(o, antall, R.nyttFro());
        S.spill.scene = trekkScene();
        R.statistikk("start", { spillere: antall, runder: o.runder, tid: o.tid, tempo: o.tempo });
        R.gaTil("klar");
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "klar") return;
        const gml = sp.scene;
        let ny = trekkScene();
        if (ny === gml) ny = trekkScene();
        sp.scene = ny;
        R.lyd.snu();
        R.vis();
        R.si(R.t("Ny scene: {scene}.", { scene: scene(sp)[0] }));
      },
      // 3-2-1, then the first emotion and the clock.
      async "start-scene"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "klar" || opptatt) return;
        opptatt = true;
        R.holdVaken();
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", R.t("KJØR!")], 700);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp || sp.fase !== "klar") return;
        M.startScene(sp, R.nyttFro(), FOLELSER.length);
        startetNa = true;
        byttetNa = false;
        R.gaTil("scene");
        const f = FOLELSER[M.folelse(sp)];
        if (f) R.si(f.t);
      },
      pause: (el, e, S) => pause(S),
      "fortsett-scene": (el, e, S) => fortsett(S),
      // «Kutt!»: the scene ends before the clock.
      kutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "scene") return;
        const t = klokke();
        if (t) t.stopp();
        R.lyd.pop();
        tilDom(S);
      },
      dom(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "dom") return;
        const [a, b] = M.aktorer(sp);
        const v = el.dataset.v === "begge" ? "begge" : Number(el.dataset.v) === a ? "a" : Number(el.dataset.v) === b ? "b" : null;
        if (!M.dom(sp, v)) return;
        if (v === "begge") R.lyd.pop();
        else {
          R.lyd.riktig();
          R.vibrer([30, 40, 60]);
        }
        R.vis();
        R.si(domTekst(sp));
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.angre(sp)) return;
        R.lyd.snu();
        R.vis();
        R.toast(R.t("Angret – velg på nytt"));
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "dom" || !sp.dom) return;
        const ferdig = M.neste(sp, trekkScene());
        if (ferdig) return tilSlutt(S);
        R.gaTil("klar");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const gikk = S.skjerm === "scene" && !sp.pause && !!klokke();
        if (gikk) pause(S);
        const harPoeng = M.rader(sp, true).some((r) => r.poeng > 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft(
          R.t("Avslutte spillet?"),
          harPoeng ? R.t("Dere går rett til kåringen. Den med flest poeng vinner.") : R.t("Ingen har fått poeng ennå, så det blir ingen kåring."),
          R.t("Avslutt"),
          R.t("Spill videre"),
        );
        if (!fortsatt() || S.spill !== sp) return;
        if (!ja) {
          if (gikk) fortsett(S);
          return;
        }
        const t = klokke();
        if (t) t.stopp();
        if (!harPoeng) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        if (sp.dom) M.pluss(sp).forEach(([i, p]) => (sp.poeng[i] += p));
        sp.dom = null;
        tilSlutt(S, true);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const v = M.vinnere(sp);
        if (!v.length) return;
        const topp = M.rader(sp)
          .filter((r) => r.poeng > 0)
          .sort((a, b) => b.poeng - a.poeng)
          .slice(0, 3)
          .map((r) => `${R.navn(r.i)}: ${R.flertall(r.poeng, "poeng", "poeng")}`);
        const linjer = [vinnerTekst(v), ...topp];
        R.del(R.app.navn, [R.t("{navn} – bytt følelse når mobilen piper 🦎", { navn: R.app.navn }), ...linjer].join("\n"), ADRESSE, {
          kort: { tittel: R.app.navn, linjer },
        });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });

  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    R.stoppTimere();
    sp.ferdig = true;
    R.statistikk("ferdig", { spillere: sp.antall, scener: sp.logg.length, bytter: sp.bytter, tid: sp.tid, tempo: sp.tempo, tidlig: !!tidlig });
    R.kveld.registrer(M.rader(sp));
    R.slippVaken();
    feire = true;
    R.gaTil("slutt");
  }
})();
