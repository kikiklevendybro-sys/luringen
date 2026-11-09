/* Nynneren — «Nynn låta». One player sees a song title behind a hold-to-reveal card and hums it,
   without words, while the others guess before the time runs out. No audio is played by the app.
   Alle mot alle: the one who guesses first and the hummer get a point each.
   Lag mot lag: only the hummer's team guesses, and the team gets the point.
   Options: «La-la er lov» (sing la-la instead of humming) and «Morsomme vrier» (now and then the
   hummer must hum like a robot, an opera singer …). */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const DATA = window.RUSJ_DATA.laater;
  const KAT = DATA.kategorier;
  const VRIER = DATA.vrier;
  const katMedId = (id) => KAT.find((k) => k.id === id);

  // Every song in one list, so the deck remembers what this device has already shown.
  const ALLE = [];
  KAT.forEach((k) => k.laater.forEach(([t, n, a]) => ALLE.push({ k: k.id, t, n, a: a || "" })));
  // A one-word name per category for the half-time hint («🎄 Julesang · 3 ord»).
  const ENTALL = { barn: "Barnesang", jul: "Julesang", norske: "Norsk klassiker", allsang: "Allsang", pop: "Popklassiker", film: "Film, TV eller spill", hymner: "Nasjonalsang eller hymne" };
  const antallOrd = (t) => String(t).replace(/\([^)]*\)/g, " ").split(/[\s-]+/).filter((d) => /[\p{L}\d]/u.test(d)).length;
  const stokk = R.kortstokk("laater", ALLE.length);

  const NIVAER = [
    { v: 1, navn: "Lett", n: [1], tekst: "Låter alle kan – fint når barna er med." },
    { v: 2, navn: "Middels", n: [1, 2], tekst: "Lette og middels – passer for de fleste." },
    { v: 3, navn: "Vanskelig", n: [2, 3], tekst: "Middels og vanskelige – for musikknerder." },
  ];
  const niva = (v) => NIVAER.find((x) => x.v === v) || NIVAER[1];
  const TIDER = [30, 45, 60];
  const RUNDER = { alle: [1, 2, 3], lag: [3, 5, 8] };
  const BYTT = 2; // new song per turn when the hummer doesn't know it
  const VRI_SJANSE = 0.4;
  const LAGDYP = ["var(--rosa-dyp)", "var(--lampe-dyp)", "var(--himmel-dyp)", "var(--mynte-dyp)"];
  const lagNavn = (i) => "Lag " + R.LAG[i].navn;
  const STD = { modus: "alle", lag: 2, runder: { alle: 2, lag: 5 }, tid: 45, niva: 2, kat: null, lala: false, vrier: false };

  let H; // the actions, so one action can reuse another
  let startetNa = false; // the humming screen was entered from the countdown: start the clock
  let opptatt = false; // the countdown runs: ignore extra taps

  const deltakere = (sp) => (sp.modus === "lag" ? sp.lag : sp.antall);
  const nynner = (sp) => sp.tur % deltakere(sp);
  const rundeNr = (sp) => Math.floor(sp.tur / deltakere(sp)) + 1;
  const navn = (sp, i) => (sp.modus === "lag" ? lagNavn(i) : R.navn(i));
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const sisteTur = (sp) => sp.tur + 1 >= sp.turer;
  const stjerner = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const regel = (sp) => (sp.lala ? "🎶 La-la er lov – men ingen ord" : "🤐 Bare nynning – ingen ord");

  // ---------- Songs ----------

  function filter(o) {
    const lov = new Set(niva(o.niva).n);
    const kat = o.kat ? new Set(o.kat) : null;
    return (i) => lov.has(ALLE[i].n) && (!kat || kat.has(ALLE[i].k));
  }
  function tellLaater(o) {
    const f = filter(o);
    let n = 0;
    for (let i = 0; i < ALLE.length; i++) if (f(i)) n++;
    return n;
  }
  function tellKat(id, nivaV) {
    const lov = niva(nivaV).n;
    const k = katMedId(id);
    return k ? k.laater.filter((l) => lov.includes(l[1])).length : 0;
  }
  function nyLaat(sp) {
    const i = stokk.neste(filter(sp));
    const l = ALLE[i >= 0 ? i : 0];
    sp.laat = { t: l.t, k: l.k, n: l.n, a: l.a };
    sp.sett = false;
  }
  function nyTur(sp) {
    nyLaat(sp);
    sp.vri = sp.vrier && Math.random() < VRI_SJANSE ? R.heltall(0, VRIER.length - 1) : -1;
    sp.bytt = BYTT;
    sp.igjen = sp.tid;
    sp.pause = false;
    sp.resultat = null;
    sp.hint = false; // the guessers' hint after half the time
  }
  const vri = (sp) => (sp.vri >= 0 && VRIER[sp.vri] ? VRIER[sp.vri] : null);

  // ---------- The clock (a spinning record) ----------

  const klokke = () => R.timer("ny-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const tur = sp.tur;
    const t = new R.Timer({
      id: "ny-tid",
      sekunder: Math.max(1, sp.igjen),
      visning: "sek",
      vedTikk: (sek) => {
        if (S.spill === sp && sp.tur === tur && sp.resultat == null) {
          sp.igjen = sek;
          if (!sp.hint && sek <= sp.tid / 2) visHint(sp);
          R.lagre();
        }
      },
      vedSlutt: () => {
        if (S.spill === sp && sp.tur === tur && sp.resultat == null) {
          sp.igjen = 0;
          registrer(S, "tid", null);
        }
      },
    });
    t.total = sp.tid; // the ring shows the whole turn, also after a pause or reload
    return t;
  }
  // After half the time the guessers get a hint: the kind of song and how many words the title has.
  function hintTekst(sp) {
    const n = antallOrd(sp.laat.t);
    return `${(katMedId(sp.laat.k) || { ikon: "🎵" }).ikon} ${ENTALL[sp.laat.k] || "Låt"} · ${R.flertall(n, "ord", "ord")}`;
  }
  function visHint(sp) {
    sp.hint = true;
    const el = R.$(".ny-hint");
    if (el) {
      el.textContent = `Hint: ${hintTekst(sp)}`;
      el.hidden = false;
    }
    R.lyd.pling();
    R.si(`Hint: ${hintTekst(sp)}`);
  }
  function stoppKlokke(sp) {
    const t = klokke();
    if (t) {
      t.pause();
      sp.igjen = t.igjen;
    }
  }
  function pause(S) {
    const sp = S.spill;
    if (!sp || sp.pause || sp.resultat != null) return;
    stoppKlokke(sp);
    sp.pause = true;
    if (S.skjerm === "nynn") R.vis();
  }
  function fortsett(S) {
    const sp = S.spill;
    if (!sp || sp.resultat != null) return;
    sp.pause = false;
    const t = klokke() || lagKlokke(S);
    R.vis();
    t.start();
    R.holdVaken();
  }
  // A phone that is locked or switches app in the middle of a turn pauses it.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "nynn") pause(S);
  });

  // Record how the turn ended, give points and show the answer to everyone.
  function registrer(S, resultat, gjetter) {
    const sp = S.spill;
    if (!sp || sp.resultat != null) return;
    const m = nynner(sp);
    const pluss = [];
    let sek = null;
    if (resultat === "riktig") {
      sek = R.klamp(Math.round(sp.tid - sp.igjen), 1, sp.tid);
      if (sp.modus === "lag") pluss.push(m);
      else pluss.push(gjetter, m);
      pluss.forEach((i) => (sp.poeng[i] += 1));
      R.lyd.riktig();
      R.vibrer([30, 40, 60]);
    } else if (resultat === "pass") R.lyd.sveip(); // passing is fine: a neutral sound, never a buzzer
    sp.logg.push({ t: sp.laat.t, a: sp.laat.a || "", k: sp.laat.k, nynner: m, gjetter, resultat, sek, pluss });
    sp.logg = sp.logg.slice(-120);
    sp.resultat = resultat;
    sp.pause = false;
    R.gaTil("svar");
  }

  // ---------- Pieces ----------

  function lagFigur(i, klasse) {
    return `<span class="ny-lagfigur ${klasse || ""}" style="--lf: ${R.LAG[i % 4].farge}; --lf-dyp: ${LAGDYP[i % 4]}">${R.figur()}</span>`;
  }

  // The back of the secret card: the song on a record sleeve.
  function laatKort(sp, liten) {
    const l = sp.laat;
    const k = katMedId(l.k);
    const v = vri(sp);
    return `<span class="ny-panel">
      <span class="kort-etikett">${k ? `${k.ikon} ${esc(k.navn)}` : "Låt"} <span class="ny-stjerner" aria-label="Vanskelighet ${l.n} av 3">${stjerner(l.n)}</span></span>
      <span class="kort-ord ${R.lengdeKlasse(l.t)}">${esc(l.t)}</span>
      ${l.a ? `<span class="ny-artist">${esc(l.a)}</span>` : ""}
      ${liten ? "" : `<span class="kort-pille">${regel(sp)}</span>`}
      ${v && !liten ? `<span class="ny-vri"><span aria-hidden="true">${v[0]}</span> Vri: ${esc(v[1])}</span>` : ""}
    </span>`;
  }

  // Score list: players use the kit's list; teams get the mascot on their team disc.
  function poengListe(sp, rader) {
    if (sp.modus !== "lag") return R.ui.poengliste(rader);
    const sortert = rader.slice().sort((a, b) => b.poeng - a.poeng);
    const topp = sortert.length ? sortert[0].poeng : 0;
    return `<ol class="poengliste ny-liste">${sortert
      .map(
        (x, n) =>
          `<li class="${x.poeng === topp && topp > 0 ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${lagFigur(x.lag, "mini")}<span class="navn">${esc(lagNavn(x.lag))}</span>${
            x.pluss ? `<span class="pluss">+${x.pluss}</span>` : ""
          }<span class="sum">${x.poeng}</span></li>`,
      )
      .join("")}</ol>`;
  }
  function poengRader(sp, pluss) {
    const p = {};
    (pluss || []).forEach((i) => (p[i] = (p[i] || 0) + 1));
    return sp.poeng.map((poeng, i) => (sp.modus === "lag" ? { lag: i, poeng, pluss: p[i] } : { i, poeng, pluss: p[i] }));
  }
  // Standings after a turn. With many players only the top five; the full list comes at the end.
  function stilling(sp, pluss) {
    const rader = poengRader(sp, pluss);
    if (rader.length <= 8) return poengListe(sp, rader);
    const topp = rader.slice().sort((a, b) => b.poeng - a.poeng).slice(0, 5);
    return `${poengListe(sp, topp)}<p class="hjelp ny-tett">Topp fem av ${rader.length}. Hele lista kommer på slutten.</p>`;
  }
  // Podium for teams with the mascot on team-coloured discs (same rules as R.ui.pall).
  function lagPall(sp) {
    const alle = sp.poeng.map((poeng, lag) => ({ lag, poeng })).filter((x) => x.poeng > 0).sort((a, b) => b.poeng - a.poeng);
    if (alle.length < 2) return "";
    const rang = (x) => 1 + alle.filter((y) => y.poeng > x.poeng).length;
    const plass = (x) => {
      if (!x) return "<div></div>";
      const n = rang(x);
      return `<div class="pall-plass p${Math.min(n, 3)}">${lagFigur(x.lag, "liten")}<span class="navn">${esc(lagNavn(x.lag))}</span><span class="poeng">${x.poeng} p</span><span class="blokk">${n}</span></div>`;
    };
    return `<div class="pall" aria-label="Pallen">${plass(alle[1])}${plass(alle[0])}${plass(alle[2])}</div>`;
  }

  function svarTekst(sp, l) {
    if (l.resultat === "riktig") {
      if (sp.modus === "lag") return `${lagNavn(l.nynner)} klarte det på ${l.sek} s. Ett poeng til laget!`;
      return `${R.navn(l.gjetter)} gjettet det på ${l.sek} s. Ett poeng til gjetteren og ett til nynneren!`;
    }
    if (l.resultat === "pass") return "Ingen poeng denne gangen. Den var kanskje litt vrien?";
    return "Klokka vant denne gangen. Ingen poeng.";
  }

  // Fun awards for the end screen, built from the log.
  function kaaringer(sp) {
    const ut = [];
    const riktige = sp.logg.filter((l) => l.resultat === "riktig");
    const topp = (m) => {
      const maks = Math.max(...Object.values(m));
      return { maks, hvem: Object.keys(m).filter((i) => m[i] === maks).map(Number) };
    };
    if (sp.modus === "alle" && riktige.length) {
      const gjett = {};
      const nynt = {};
      riktige.forEach((l) => {
        gjett[l.gjetter] = (gjett[l.gjetter] || 0) + 1;
        nynt[l.nynner] = (nynt[l.nynner] || 0) + 1;
      });
      const g = topp(gjett);
      const n = topp(nynt);
      ut.push({ ikon: "🎤", tittel: "Beste nynner", tekst: `${R.ramsOpp(n.hvem.map((i) => R.navn(i)))} – ${R.flertall(n.maks, "låt", "låter")} gjettet` });
      ut.push({ ikon: "👂", tittel: "Skarpeste øre", tekst: `${R.ramsOpp(g.hvem.map((i) => R.navn(i)))} – ${g.maks === 1 ? "én riktig gjetning" : `${g.maks} riktige gjetninger`}` });
    }
    if (riktige.length) {
      const raskest = riktige.reduce((a, b) => (b.sek < a.sek ? b : a));
      const hvem = sp.modus === "lag" ? lagNavn(raskest.nynner) : R.navn(raskest.gjetter);
      ut.push({ ikon: "⚡", tittel: "Raskeste gjetning", tekst: `${hvem} – ${raskest.sek} s på «${raskest.t}»` });
    }
    const bom = sp.logg.filter((l) => l.resultat !== "riktig");
    if (bom.length) ut.push({ ikon: "🤷", tittel: "Ingen klarte", tekst: bom.slice(-3).map((l) => `«${l.t}»`).join(", ") });
    return ut;
  }

  // ---------- The game ----------

  R.start({
    id: "nynneren",
    versjon: 1,
    pagar, // a game is running until «Kåringen» (front-page badge, wake lock)

    // The player count starts at the number of names the group already typed in (any game).
    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, 3, 20),
      oppsett: Object.assign({}, STD, { runder: Object.assign({}, STD.runder) }),
      spill: null,
    }),

    // Repair saved settings and drop a saved game that doesn't fit this version.
    lastet(S) {
      const o = (S.oppsett = Object.assign({}, STD, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      if (!["alle", "lag"].includes(o.modus)) o.modus = "alle";
      if (![2, 3, 4].includes(o.lag)) o.lag = 2;
      o.runder = Object.assign({}, STD.runder, o.runder);
      if (!RUNDER.alle.includes(o.runder.alle)) o.runder.alle = 2;
      if (!RUNDER.lag.includes(o.runder.lag)) o.runder.lag = 5;
      if (!TIDER.includes(o.tid)) o.tid = 45;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (o.kat != null) {
        o.kat = Array.isArray(o.kat) ? o.kat.filter((id) => katMedId(id)) : null;
        if (o.kat && (!o.kat.length || o.kat.length === KAT.length)) o.kat = null;
      }
      o.lala = !!o.lala;
      o.vrier = !!o.vrier;
      S.antall = R.klamp(Number(S.antall) || 4, 3, 20);
      const sp = S.spill;
      if (!sp) return;
      const ok =
        ["alle", "lag"].includes(sp.modus) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === deltakere(sp) &&
        sp.laat &&
        typeof sp.laat.t === "string" &&
        Array.isArray(sp.logg) &&
        sp.turer > 0 &&
        sp.tur < sp.turer;
      if (!ok) {
        S.spill = null;
        if (!["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
      }
    },

    regler: {
      intro: "Én nynner, resten gjetter. Ingen ord – bare melodien!",
      steg: [
        ["Se låta", "Den som skal nynne, holder fingeren på kortet og ser låta. De andre ser bort så lenge."],
        ["Nynn!", "Trykk «Start nynningen» og nynn melodien – uten ord. Klokka går imens."],
        ["Riktig eller pass", "Gjetter noen riktig, trykker dere «Riktig!». Spiller dere alle mot alle, får både gjetteren og nynneren ett poeng."],
      ],
      tips: [
        "Begynn med refrenget – det er det folk kjenner best.",
        "Kjenner du ikke låta? Du kan bytte to ganger før du starter.", "Etter halve tiden får gjetterne et hint: hva slags låt det er, og hvor mange ord tittelen har.",
        "«La-la er lov» gjør det lettere: syng la-la og da-da i stedet for å nynne.",
        "Med «Morsomme vrier» må du av og til nynne som en robot, en operasanger eller en sur gubbe.",
        "Lag mot lag: bare laget til nynneren gjetter.",
      ],
    },

    // The song is only shown while the hummer holds the card.
    hemmelig: {
      innhold: (S, id) => ({ html: laatKort(S.spill, id === "titt"), klasse: "ny-bak" }),
      sett(S) {
        const sp = S.spill;
        if (sp && !sp.sett) {
          sp.sett = true;
          if (S.skjerm === "se") R.vis();
        }
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Nynn låta – uten et eneste ord.<br><em>De andre gjetter!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–20", "spillere"],
              [String(ALLE.length), "låter"],
              [String(KAT.length), "kategorier"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const antall = tellLaater(o);
          const valgt = o.kat || KAT.map((k) => k.id);
          const lag = `<section class="seksjon">
              <h2>Hvor mange lag?</h2>
              ${R.ui.seg("lag", [[2, "2 lag"], [3, "3 lag"], [4, "4 lag"]], o.lag, { etikett: "Antall lag" })}
              <div class="ny-lagrad">${Array.from({ length: o.lag }, (_, i) => R.ui.lagmerke(i, R.LAG[i].navn)).join("")}</div>
              <p class="hjelp">Del dere i lag. Lagene bytter på å nynne, og bare laget til nynneren gjetter.</p>
            </section>`;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hvordan spiller dere?</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "alle", tittel: "Alle mot alle", tekst: "Den som gjetter først, får poeng", ikon: "🙋" },
                  { v: "lag", tittel: "Lag mot lag", tekst: "Gjett for laget ditt", ikon: "👥" },
                ],
                o.modus,
              )}
            </section>
            ${o.modus === "alle" ? R.ui.spillere({ min: 3, max: 20 }) : lag}
            <div class="ny-to">
              <section class="seksjon"><h2>Runder</h2>${R.ui.seg("runder", RUNDER[o.modus].map((r) => [r, String(r)]), o.runder[o.modus], { etikett: "Antall runder" })}</section>
              <section class="seksjon"><h2>Tid</h2>${R.ui.seg("tid", TIDER.map((t) => [t, `${t} s`]), o.tid, { etikett: "Tid per låt" })}</section>
            </div>
            <p class="hjelp ny-tett">${o.modus === "alle" ? "Alle nynner én gang hver runde." : "Hvert lag nynner én gang hver runde."}</p>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Låtene</h2><span class="tall">${antall} låter</span></div>
              ${R.ui.seg("niva", NIVAER.map((n) => [n.v, n.navn]), o.niva, { etikett: "Vanskelighet" })}
              <p class="hjelp">${esc(niva(o.niva).tekst)}</p>
              ${R.ui.brikker(
                "kat",
                KAT.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: tellKat(k.id, o.niva) })),
                valgt,
                { alle: true, etikett: "Kategorier" },
              )}
            </section>
            <section class="seksjon">
              ${R.ui.bryter("lala", o.lala, "La-la er lov", "Lettere: syng la-la og da-da i stedet for å nynne. Ord er fortsatt forbudt.")}
              ${R.ui.bryter("vrier", o.vrier, "Morsomme vrier", "Av og til må nynneren nynne som en robot, en operasanger …")}
            </section>
            ${R.ui.dokk(antall ? "" : `<p class="feil">Velg minst én kategori med låter for å starte.</p>`, R.ui.knapp("Start", "start", { av: !antall, ikon: "🎵" }))}`;
        },
      },

      // Pass the phone to the next hummer (or team).
      gi: {
        tittel: (S) => `Runde ${rundeNr(S.spill)} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const m = nynner(sp);
          if (sp.modus === "alle") {
            return R.ui.giTil({
              i: m,
              h: "klar",
              tekst: sp.tur === 0 ? "Først ut å nynne" : "Neste som nynner",
              knapp: `Jeg er ${R.navn(m)}`,
              prikker: [sp.antall, m],
              advarsel: "De andre ser bort",
            });
          }
          return `
            <div class="gi-til">
              ${lagFigur(m, "stor")}
              <p class="etikett">${sp.tur === 0 ? "Først ut" : "Neste lag"}</p>
              <h1 id="skjerm-tittel" class="ny-lagnavn" style="--lf: ${R.LAG[m].farge}">${esc(lagNavn(m))}</h1>
              <p class="ingress">Hvem nynner? Den som nynner, tar mobilen. Resten av laget gjetter.</p>
              <p class="ikke-se">🙈 Alle andre ser bort</p>
            </div>
            ${R.ui.dokk(R.ui.knapp("Jeg skal nynne", "klar"))}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
          S.spill.sett = false; // whoever gets the phone now holds the card to see the song
        },
      },

      // The hummer reads the secret song.
      se: {
        tittel: (S) => `${navn(S.spill, nynner(S.spill))} nynner`,
        tilbake: "gi",
        gjenoppta: "gi", // after a reload the phone goes through «Gi mobilen til …» again
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="ny-instruks" id="skjerm-tittel">${sp.sett ? "Husk låta!" : "Din hemmelige låt"}</h1>
            <p class="hjelp ny-tett">${sp.sett ? "Start klokka og nynn – uten ord." : "Bare du skal se låta. De andre ser bort."}</p>
            ${R.ui.mappe({ id: "laat", etikett: "Hemmelig låt", tekst: "Hold fingeren på kortet for å se", etikettAria: "Hold fingeren på kortet for å se låta" })}
            ${R.ui.dokk(
              R.ui.knapp(sp.sett ? "Start nynningen" : "Se låta først", "start-nynn", { av: !sp.sett, ikon: sp.sett ? "▶" : "" }),
              sp.sett && sp.bytt > 0 ? R.ui.lenkerad(R.ui.lenke(`Kjenner du den ikke? Bytt (${sp.bytt} igjen)`, "bytt")) : "",
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "se";
        },
      },

      // The clock (a record) spins while the hummer hums. The phone can lie on the table.
      nynn: {
        tittel: (S) => `Runde ${rundeNr(S.spill)} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const m = nynner(sp);
          const pauset = sp.pause || (!startetNa && !klokke());
          const v = vri(sp);
          return `
            <h1 class="ny-nynner" id="skjerm-tittel">${sp.modus === "lag" ? lagFigur(m, "mini") : R.avatar(m, "mid")}<span><b>${esc(navn(sp, m))}</b> nynner</span></h1>
            <div class="ny-midt">
              <div class="ny-scene${pauset ? " pauset" : ""}">
                <div class="ny-plate">
                  ${R.ui.timer({ id: "ny-tid", sekunder: sp.igjen, stor: true, visning: "sek" })}
                  <span class="ny-noter" aria-hidden="true"><i>♪</i><i>♫</i><i>♪</i><i>♬</i><i>♫</i></span>
                </div>
                ${pauset ? `<p class="ny-skilt pause">⏸ Pause</p>` : `<p class="ny-skilt">${v ? `${v[0]} ${esc(v[1])}` : regel(sp)}</p>`}
              </div>
              <p class="ny-hint" aria-live="polite"${sp.hint ? "" : " hidden"}>${sp.hint ? esc(`Hint: ${hintTekst(sp)}`) : ""}</p>
            </div>
            ${
              pauset
                ? R.ui.dokk(R.ui.knapp("Fortsett", "fortsett-nynn", { ikon: "▶" }), R.ui.lenkerad(R.ui.lenke("Pass", "pass"), R.ui.lenke("👁 Glemt låta? Bare for nynneren", "titt")))
                : R.ui.dokk(
                    `<div class="ny-svarknapper">${R.ui.knapp("Pass", "pass", { variant: "papir" })}${R.ui.knapp("Riktig!", "riktig", { variant: "mynte", stille: true })}</div>`,
                    R.ui.lenkerad(R.ui.lenke("Pause", "pause"), R.ui.lenke("👁 Glemt låta? Bare for nynneren", "titt")),
                  )
            }`;
        },
        etter() {
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "nynn";
          const fersk = startetNa;
          startetNa = false;
          if (sp.resultat != null) return;
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
          if (sp && t && sp.resultat == null) {
            sp.igjen = Math.max(1, t.igjen);
            sp.pause = true;
          }
        },
      },

      // Alle mot alle: who guessed it?
      hvem: {
        tittel: (S) => `Runde ${rundeNr(S.spill)} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const m = nynner(sp);
          const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== m);
          return `
            <div class="ny-hvem">
              <span class="stempel mynte" aria-hidden="true">Riktig!</span>
              <h1 id="skjerm-tittel">Hvem gjettet det?</h1>
              <p class="ingress">Trykk på den som sa det først. ${esc(R.navn(m))} får også ett poeng.</p>
            </div>
            ${R.ui.velgere("gjetter", andre, null)}
            ${R.ui.dokk(R.ui.knapp2("Angre – vi er ikke ferdige", "angre"))}`;
        },
        inn(S) {
          S.spill.skjerm = "hvem";
        },
      },

      // The answer, for everyone to see.
      svar: {
        tittel: (S) => `Runde ${rundeNr(S.spill)} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const l = sp.logg[sp.logg.length - 1];
          const k = katMedId(l.k);
          const [stempel, farge] = l.resultat === "riktig" ? ["Riktig!", "mynte"] : l.resultat === "pass" ? ["Pass!", "rosa"] : ["Tiden er ute!", "rosa"];
          const neste = (sp.tur + 1) % deltakere(sp);
          return `
            <div class="ny-svar">
              <div class="stempel-sted"><h1 id="skjerm-tittel" class="stempel ${farge}">${stempel}</h1></div>
              <div class="ny-cover">
                <span class="ny-cover-plate" aria-hidden="true"></span>
                <div class="papirboks ny-fasit">
                  <p class="etikett">Låta var</p>
                  <p class="ny-fasit-tekst">${esc(l.t)}</p>
                  ${l.a ? `<p class="ny-fasit-artist">${esc(l.a)}</p>` : ""}
                  ${k ? `<p class="ny-fasit-kat">${k.ikon} ${esc(k.navn)}</p>` : ""}
                </div>
              </div>
              <p class="ny-svartekst">${esc(svarTekst(sp, l))}</p>
              ${l.resultat === "riktig" ? `<p class="ny-allsang"><span aria-hidden="true">🎤</span> Klarer alle å synge refrenget?</p>` : ""}
            </div>
            <div class="ny-stilling">${stilling(sp, l.pluss)}</div>
            ${R.ui.dokk(
              sisteTur(sp) ? R.ui.knapp("Se hvem som vant", "slutt", { ikon: "🏆" }) : R.ui.knapp(`Neste: ${navn(sp, neste)}`, "neste"),
              R.ui.lenkerad(l.resultat === "riktig" ? R.ui.lenke("Angre", "angre-svar") : "", sisteTur(sp) ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "svar";
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const maks = Math.max(...sp.poeng);
          const vinnere = maks > 0 ? sp.poeng.map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0) : [];
          const riktige = sp.logg.filter((l) => l.resultat === "riktig").length;
          const alle = sp.modus === "alle";
          let figur = R.figur();
          let etikett = "Ingen vinner";
          let tittel = "Ingen fikk poeng";
          if (vinnere.length === 1) {
            figur = alle ? `<span class="ny-vinner">${R.avatar(vinnere[0], "gigant")}<span class="ny-krone" aria-hidden="true">🎤</span></span>` : lagFigur(vinnere[0], "stor");
            etikett = alle ? "Nynnemester" : "Nynnemestere";
            tittel = `${navn(sp, vinnere[0])} vinner!`;
          } else if (vinnere.length > 1) {
            figur = `<span class="ny-delt">${vinnere.slice(0, 4).map((i) => (alle ? R.avatar(i, "stor") : lagFigur(i, "liten"))).join("")}</span>`;
            etikett = "Delt seier";
            tittel = `${R.ramsOpp(vinnere.map((i) => navn(sp, i)))} vinner!`;
          }
          const priser = kaaringer(sp);
          return `
            <div class="banner aksent${vinnere.length > 1 ? " ny-delt-banner" : ""}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${riktige} av ${sp.logg.length} ${sp.logg.length === 1 ? "låt" : "låter"} ble gjettet.${maks > 0 ? "" : " Godt jobba likevel!"}</p>
            </div>
            ${maks > 0 ? (alle ? R.ui.pall(poengRader(sp)) : lagPall(sp)) + poengListe(sp, poengRader(sp)) : ""}
            ${priser.length ? `<ul class="ny-priser">${priser.map((p) => `<li><span class="ny-pris-ikon" aria-hidden="true">${p.ikon}</span><span><b>${esc(p.tittel)}</b><small>${esc(p.tekst)}</small></span></li>`).join("")}</ul>` : ""}
            ${R.ui.flereSpill({ antall: alle ? sp.antall : Math.max(4, sp.lag * 2) })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          const forste = !sp.ferdig;
          sp.ferdig = true;
          sp.skjerm = "slutt";
          R.slippVaken();
          R.lagre();
          if (!forste) return;
          R.statistikk("ferdig", { modus: sp.modus, turer: sp.logg.length, riktige: sp.logg.filter((l) => l.resultat === "riktig").length });
          R.kveld.registrer(poengRader(sp).map((r) => (sp.modus === "lag" ? { lag: r.lag, poeng: r.poeng } : { i: r.i, poeng: r.poeng })));
          if (sp.poeng.some((p) => p > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      // A running game is only thrown away after the player confirms.
      async nytt(el, e, S) {
        const iGang = pagar(S);
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang)) || !fortsatt()) return;
        if (iGang) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      // Back to where the game was. The secret card always goes through «Gi mobilen til …» first.
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        const sp = S.spill;
        let mal = ["gi", "nynn", "hvem", "svar"].includes(sp.skjerm) ? sp.skjerm : "gi";
        if (mal === "svar" && sp.resultat == null) mal = "gi";
        R.holdVaken();
        R.gaTil(mal);
      },
      // While the clock runs, the rules sheet pauses it first.
      regler(el, e, S) {
        if (S.skjerm === "nynn") pause(S);
        R.visRegler();
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      lag(el, e, S) {
        S.oppsett.lag = Number(el.dataset.v);
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder[S.oppsett.modus] = Number(el.dataset.v);
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = Number(el.dataset.v);
        R.vis();
      },
      kat(el, e, S) {
        const o = S.oppsett;
        const v = el.dataset.v;
        const alle = KAT.map((k) => k.id);
        let valgt = o.kat ? o.kat.slice() : alle.slice();
        if (v === "*") valgt = valgt.length === alle.length ? [] : alle.slice();
        else valgt = valgt.includes(v) ? valgt.filter((x) => x !== v) : alle.filter((x) => x === v || valgt.includes(x));
        o.kat = valgt.length === alle.length ? null : valgt;
        R.vis();
      },
      lala(el, e, S) {
        S.oppsett.lala = !S.oppsett.lala;
        R.vis();
      },
      vrier(el, e, S) {
        S.oppsett.vrier = !S.oppsett.vrier;
        R.vis();
      },
      async start(el, e, S) {
        const o = S.oppsett;
        if (!tellLaater(o)) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        const antall = o.modus === "lag" ? o.lag : R.klamp(S.antall, 3, 20);
        S.spill = {
          modus: o.modus,
          lag: o.lag,
          antall: o.modus === "lag" ? 0 : antall,
          runder: o.runder[o.modus],
          tid: o.tid,
          niva: o.niva,
          kat: o.kat ? o.kat.slice() : null,
          lala: o.lala,
          vrier: o.vrier,
          poeng: Array(antall).fill(0),
          tur: 0,
          turer: o.runder[o.modus] * antall,
          logg: [],
          skjerm: "gi",
          ferdig: false,
        };
        nyTur(S.spill);
        R.statistikk("start", { modus: o.modus, deltakere: antall, runder: o.runder[o.modus], tid: o.tid, vrier: o.vrier });
        R.holdVaken();
        R.gaTil("gi");
      },
      klar: () => R.gaTil("se"),
      bytt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.bytt <= 0) return;
        sp.bytt -= 1;
        nyLaat(sp);
        R.lyd.snu();
        R.toast("Ny låt!");
        R.vis();
      },
      async "start-nynn"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.sett || opptatt) return;
        opptatt = true;
        R.holdVaken();
        // Leaving during the countdown (back, then «Fortsett») must never start the clock by itself.
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", "NYNN!"], 750);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        sp.igjen = sp.tid;
        sp.pause = false;
        startetNa = true;
        R.gaTil("nynn");
      },
      // Peek at the song again: a sheet with the hold card, only for the hummer.
      titt(el, e, S) {
        if (!S.spill || S.skjerm !== "nynn") return;
        R.ark(`
          <h2 id="ark-tittel">Bare for nynneren</h2>
          <p class="ingress">De andre ser bort. Hold fingeren på kortet for å se.</p>
          ${R.ui.mappe({ id: "titt", etikett: "Glemt låta?", tekst: "Hold fingeren på kortet for å se", etikettAria: "Hold fingeren på kortet for å se låta" })}
          <button class="knapp" data-h="lukk-ark">Ferdig</button>`);
      },
      pause: (el, e, S) => pause(S),
      "fortsett-nynn": (el, e, S) => fortsett(S),
      riktig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.resultat != null) return;
        stoppKlokke(sp);
        if (sp.modus === "lag") registrer(S, "riktig", null);
        else {
          R.lyd.pop();
          R.vibrer(20);
          R.gaTil("hvem");
        }
      },
      async pass(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.resultat != null) return;
        const gikk = !sp.pause && !!klokke();
        pause(S);
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Gi opp låta?", "Ingen får poeng for denne.", "Pass", "Fortsett å nynne");
        if (!fortsatt() || S.spill !== sp || sp.resultat != null) return;
        if (ja) registrer(S, "pass", null);
        else if (gikk) fortsett(S);
      },
      gjetter(el, e, S) {
        registrer(S, "riktig", Number(el.dataset.v));
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.resultat != null) return;
        sp.pause = false;
        startetNa = true;
        R.gaTil("nynn");
      },
      // Undo the points of the last «Riktig!». Everyone against everyone goes back to choosing
      // who guessed (from there «Angre» again means keep humming); teams go straight back to humming.
      "angre-svar"(el, e, S) {
        const sp = S.spill;
        const l = sp && sp.logg[sp.logg.length - 1];
        if (!l || sp.resultat !== "riktig" || l.resultat !== "riktig") return;
        l.pluss.forEach((i) => (sp.poeng[i] = Math.max(0, sp.poeng[i] - 1)));
        sp.logg.pop();
        sp.resultat = null;
        sp.pause = false;
        sp.igjen = Math.max(1, sp.igjen);
        R.lyd.snu();
        if (sp.modus === "alle") {
          R.gaTil("hvem");
          return;
        }
        startetNa = true;
        R.toast("Angret – nynn videre!");
        R.gaTil("nynn");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.resultat == null) return;
        if (sisteTur(sp)) {
          R.gaTil("slutt");
          return;
        }
        sp.tur += 1;
        nyTur(sp);
        R.gaTil("gi");
      },
      slutt: () => R.gaTil("slutt"),
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const harPoeng = sp.poeng.some((p) => p > 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", harPoeng ? "Den som leder nå, vinner." : "Ingen har fått poeng ennå.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (!harPoeng) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
