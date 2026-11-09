/* Papegøyen — «Ja- og nei-forbudet».
   One player sits in the parrot's chair and answers rapid questions without saying «ja» or «nei»
   (optionally no nodding or head shaking either, or the stricter «jo», «jepp» and «nope»). The
   others fire questions from the app – or their own. «Sa det!» ends the turn with a squawk. The
   score is how long you lasted; the most seconds in total wins. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const PAKKER = window.RUSJ_DATA.sporsmal.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  // Quick follow-ups («Er du sikker?») are shown under each question, never drawn as one.
  const OPPFOLGERE = window.RUSJ_DATA.sporsmal.oppfolgere || [];

  // Every question in one list, so the deck remembers what this device has already shown.
  const ALLE = [];
  PAKKER.forEach((p) => p.sporsmal.forEach((t) => ALLE.push({ p: p.id, t })));
  const stokk = R.kortstokk("sporsmal", ALLE.length);

  const TIDER = [30, 60, 90];
  const RUNDER = [1, 2, 3];
  const STD = { pakker: PAKKER.map((p) => p.id), tid: 60, runder: 1, nikk: false, streng: false };
  const SKRIK = ["Sa det! Sa det!", "Rrraah! Hørte det!", "Hehe! Sa det!", "Papegøyen hørte alt!", "Sa det, sa det!", "Rrrah! Avslørt!"];

  let H; // the actions, so one can call another
  let startetNa = false; // the turn was entered from the countdown: start the clock
  let opptatt = false; // the countdown runs: ignore extra taps

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const spillerPa = (sp, tur) => (sp.start + tur) % sp.antall;
  const rundeNr = (sp) => Math.floor(sp.tur / sp.antall) + 1;
  const heleTiden = (tid) => (tid === 60 ? "hele minuttet" : `alle ${tid} sekundene`);
  const sekunder = (n) => R.flertall(n, "sekund", "sekunder");
  const antallSporsmal = (o) => ALLE.filter((q) => o.pakker.includes(q.p)).length;

  // ---------- Questions ----------

  function nyttSporsmal(sp) {
    const lov = new Set(sp.pakker);
    const forrige = sp.na.q;
    let q = stokk.neste((n) => lov.has(ALLE[n].p) && n !== forrige);
    if (q < 0) q = 0;
    sp.na.q = q;
    // {annen} in a question is someone else in the group, picked once per question.
    const andre = Array.from({ length: sp.antall }, (_, k) => k).filter((k) => k !== sp.na.i);
    sp.na.annen = andre.length ? R.velg(andre) : sp.na.i;
    sp.na.spm += 1;
  }
  function sporsmalTekst(sp) {
    const na = sp.na;
    const q = ALLE[na.q] || ALLE[0];
    // Functions as replacements, so «$&» or «$'» in a name is plain text.
    return q.t.replace(/\{navn\}/g, () => R.navn(na.i)).replace(/\{annen\}/g, () => R.navn(na.annen));
  }
  function nyTur(sp) {
    sp.na = { i: spillerPa(sp, sp.tur), igjen: sp.tid, spm: 0, q: -1, annen: 0, pause: false, ferdig: false };
    nyttSporsmal(sp);
  }

  // ---------- Sound: a squawk ----------

  function skrik() {
    R.lyd.tone(820, 0, 0.16, "sawtooth", 0.2, 1500);
    R.lyd.tone(1450, 0.15, 0.22, "sawtooth", 0.18, 700);
    R.lyd.stoy(0, 0.32, 0.22, 2600);
    R.lyd.tone(1000, 0.42, 0.13, "square", 0.12, 1700);
    R.lyd.tone(1600, 0.54, 0.24, "sawtooth", 0.15, 760);
    R.lyd.stoy(0.44, 0.3, 0.18, 3000);
  }

  // ---------- The clock ----------

  const klokke = () => R.timer("pa-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const na = sp.na;
    const tur = sp.tur;
    let sist = 0;
    const t = new R.Timer({
      id: "pa-tid",
      sekunder: Math.max(0.5, na.igjen),
      visning: "sek",
      vedTikk: (sek) => {
        if (S.spill !== sp || sp.tur !== tur || na.ferdig) return;
        // Lasting the whole time is a win: finish here, before the kit's alarm beep and buzz.
        if (sek <= 0) {
          ferdigTur(S, "klarte");
          return;
        }
        na.igjen = t.igjen;
        if (Date.now() - sist > 900) {
          sist = Date.now();
          R.lagre();
        }
      },
      vedSlutt: () => {
        if (S.spill === sp && sp.tur === tur && !na.ferdig) ferdigTur(S, "klarte");
      },
    });
    t.total = sp.tid; // the ring shows the whole turn, also after a pause or a reload
    return t;
  }
  function pause(S) {
    const sp = S.spill;
    const na = sp && sp.na;
    if (!na || na.ferdig || na.pause) return;
    const t = klokke();
    if (t) {
      t.pause();
      na.igjen = Math.max(0.5, t.igjen);
    }
    na.pause = true;
    if (S.skjerm === "spill") R.vis();
  }
  function fortsett(S) {
    const sp = S.spill;
    const na = sp && sp.na;
    if (!na || na.ferdig) return;
    na.pause = false;
    const t = klokke() || lagKlokke(S);
    R.vis();
    t.start();
    R.holdVaken();
  }
  // A phone that is locked or switches app in the middle of a turn pauses it.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "spill") pause(S);
  });

  // The turn is over: the chair said it (sa) or lasted the whole time (klarte).
  function ferdigTur(S, hvordan) {
    const sp = S.spill;
    const na = sp && sp.na;
    if (!na || na.ferdig) return;
    const t = klokke();
    const klarte = hvordan === "klarte";
    const igjen = klarte ? 0 : t ? t.igjen : na.igjen;
    if (t) t.stopp();
    const sek = klarte ? sp.tid : R.klamp(Math.floor(sp.tid - igjen), 0, sp.tid);
    na.ferdig = true;
    na.igjen = Math.max(0.5, igjen);
    sp.logg.push({ i: na.i, sek, spm: na.spm, klarte, tur: sp.tur, igjen: Math.max(0.5, igjen), lurt: klarte ? "" : sporsmalTekst(sp) });
    sp.logg = sp.logg.slice(-120);
    sp.tider[na.i] += sek;
    if (klarte) {
      R.lyd.fanfare();
      R.vibrer([30, 40, 60]);
    } else {
      skrik();
      R.vibrer([60, 40, 140]);
    }
    R.gaTil("ute");
  }

  // ---------- Pieces ----------

  // Progress dots for this round, in turn order and in each player's own colour.
  function prikker(sp) {
    const forste = sp.tur - (sp.tur % sp.antall);
    const na = sp.tur % sp.antall;
    return `<div class="fremdrift" aria-hidden="true">${Array.from({ length: sp.antall }, (_, k) => {
      const i = spillerPa(sp, forste + k);
      return `<span class="prikk ${k === na ? "na" : k < na ? "ferdig" : ""}" style="--pf: var(--p${(i % 20) + 1})"></span>`;
    }).join("")}</div>`;
  }

  function forbud(sp) {
    const deler = [`<span class="pa-forbudt">«ja»</span>`, `<span class="pa-forbudt">«nei»</span>`];
    if (sp.streng) deler.push(`<span class="pa-forbudt">«jo» · «jepp» · «nope»</span>`);
    if (sp.nikk) deler.push(`<span class="pa-forbudt nikk">nikk og hoderisting</span>`);
    return `<p class="pa-forbud"><span class="vh">Forbudt: </span>${deler.join("")}</p>`;
  }

  // Scores are seconds: the kit's list and podium, with «s» instead of «p».
  const rader = (sp, pluss) => sp.tider.map((poeng, i) => ({ i, poeng, pluss: pluss && pluss.i === i ? `${pluss.sek} s` : null }));
  const sekListe = (liste) => `<div class="pa-sek">${R.ui.poengliste(liste)}</div>`;
  const sekPall = (liste) => R.ui.pall(liste).replace(/(class="poeng">[^<]*?) p</g, "$1 s<");
  function stilling(sp, pluss) {
    const alle = rader(sp, pluss);
    if (alle.length <= 8) return sekListe(alle);
    const topp = alle.slice().sort((a, b) => b.poeng - a.poeng).slice(0, 5);
    return `${sekListe(topp)}<p class="hjelp">Topp fem av ${alle.length}. Hele lista kommer på slutten.</p>`;
  }

  // ---------- The game ----------

  R.start({
    id: "papegoyen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 3, 2, 20),
      oppsett: Object.assign({}, STD, { pakker: STD.pakker.slice() }),
      spill: null,
    }),

    // Repair saved settings and drop a saved game that doesn't fit this version.
    lastet(S) {
      const o = (S.oppsett = Object.assign({}, STD, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : STD.pakker).filter((id) => pakke(id));
      if (!TIDER.includes(o.tid)) o.tid = 60;
      if (!RUNDER.includes(o.runder)) o.runder = 1;
      o.nikk = !!o.nikk;
      o.streng = !!o.streng;
      S.antall = R.klamp(Number(S.antall) || 3, 2, 20);
      const sp = S.spill;
      const ok =
        sp &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 2 &&
        Array.isArray(sp.tider) &&
        sp.tider.length === sp.antall &&
        Array.isArray(sp.logg) &&
        TIDER.includes(sp.tid) &&
        Number.isInteger(sp.tur) &&
        sp.tur < sp.turer &&
        sp.na &&
        ALLE[sp.na.q] &&
        Array.isArray(sp.pakker) &&
        sp.pakker.length > 0;
      if (sp && !ok) S.spill = null;
      if (!S.spill && !["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
      // A finished turn always shows its result (never a stopped clock).
      if (S.spill && S.skjerm === "spill" && S.spill.na.ferdig) S.skjerm = "ute";
    },

    regler: {
      intro: "Én sitter i papegøyestolen og svarer på spørsmål – uten å si «ja» eller «nei». Papegøyen hører alt!",
      steg: [
        ["Still spørsmål – fort!", "De andre leser spørsmål fra mobilen eller finner på egne. Jo raskere, jo lurere."],
        ["Ikke si det!", "Sier den i stolen «ja» eller «nei», trykker dere «Sa det!». Da er turen over."],
        ["Den som holder ut lengst, vinner", "Sekundene du holder ut, blir poengene dine. Flest sekunder til slutt vinner."],
      ],
      tips: [
        "Svar med «det stemmer», «absolutt» eller «overhodet ikke» i stedet.",
        "Følg opp med «Er du sikker?» og «Lover du?» – det lurer de fleste.",
        "Strenge regler: heller ikke «jo», «jepp» eller «nope». Med nikkeforbud er det heller ikke lov å nikke eller riste på hodet.",
        "Trykket noen «Sa det!» ved en feil? «Angre» gir tiden tilbake.",
        "Det er alltid lov å stå over en tur.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Svar på alt – men aldri «ja» eller «nei».<br><em>Papegøyen hører alt!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · ${R.navn(S.spill.na.i)} i stolen` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–20", "spillere"],
              [String(ALLE.length), "spørsmål"],
              ["60 s", "i stolen"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = antallSporsmal(o);
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            ${R.ui.spillere({ min: 2, max: 20, hjelp: "Alle får sin tur i papegøyestolen." })}
            <section class="seksjon pa-pakker">
              <div class="seksjon-hode"><h2>Spørsmålene</h2><span class="tall">${n} spørsmål</span></div>
              ${R.ui.fliser(
                "pakke",
                PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: p.tekst, ikon: p.ikon })),
                o.pakker,
              )}
              ${n ? `<p class="hjelp">Dere kan også stille egne spørsmål underveis.</p>` : ""}
            </section>
            <div class="pa-to">
              <section class="seksjon"><h2>Tid i stolen</h2>${R.ui.seg("tid", TIDER.map((t) => [t, `${t} s`]), o.tid, { etikett: "Tid i stolen" })}</section>
              <section class="seksjon"><h2>Runder</h2>${R.ui.seg("runder", RUNDER.map((r) => [r, String(r)]), o.runder, { etikett: "Antall runder" })}</section>
            </div>
            <section class="seksjon">
              ${R.ui.bryter("nikk", o.nikk, "Nikkeforbud", "Heller ikke lov å nikke eller riste på hodet.")}
              ${R.ui.bryter("streng", o.streng, "Strenge regler", "Heller ikke «jo», «jepp» eller «nope».")}
            </section>
            ${R.ui.dokk(n ? "" : `<p class="feil">Velg minst én pakke for å starte.</p>`, R.ui.knapp("Start", "start", { av: !n, ikon: "🦜" }))}`;
        },
      },

      // Who sits in the chair next. Nothing secret: everyone may look.
      stol: {
        tittel: (S) => (S.spill.runder > 1 ? `Runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "Papegøyen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.na.i;
          return `
            ${prikker(sp)}
            <div class="gi-til pa-stol">
              <span class="pa-stol-avatar">${R.avatar(i, "gigant")}<span class="pa-stol-merke" aria-hidden="true">🦜</span></span>
              <p class="etikett">${sp.tur === 0 ? "Først i papegøyestolen" : "Neste i papegøyestolen"}</p>
              <h1 id="skjerm-tittel">${esc(R.navn(i))}</h1>
              <p class="pa-stol-tekst">Svar i ${sekunder(sp.tid)} uten å si</p>
              ${forbud(sp)}
              <p class="hjelp">De andre stiller spørsmålene – fra mobilen eller egne.</p>
            </div>
            ${R.ui.dokk(R.ui.knapp("Klar!", "klar", { ikon: "🦜" }), R.ui.lenkerad(R.ui.lenke("Stå over", "sta-over"), R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn(S) {
          S.spill.skjerm = "stol";
        },
      },

      // The turn: the clock runs and the questions come.
      spill: {
        tittel: (S) => (S.spill.runder > 1 ? `Runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "Papegøyen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const na = sp.na;
          const pauset = na.pause || (!startetNa && !klokke());
          const tekst = sporsmalTekst(sp);
          const kort = R.ui.storkort({
            tekst,
            etikett: `Spørsmål ${na.spm}`,
            nr: pakke(ALLE[na.q].p) ? `${pakke(ALLE[na.q].p).ikon}` : "",
            sveip: pauset ? null : "neste",
            kompakt: true,
            klasse: `pa-kort${tekst.length > 40 ? " pa-lang" : ""}`,
            fot: OPPFOLGERE.length ? `Følg opp: «${OPPFOLGERE[(na.q + na.spm) % OPPFOLGERE.length]}»` : "",
          });
          return `
            <div class="pa-topp">
              <div class="pa-hvem">${R.avatar(na.i, "mid")}<span><small>I stolen</small><h1 id="skjerm-tittel">${esc(R.navn(na.i))}</h1></span></div>
              ${R.ui.timer({ id: "pa-tid", sekunder: na.igjen, visning: "sek" })}
            </div>
            ${forbud(sp)}
            <div class="pa-kortplass${pauset ? " pauset" : ""}">${kort}${pauset ? `<p class="pa-pauseskilt">⏸ Pause</p>` : ""}</div>
            ${
              pauset
                ? R.ui.dokk(R.ui.knapp("Fortsett", "fortsett-tur", { ikon: "▶" }), R.ui.lenkerad(R.ui.lenke("Sa det!", "sa-det"), R.ui.lenke("Avslutt", "avslutt")))
                : R.ui.dokk(
                    `<div class="pa-knapper">${R.ui.knapp("Sa det!", "sa-det", { variant: "rod", ikon: "🦜", stille: true })}${R.ui.knapp("Neste spørsmål", "neste")}</div>`,
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
          sp.skjerm = "spill";
          const fersk = startetNa;
          startetNa = false;
          if (!sp.na || sp.na.ferdig) return;
          const t = lagKlokke(S);
          if (fersk && !sp.na.pause) {
            t.start();
            R.holdVaken();
          } else {
            sp.na.pause = true;
            R.vis();
          }
        },
        ut(S) {
          const sp = S.spill;
          const t = klokke();
          if (sp && sp.na && t && !sp.na.ferdig) {
            sp.na.igjen = Math.max(0.5, t.igjen);
            sp.na.pause = true;
          }
        },
      },

      // The result of a turn: the parrot squawks (or the chair lasted the whole time).
      ute: {
        tittel: (S) => (S.spill.runder > 1 ? `Runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "Papegøyen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const l = sp.logg[sp.logg.length - 1];
          const siste = sp.tur + 1 >= sp.turer;
          const neste = spillerPa(sp, sp.tur + 1);
          const navn = R.navn(l.i);
          const topp = l.klarte
            ? `<div class="pa-klarte">
                <div class="stempel-sted"><span class="stempel mynte">Klarte det!</span></div>
                <span class="pa-vinneravatar">${R.avatar(l.i, "gigant")}</span>
                <h1 id="skjerm-tittel">${esc(`${navn} klarte ${heleTiden(sp.tid)}!`)}</h1>
              </div>`
            : `<div class="pa-skrik">
                <div class="pa-papegoye">${R.figur()}<span class="pa-boble">${esc(SKRIK[(sp.tur + l.spm) % SKRIK.length])}</span>
                  <span class="pa-fjar f1" aria-hidden="true">🪶</span><span class="pa-fjar f2" aria-hidden="true">🪶</span><span class="pa-fjar f3" aria-hidden="true">🪶</span></div>
                <h1 id="skjerm-tittel">${esc(`${navn} holdt ut i ${sekunder(l.sek)}`)}</h1>
                ${l.lurt ? `<p class="pa-lurt">Lurt av: «${esc(l.lurt)}»</p>` : ""}
              </div>`;
          return `
            ${topp}
            <p class="pa-tall"><span><b>${l.sek}</b> s</span><span><b>${l.spm}</b> spørsmål</span>${sp.runder > 1 ? `<span><b>${sp.tider[l.i]}</b> s totalt</span>` : ""}</p>
            <div class="pa-stilling">${stilling(sp, { i: l.i, sek: l.sek })}</div>
            ${R.ui.dokk(
              R.ui.knapp(siste ? "Se hvem som vant" : `Neste: ${R.navn(neste)}`, "neste-spiller", { ikon: siste ? "🏆" : "🦜" }),
              R.ui.lenkerad(l.klarte ? "" : R.ui.lenke("Angre – det ble ikke sagt", "angre"), siste ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "ute";
          const l = sp.logg[sp.logg.length - 1];
          if (l && l.klarte && !l.feiret) {
            l.feiret = true;
            R.lagre();
            R.konfetti(); // the fanfare already played when the time ran out
          }
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const maks = Math.max(...sp.tider);
          const vinnere = maks > 0 ? sp.tider.map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0) : [];
          const alle = rader(sp);
          let figur = R.figur();
          let etikett = "Ingen vinner";
          let tittel = "Papegøyen vant!";
          let ingress = "Alle sa det med en gang. Det er jo det som er så gøy!";
          if (vinnere.length === 1) {
            figur = `<span class="pa-vinner">${R.avatar(vinnere[0], "gigant")}<span class="pa-krone" aria-hidden="true">🦜</span></span>`;
            etikett = "Papegøyeproff";
            tittel = `${R.navn(vinnere[0])} vinner!`;
            ingress = `Holdt ut i ${sekunder(maks)}${sp.runder > 1 ? " til sammen" : ""} uten å si «ja» eller «nei».`;
          } else if (vinnere.length > 1) {
            figur = `<span class="pa-delt">${vinnere.slice(0, 4).map((i) => R.avatar(i, "stor")).join("")}</span>`;
            etikett = "Delt seier";
            tittel = `${R.ramsOpp(vinnere.map((i) => R.navn(i)))} vinner!`;
            ingress = `Like lenge: ${sekunder(maks)}${sp.runder > 1 ? " til sammen" : ""}.`;
          }
          const turer = sp.logg.filter((l) => !l.hoppet);
          const priser = [];
          if (turer.length) {
            const lengst = turer.reduce((a, b) => (b.sek > a.sek ? b : a));
            if (lengst.sek > 0) priser.push({ ikon: "⏱️", tittel: "Lengste tur", tekst: `${R.navn(lengst.i)} – ${sekunder(lengst.sek)}` });
            const flest = turer.reduce((a, b) => (b.spm > a.spm ? b : a));
            if (flest.spm > 1) priser.push({ ikon: "💬", tittel: "Flest spørsmål på én tur", tekst: `${R.navn(flest.i)} – ${flest.spm} spørsmål` });
            const klarte = Array.from(new Set(turer.filter((l) => l.klarte).map((l) => l.i)));
            if (klarte.length) priser.push({ ikon: "🏅", tittel: `Klarte ${heleTiden(sp.tid)}`, tekst: R.ramsOpp(klarte.map((i) => R.navn(i))) });
          }
          return `
            <div class="banner aksent${vinnere.length > 1 ? " pa-delt-banner" : ""}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${esc(ingress)}</p>
            </div>
            ${maks > 0 ? sekPall(alle) + sekListe(alle) : ""}
            ${priser.length ? `<ul class="pa-priser">${priser.map((p) => `<li><span class="pa-pris-ikon" aria-hidden="true">${p.ikon}</span><span><b>${esc(p.tittel)}</b><small>${esc(p.tekst)}</small></span></li>`).join("")}</ul>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          const forste = !sp.feiret;
          sp.ferdig = true;
          sp.feiret = true;
          sp.skjerm = "slutt";
          R.slippVaken();
          R.lagre();
          if (!forste) return;
          R.statistikk("ferdig", { spillere: sp.antall, turer: sp.logg.length, klarte: sp.logg.filter((l) => l.klarte).length });
          R.kveld.registrer(rader(sp).map((r) => ({ i: r.i, poeng: r.poeng })));
          if (sp.tider.some((p) => p > 0)) {
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
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        R.holdVaken();
        if (sp.na.ferdig) R.gaTil("ute");
        else if (sp.skjerm === "spill") R.gaTil("spill");
        else R.gaTil("stol");
      },
      // While the clock runs, the rules sheet pauses it first.
      regler(el, e, S) {
        if (S.skjerm === "spill") pause(S);
        R.visRegler();
      },
      pakke(el, e, S) {
        const o = S.oppsett;
        const v = el.dataset.v;
        o.pakker = o.pakker.includes(v) ? o.pakker.filter((x) => x !== v) : PAKKER.map((p) => p.id).filter((id) => id === v || o.pakker.includes(id));
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      nikk(el, e, S) {
        S.oppsett.nikk = !S.oppsett.nikk;
        R.vis();
      },
      streng(el, e, S) {
        S.oppsett.streng = !S.oppsett.streng;
        R.vis();
      },
      async start(el, e, S) {
        const o = S.oppsett;
        if (!antallSporsmal(o)) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        const antall = R.klamp(S.antall, 2, 20);
        S.spill = {
          antall,
          tid: o.tid,
          runder: o.runder,
          nikk: o.nikk,
          streng: o.streng,
          pakker: o.pakker.slice(),
          start: R.heltall(0, antall - 1),
          tur: 0,
          turer: antall * o.runder,
          tider: Array(antall).fill(0),
          logg: [],
          na: null,
          skjerm: "stol",
          ferdig: false,
        };
        nyTur(S.spill);
        R.statistikk("start", { spillere: antall, tid: o.tid, runder: o.runder, nikk: o.nikk, streng: o.streng });
        R.holdVaken();
        R.gaTil("stol");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
      async klar(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || sp.na.ferdig || opptatt) return;
        opptatt = true;
        R.holdVaken();
        // Leaving during the countdown (back, then «Fortsett») must never start the clock by itself.
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", "SVAR!"], 700);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        sp.na.igjen = sp.tid;
        sp.na.pause = false;
        startetNa = true;
        R.gaTil("spill");
      },
      async "sta-over"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || sp.na.ferdig) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(`Skal ${R.navn(sp.na.i)} stå over?`, "Helt greit! Turen går videre til neste.", "Stå over", "Avbryt");
        if (!ja || !fortsatt() || S.spill !== sp) return;
        sp.logg.push({ i: sp.na.i, sek: 0, spm: 0, klarte: false, hoppet: true, tur: sp.tur, igjen: sp.tid });
        if (sp.tur + 1 >= sp.turer) {
          sp.ferdig = true;
          R.gaTil("slutt");
          return;
        }
        sp.tur += 1;
        nyTur(sp);
        R.gaTil("stol");
      },
      async neste(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || sp.na.ferdig || sp.na.pause || S.skjerm !== "spill") return;
        // The swipe already flew the card out; a tap on the button flies it the same way.
        const fortsatt = R.vakt();
        if (el && el.classList && !el.classList.contains("storkort")) await R.kastKort(-1);
        if (!fortsatt() || !sp.na || sp.na.ferdig || S.skjerm !== "spill") return;
        nyttSporsmal(sp);
        R.vis();
      },
      "sa-det"(el, e, S) {
        if (S.skjerm !== "spill") return;
        ferdigTur(S, "sa");
      },
      pause: (el, e, S) => pause(S),
      "fortsett-tur": (el, e, S) => fortsett(S),
      // «Sa det!» by mistake: the time comes back and the turn goes on (paused).
      angre(el, e, S) {
        const sp = S.spill;
        const l = sp && sp.logg[sp.logg.length - 1];
        if (!l || l.klarte || l.hoppet || l.tur !== sp.tur || !sp.na || !sp.na.ferdig) return;
        sp.logg.pop();
        sp.tider[l.i] = Math.max(0, sp.tider[l.i] - l.sek);
        sp.na.ferdig = false;
        sp.na.igjen = Math.max(0.5, l.igjen);
        sp.na.pause = true;
        R.lyd.snu();
        R.gaTil("spill");
      },
      "neste-spiller"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || !sp.na.ferdig) return;
        if (sp.tur + 1 >= sp.turer) {
          sp.ferdig = true;
          R.gaTil("slutt");
          return;
        }
        sp.tur += 1;
        nyTur(sp);
        R.gaTil("stol");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (S.skjerm === "spill") pause(S);
        const harTid = sp.tider.some((p) => p > 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", harTid ? "Den som har holdt ut lengst så langt, vinner." : "Ingen har fått sekunder ennå.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (!harTid) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        sp.ferdig = true;
        R.gaTil("slutt");
      },
    }),
  });
})();
