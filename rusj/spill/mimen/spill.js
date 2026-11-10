/* Mimen — «Mimeleken» (charades).
   One player mimes a secret task without words (and without sounds, unless that is switched on)
   while the others guess before the time runs out.
   Alle mot alle: the one who guesses first and the mimer get a point each.
   Lag mot lag: only the mimer's team guesses, and the team gets the point. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const KAT = window.RUSJ_DATA.oppgaver.kategorier;
  const katMedId = (id) => KAT.find((k) => k.id === id);

  // Every task in one list, so the deck remembers what this device has already shown.
  const ALLE = [];
  KAT.forEach((k) => k.oppgaver.forEach(([t, n]) => ALLE.push({ k: k.id, t, n })));
  const stokk = R.kortstokk("oppgaver", ALLE.length);

  const NIVAER = [
    { v: 1, navn: "Lett", n: [1], tekst: "Lette oppgaver – fint når barna er med." },
    { v: 2, navn: "Middels", n: [1, 2], tekst: "Lette og middels oppgaver – passer for de fleste." },
    { v: 3, navn: "Vanskelig", n: [2, 3], tekst: "Middels og vanskelige – for drevne mimere." },
  ];
  const niva = (v) => NIVAER.find((x) => x.v === v) || NIVAER[1];
  const TIDER = [45, 60, 90];
  const RUNDER = { alle: [1, 2, 3], lag: [3, 5, 8] };
  const BYTT = 2; // new task per turn when the mimer doesn't know the word
  const LAGDYP = ["var(--rosa-dyp)", "var(--lampe-dyp)", "var(--himmel-dyp)", "var(--mynte-dyp)"];
  const lagNavn = (i) => "Lag " + R.LAG[i].navn;

  let H; // the actions, so one action can reuse another
  let startetNa = false; // the miming screen was entered from the countdown: start the clock
  let opptatt = false; // the countdown runs: ignore extra taps

  const deltakere = (sp) => (sp.modus === "lag" ? sp.lag : sp.antall);
  const mimer = (sp) => sp.tur % deltakere(sp);
  const rundeNr = (sp) => Math.floor(sp.tur / deltakere(sp)) + 1;
  const navn = (sp, i) => (sp.modus === "lag" ? lagNavn(i) : R.navn(i));
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const sisteTur = (sp) => sp.tur + 1 >= sp.turer;
  const stjerner = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  // «A», «A og B», «A, B og C»
  const liste = (navn) => (navn.length < 2 ? navn.join("") : `${navn.slice(0, -1).join(", ")} og ${navn[navn.length - 1]}`);

  // ---------- Tasks ----------

  function filter(o) {
    const lov = new Set(niva(o.niva).n);
    const kat = o.kat ? new Set(o.kat) : null;
    return (i) => lov.has(ALLE[i].n) && (!kat || kat.has(ALLE[i].k));
  }
  function tellOppgaver(o) {
    const f = filter(o);
    let n = 0;
    for (let i = 0; i < ALLE.length; i++) if (f(i)) n++;
    return n;
  }
  function tellKat(id, nivaV) {
    const lov = niva(nivaV).n;
    const k = katMedId(id);
    return k ? k.oppgaver.filter((o) => lov.includes(o[1])).length : 0;
  }
  function nyOppgave(sp) {
    const i = stokk.neste(filter(sp));
    const o = ALLE[i >= 0 ? i : 0];
    sp.oppgave = { t: o.t, k: o.k, n: o.n };
    sp.sett = false;
  }
  function nyTur(sp) {
    nyOppgave(sp);
    sp.bytt = BYTT;
    sp.igjen = sp.tid;
    sp.pause = false;
    sp.resultat = null;
  }

  // ---------- The clock ----------

  const klokke = () => R.timer("mi-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const tur = sp.tur;
    const t = new R.Timer({
      id: "mi-tid",
      sekunder: Math.max(1, sp.igjen),
      vedTikk: (sek) => {
        if (S.spill === sp && sp.tur === tur && sp.resultat == null) {
          sp.igjen = sek;
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
    if (S.skjerm === "mim") R.vis();
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
    if (document.hidden && S && S.skjerm === "mim") pause(S);
  });

  // Record how the turn ended, give points and show the answer to everyone.
  function registrer(S, resultat, gjetter) {
    const sp = S.spill;
    if (!sp || sp.resultat != null) return;
    const m = mimer(sp);
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
    sp.logg.push({ t: sp.oppgave.t, k: sp.oppgave.k, mimer: m, gjetter, resultat, sek, pluss });
    sp.logg = sp.logg.slice(-120);
    sp.resultat = resultat;
    sp.pause = false;
    R.gaTil("svar");
  }

  // ---------- Pieces ----------

  function lagFigur(i, klasse) {
    return `<span class="mi-lagfigur ${klasse || ""}" style="--lf: ${R.LAG[i % 4].farge}; --lf-dyp: ${LAGDYP[i % 4]}">${R.figur()}</span>`;
  }

  function oppgaveKort(sp, liten) {
    const o = sp.oppgave;
    const k = katMedId(o.k);
    return `<span class="mi-panel">
      <span class="kort-etikett">${k ? `${k.ikon} ${esc(k.navn)}` : "Oppgave"} <span class="mi-stjerner" aria-label="Vanskelighet ${o.n} av 3">${stjerner(o.n)}</span></span>
      <span class="kort-ord ${R.lengdeKlasse(o.t)}">${esc(o.t)}</span>
      ${liten ? "" : `<span class="kort-pille">${sp.lyder ? "🔊 Lyder er lov – men ingen ord" : "🤫 Ingen ord, ingen lyder"}</span>`}
    </span>`;
  }

  // Score list: players use the kit's list; teams get the mime on their team disc (the kit's list
  // shows plain colour dots), with the same markup and classes.
  function poengListe(sp, rader) {
    if (sp.modus !== "lag") return R.ui.poengliste(rader);
    const sortert = rader.slice().sort((a, b) => b.poeng - a.poeng);
    const topp = sortert.length ? sortert[0].poeng : 0;
    return `<ol class="poengliste mi-liste">${sortert
      .map(
        (x, n) =>
          `<li class="${x.poeng === topp && topp > 0 ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${lagFigur(x.lag, "mini")}<span class="navn">${esc(lagNavn(x.lag))}</span>${
            x.pluss ? `<span class="pluss">+${x.pluss}</span>` : ""
          }<span class="sum">${x.poeng}</span></li>`,
      )
      .join("")}</ol>`;
  }

  // Standings after a turn. With many players only the top five; the full list comes at the end.
  function stilling(sp, pluss) {
    const rader = poengRader(sp, pluss);
    if (rader.length <= 8) return poengListe(sp, rader);
    const topp = rader.slice().sort((a, b) => b.poeng - a.poeng).slice(0, 5);
    return `${poengListe(sp, topp)}<p class="hjelp mi-tett">Topp fem av ${rader.length}. Hele lista kommer på slutten.</p>`;
  }

  // Podium for teams with the mime on team-coloured discs (the kit's podium shows plain dots).
  // Same rules as R.ui.pall (no 0-point teams, equal points share a place), with team badges.
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

  function poengRader(sp, pluss) {
    const p = {};
    (pluss || []).forEach((i) => (p[i] = (p[i] || 0) + 1));
    return sp.poeng.map((poeng, i) => (sp.modus === "lag" ? { lag: i, poeng, pluss: p[i] } : { i, poeng, pluss: p[i] }));
  }

  function svarTekst(sp, l) {
    if (l.resultat === "riktig") {
      if (sp.modus === "lag") return `${lagNavn(l.mimer)} klarte det på ${l.sek} s. Ett poeng til laget!`;
      return `${R.navn(l.gjetter)} gjettet det på ${l.sek} s. Ett poeng til gjetteren og ett til mimeren!`;
    }
    if (l.resultat === "pass") return "Ingen poeng denne gangen. Den var kanskje litt vrien?";
    return "Klokka vant denne gangen. Ingen poeng.";
  }

  // Fun awards for the end screen, built from the log.
  function kaaringer(sp) {
    const ut = [];
    const riktige = sp.logg.filter((l) => l.resultat === "riktig");
    if (sp.modus === "alle" && riktige.length) {
      const gjett = {};
      const mimt = {};
      riktige.forEach((l) => {
        gjett[l.gjetter] = (gjett[l.gjetter] || 0) + 1;
        mimt[l.mimer] = (mimt[l.mimer] || 0) + 1;
      });
      const topp = (m) => {
        const maks = Math.max(...Object.values(m));
        const hvem = Object.keys(m).filter((i) => m[i] === maks).map(Number);
        return { maks, hvem };
      };
      const g = topp(gjett);
      const mm = topp(mimt);
      ut.push({ ikon: "👀", tittel: "Skarpeste øyne", tekst: `${liste(g.hvem.map((i) => R.navn(i)))} – ${g.maks} ${g.maks === 1 ? "riktig gjetning" : "riktige gjetninger"}` });
      ut.push({ ikon: "🎭", tittel: "Beste mimer", tekst: `${liste(mm.hvem.map((i) => R.navn(i)))} – ${mm.maks} ${mm.maks === 1 ? "oppgave" : "oppgaver"} gjettet` });
    }
    if (riktige.length) {
      const raskest = riktige.reduce((a, b) => (b.sek < a.sek ? b : a));
      const hvem = sp.modus === "lag" ? lagNavn(raskest.mimer) : R.navn(raskest.gjetter);
      ut.push({ ikon: "⚡", tittel: "Raskeste gjetning", tekst: `${hvem} – ${raskest.sek} s på «${raskest.t}»` });
    }
    const bom = sp.logg.filter((l) => l.resultat !== "riktig");
    if (bom.length) ut.push({ ikon: "🤷", tittel: "Ingen klarte", tekst: bom.slice(-3).map((l) => `«${l.t}»`).join(", ") });
    return ut;
  }

  // ---------- The game ----------

  R.start({
    id: "mimen",
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also those with the game's own buttons in them
    pagar, // a game is running until the end screen (front-page badge, wake lock)

    // The player count starts at the number of names the group already typed in (any game).
    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, 3, 20),
      oppsett: { modus: "alle", lag: 2, runder: { alle: 2, lag: 5 }, tid: 60, niva: 2, kat: null, lyder: false },
      spill: null,
    }),

    // Repair saved settings and drop a saved game that doesn't fit this version.
    lastet(S) {
      const std = { modus: "alle", lag: 2, runder: { alle: 2, lag: 5 }, tid: 60, niva: 2, kat: null, lyder: false };
      const o = (S.oppsett = Object.assign({}, std, S.oppsett));
      if (!["alle", "lag"].includes(o.modus)) o.modus = "alle";
      if (![2, 3, 4].includes(o.lag)) o.lag = 2;
      o.runder = Object.assign({}, std.runder, o.runder);
      if (!RUNDER.alle.includes(o.runder.alle)) o.runder.alle = 2;
      if (!RUNDER.lag.includes(o.runder.lag)) o.runder.lag = 5;
      if (!TIDER.includes(o.tid)) o.tid = 60;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (o.kat != null) {
        o.kat = Array.isArray(o.kat) ? o.kat.filter((id) => katMedId(id)) : null;
        if (o.kat && (!o.kat.length || o.kat.length === KAT.length)) o.kat = null;
      }
      o.lyder = !!o.lyder;
      S.antall = R.klamp(Number(S.antall) || 4, 3, 20);
      const sp = S.spill;
      if (!sp) return;
      const ok =
        ["alle", "lag"].includes(sp.modus) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === deltakere(sp) &&
        sp.oppgave &&
        typeof sp.oppgave.t === "string" &&
        Array.isArray(sp.logg) &&
        sp.turer > 0 &&
        sp.tur < sp.turer;
      if (!ok) S.spill = null;
    },

    regler: {
      intro: "Én mimer, resten gjetter. Ingen ord, ingen lyder – bare armer, bein og ansikt.",
      steg: [
        ["Se oppgaven", "Mimeren holder fingeren på kortet og ser oppgaven. De andre ser bort så lenge."],
        ["Mim!", "Trykk start, legg fra deg mobilen og vis oppgaven uten et ord. Klokka går imens."],
        ["Riktig eller pass", "Gjetter noen riktig, trykker dere «Riktig!». I alle mot alle får både gjetteren og mimeren ett poeng."],
      ],
      tips: [
        "Vis hvor mange ord det er med fingrene. Klapp på armen for å vise hvilket ord du er på.",
        "Pek på øret når du vil si «det høres ut som …».",
        "Står du fast? Du kan bytte oppgave to ganger før du starter.",
        "Lag mot lag: bare laget til mimeren gjetter. Skru på «Lyder er lov» når de minste er med.",
      ],
    },

    // The task is only shown while the mimer holds the card.
    hemmelig: {
      innhold: (S, id) => ({ html: oppgaveKort(S.spill, id === "titt"), klasse: "mi-bak" }),
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
            slagordHtml: "Vis det – uten et eneste ord.<br><em>De andre gjetter.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–20", "spillere"],
              [String(ALLE.length), "oppgaver"],
              [String(KAT.length), "kategorier"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const antall = tellOppgaver(o);
          const valgt = o.kat || KAT.map((k) => k.id);
          const lag = `<section class="seksjon">
              <h2>Hvor mange lag?</h2>
              ${R.ui.seg("lag", [[2, "2 lag"], [3, "3 lag"], [4, "4 lag"]], o.lag, { etikett: "Antall lag" })}
              <div class="mi-lagrad">${Array.from({ length: o.lag }, (_, i) => R.ui.lagmerke(i, R.LAG[i].navn)).join("")}</div>
              <p class="hjelp">Del dere i lag. Lagene bytter på å mime, og bare laget til mimeren gjetter.</p>
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
            <div class="mi-to">
              <section class="seksjon"><h2>Runder</h2>${R.ui.seg("runder", RUNDER[o.modus].map((r) => [r, String(r)]), o.runder[o.modus], { etikett: "Antall runder" })}</section>
              <section class="seksjon"><h2>Tid</h2>${R.ui.seg("tid", TIDER.map((t) => [t, `${t} s`]), o.tid, { etikett: "Tid per oppgave" })}</section>
            </div>
            <p class="hjelp mi-tett">${o.modus === "alle" ? "Alle mimer én gang hver runde." : "Hvert lag mimer én gang hver runde."}</p>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Oppgavene</h2><span class="tall">${antall} oppgaver</span></div>
              ${R.ui.seg("niva", NIVAER.map((n) => [n.v, n.navn]), o.niva, { etikett: "Vanskelighet" })}
              <p class="hjelp">${esc(niva(o.niva).tekst)}</p>
              ${R.ui.brikker(
                "kat",
                KAT.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: tellKat(k.id, o.niva) })),
                valgt,
                { alle: true, etikett: "Kategorier" },
              )}
              ${antall ? "" : `<p class="feil">Velg minst én kategori med oppgaver.</p>`}
            </section>
            ${R.ui.bryter("lyder", o.lyder, "Lyder er lov", "Fint for de minste. Ord er fortsatt forbudt.")}
            ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !antall }))}`;
        },
      },

      // Pass the phone to the next mimer (or team).
      gi: {
        tittel: (S) => `Runde ${rundeNr(S.spill)} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const m = mimer(sp);
          if (sp.modus === "alle") {
            return R.ui.giTil({
              i: m,
              h: "klar",
              tekst: sp.tur === 0 ? "Først ut å mime" : "Neste mimer",
              knapp: `Jeg er ${R.navn(m)}`,
              prikker: [sp.antall, m],
              advarsel: "De andre ser bort",
            });
          }
          return `
            <div class="gi-til">
              ${lagFigur(m, "stor")}
              <p class="etikett">${sp.tur === 0 ? "Først ut" : "Neste lag"}</p>
              <h1 id="skjerm-tittel" class="mi-lagnavn" style="--lf: ${R.LAG[m].farge}">${esc(lagNavn(m))}</h1>
              <p class="ingress">Hvem mimer? Den som mimer, tar mobilen. Resten av laget gjetter.</p>
              <p class="ikke-se">🙈 Alle andre ser bort</p>
            </div>
            ${R.ui.dokk(R.ui.knapp("Jeg skal mime", "klar"))}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
          S.spill.sett = false; // whoever gets the phone now holds the card to see the task
        },
      },

      // The mimer reads the secret task.
      se: {
        tittel: (S) => `${navn(S.spill, mimer(S.spill))} mimer`,
        tilbake: "gi",
        gjenoppta: "gi", // after a reload the phone goes through «Gi mobilen til …» again
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="mi-instruks" id="skjerm-tittel">${sp.sett ? "Husk oppgaven!" : "Din hemmelige oppgave"}</h1>
            <p class="hjelp mi-tett">${sp.sett ? "Start klokka, legg fra deg mobilen og mim." : "Bare du skal se oppgaven. De andre ser bort."}</p>
            ${R.ui.mappe({ id: "oppgave", etikett: "Hemmelig oppgave", tekst: "Hold fingeren på kortet for å se", etikettAria: "Hold fingeren på kortet for å se oppgaven" })}
            ${R.ui.dokk(
              R.ui.knapp(sp.sett ? "Start mimingen" : "Se oppgaven først", "start-mim", { av: !sp.sett, ikon: sp.sett ? "▶" : "" }),
              sp.sett && sp.bytt > 0 ? R.ui.lenkerad(R.ui.lenke(`Kjenner du den ikke? Bytt (${sp.bytt} igjen)`, "bytt")) : "",
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "se";
        },
      },

      // The clock runs while the mimer mimes. The phone can lie on the table for all to see.
      mim: {
        tittel: (S) => `Runde ${rundeNr(S.spill)} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const m = mimer(sp);
          const pauset = sp.pause || (!startetNa && !klokke());
          // Who mimes, big enough to read from across the table (the top bar cuts long names).
          return `
            <h1 class="mi-mimer" id="skjerm-tittel">${sp.modus === "lag" ? lagFigur(m, "mini") : R.avatar(m, "mid")}<span><b>${esc(navn(sp, m))}</b> mimer</span></h1>
            <div class="mi-midt">
              <div class="mi-scene${pauset ? " pauset" : ""}">
                ${R.ui.timer({ id: "mi-tid", sekunder: sp.igjen, stor: true })}
                ${pauset ? `<p class="mi-skilt pause">⏸ Pause</p>` : `<p class="mi-skilt">${sp.lyder ? "🔊 Lyder er lov – men ingen ord" : "🤫 Ingen lyder!"}</p>`}
              </div>
              <div class="mi-titt">${R.ui.mappe({ id: "titt", etikett: "Glemt oppgaven?", tekst: "Hold fingeren på kortet for å se", etikettAria: "Glemt oppgaven? Hold fingeren på kortet for å se den igjen" })}</div>
            </div>
            ${
              pauset
                ? R.ui.dokk(R.ui.knapp("Fortsett", "fortsett-mim", { ikon: "▶" }), R.ui.lenkerad(R.ui.lenke("Pass", "pass")))
                : R.ui.dokk(
                    `<div class="mi-svarknapper">${R.ui.knapp("Pass", "pass", { variant: "papir" })}${R.ui.knapp("Riktig!", "riktig", { variant: "mynte", stille: true })}</div>`,
                    R.ui.lenkerad(R.ui.lenke("Pause", "pause")),
                  )
            }`;
        },
        etter() {
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "mim";
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
          const m = mimer(sp);
          const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== m);
          return `
            <div class="mi-hvem">
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
            <div class="mi-svar">
              <div class="stempel-sted"><h1 id="skjerm-tittel" class="stempel ${farge}">${stempel}</h1></div>
              <div class="papirboks mi-fasit">
                <p class="etikett">Oppgaven var</p>
                <p class="mi-fasit-tekst">${esc(l.t)}</p>
                ${k ? `<p class="mi-fasit-kat">${k.ikon} ${esc(k.navn)}</p>` : ""}
              </div>
              <p class="mi-svartekst">${esc(svarTekst(sp, l))}</p>
            </div>
            ${stilling(sp, l.pluss)}
            ${R.ui.dokk(
              sisteTur(sp) ? R.ui.knapp("Se hvem som vant", "slutt", { ikon: "🏆" }) : R.ui.knapp(`Neste: ${navn(sp, neste)}`, "neste"),
              R.ui.lenkerad(
                l.resultat === "riktig" ? R.ui.lenke("Angre", "angre-svar") : "",
                sisteTur(sp) ? "" : R.ui.lenke("Avslutt", "avslutt"),
              ),
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
            figur = alle ? R.avatar(vinnere[0], "gigant") : lagFigur(vinnere[0], "stor");
            etikett = alle ? "Mimemester" : "Mimemestere";
            tittel = `${navn(sp, vinnere[0])} vinner!`;
          } else if (vinnere.length > 1) {
            figur = `<span class="mi-delt">${vinnere.slice(0, 4).map((i) => (alle ? R.avatar(i, "stor") : lagFigur(i, "liten"))).join("")}</span>`;
            etikett = "Delt seier";
            tittel = `${liste(vinnere.map((i) => navn(sp, i)))} vinner!`;
          }
          const priser = kaaringer(sp);
          return `
            <div class="banner aksent${vinnere.length > 1 ? " mi-delt-banner" : ""}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${riktige} av ${sp.logg.length} ${sp.logg.length === 1 ? "oppgave" : "oppgaver"} ble gjettet.${maks > 0 ? "" : " Godt jobba likevel!"}</p>
            </div>
            ${maks > 0 ? (alle ? R.ui.pall(poengRader(sp)) : lagPall(sp)) + poengListe(sp, poengRader(sp)) : ""}
            ${priser.length ? `<ul class="mi-priser">${priser.map((p) => `<li><span class="mi-pris-ikon" aria-hidden="true">${p.ikon}</span><span><b>${esc(p.tittel)}</b><small>${esc(p.tekst)}</small></span></li>`).join("")}</ul>` : ""}
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
        let mal = ["gi", "mim", "hvem", "svar"].includes(sp.skjerm) ? sp.skjerm : "gi";
        if (mal === "svar" && sp.resultat == null) mal = "gi";
        R.holdVaken();
        R.gaTil(mal);
      },
      // While the clock runs, the rules sheet pauses it first.
      regler(el, e, S) {
        if (S.skjerm === "mim") pause(S);
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
        else valgt = valgt.includes(v) ? valgt.filter((x) => x !== v) : [...valgt, v];
        o.kat = valgt.length === alle.length ? null : valgt;
        R.vis();
      },
      lyder(el, e, S) {
        S.oppsett.lyder = !S.oppsett.lyder;
        R.vis();
      },
      async start(el, e, S) {
        const o = S.oppsett;
        if (!tellOppgaver(o)) return;
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
          lyder: o.lyder,
          poeng: Array(antall).fill(0),
          tur: 0,
          turer: o.runder[o.modus] * antall,
          logg: [],
          skjerm: "gi",
          ferdig: false,
        };
        nyTur(S.spill);
        R.holdVaken();
        R.gaTil("gi");
      },
      klar: () => R.gaTil("se"),
      bytt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.bytt <= 0) return;
        sp.bytt -= 1;
        nyOppgave(sp);
        R.lyd.snu();
        R.toast("Ny oppgave!");
        R.vis();
      },
      async "start-mim"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.sett || opptatt) return;
        opptatt = true;
        R.holdVaken();
        // Leaving during the countdown (back, then «Fortsett») must never start the clock by itself.
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", "MIM!"], 750);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        sp.igjen = sp.tid;
        sp.pause = false;
        startetNa = true;
        R.gaTil("mim");
      },
      pause: (el, e, S) => pause(S),
      "fortsett-mim": (el, e, S) => fortsett(S),
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
        const ja = await R.bekreft("Gi opp oppgaven?", "Ingen får poeng for denne.", "Pass", "Fortsett å mime");
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
        R.gaTil("mim");
      },
      // Undo the points of the last «Riktig!». Everyone against everyone goes back to choosing
      // who guessed (from there «Angre» again means keep miming); teams go straight back to miming.
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
        R.toast("Angret – mim videre!");
        R.gaTil("mim");
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
