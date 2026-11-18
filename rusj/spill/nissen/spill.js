/* Nissen — «Mandelen i grøten» (the almond in the Christmas porridge) as a bluffing game.
   Every round the phone goes round the table: each player holds a finger on the porridge bowl and
   sees, in secret, «Bare grøt» or «MANDELEN!». Exactly one gets the almond. Everyone has a real
   almond (or something as big) in hand: all turn away at once and pretend to pop it in their mouth, but only
   the almond holder really does. Then the elf (nissen)
   asks one player at a time an awkward question, everybody points at once at whoever they think is
   hiding the almond, and the bowl is turned over. Caught: everyone else gets 1 point. Got away with
   it: the almond holder gets 3 points and the marzipan pig. Kåringen after the last round.
   Until November 2026 /nissen/ was the Secret Santa draw (now /nissetrekning/). Personal draw links
   people sent before that (…/nissen/#2…) are handed on to the draw first thing, with the hash.
   The rules at the top are pure; test/nissen.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Old Secret Santa links: hand them on before anything else ----------

  // A personal draw link: "2" (the format) and the token in Crockford base32 (see nissetrekning).
  const TREKNINGSLENKE = /^2[0-9A-HJKMNP-TV-Z]+$/i;
  try {
    const hash = (window.location && window.location.hash ? window.location.hash : "").slice(1);
    if (hash && TREKNINGSLENKE.test(hash) && window.Rusj) {
      const g = (window.RUSJ_ANDRE || []).find((x) => x.id === "nissetrekning");
      window.location.replace((g && g.url ? g.url : "/nissetrekning/") + "#" + hash);
      return;
    }
  } catch (e) {
    /* not a browser: carry on */
  }

  // ---------- The rules (no kit needed) ----------

  const RUNDER = [3, 5, 7];
  const POENG_FANGET = 1; // to everyone but the almond holder, when the holder is caught
  const POENG_SLAPP = 3; // to the almond holder, who got away with it

  // A new game: the almond goes to a random player; the first to see the bowl is player 0.
  function ny(antall, runder, rng) {
    return {
      antall,
      runder,
      runde: 0, // rounds finished
      mandel: Math.floor(rng() * antall),
      start: 0, // the first to see the bowl this round
      sett: 0, // how many have seen their bowl this round
      sett1: false, // the one holding the phone has seen it
      fase: "gi",
      poeng: Array(antall).fill(0),
      slapp: Array(antall).fill(0), // times each player got away with the almond
      spurt: null, // the player the elf is asking
      k: null, // the question
      pekt: [],
      siste: null,
      ferdig: false,
    };
  }
  // Whose turn it is to see the bowl.
  const tur = (sp) => (sp.start + sp.sett) % sp.antall;

  // The one holding the phone has looked at the bowl.
  function sett(sp) {
    if (sp.fase !== "se") return false;
    sp.sett1 = true;
    return true;
  }
  // Pass on: the next player, or «turn away and pop it in» when everybody has seen their bowl.
  function videre(sp) {
    if (sp.fase !== "se" || !sp.sett1) return null;
    sp.sett += 1;
    sp.sett1 = false;
    sp.fase = sp.sett >= sp.antall ? "munn" : "gi";
    return sp.fase;
  }
  // Everyone has turned back round (one of them with the almond in their mouth): the elf's questions.
  function imunnen(sp) {
    if (sp.fase !== "munn") return null;
    sp.fase = "prat";
    return sp.fase;
  }
  // The elf picks the next player to ask: never the same twice in a row.
  function nesteSpurt(sp, rng) {
    if (sp.antall < 2) return 0;
    let i = Math.floor(rng() * (sp.antall - (sp.spurt == null ? 0 : 1)));
    if (sp.spurt != null && i >= sp.spurt) i += 1;
    return i;
  }
  // The bowl is turned over: pekt = the players who got the most fingers (may be empty).
  function avgjor(sp, pekt) {
    if (sp.fase !== "pek") return null;
    const liste = [...new Set((pekt || []).filter((i) => Number.isInteger(i) && i >= 0 && i < sp.antall))].sort((a, b) => a - b);
    const fanget = liste.includes(sp.mandel);
    const pluss = Array(sp.antall).fill(0);
    if (fanget) {
      for (let i = 0; i < sp.antall; i++) if (i !== sp.mandel) pluss[i] = POENG_FANGET;
    } else pluss[sp.mandel] = POENG_SLAPP;
    pluss.forEach((p, i) => (sp.poeng[i] += p));
    if (!fanget) sp.slapp[sp.mandel] += 1;
    sp.pekt = liste;
    sp.siste = { fanget, pluss, mandel: sp.mandel };
    sp.fase = "fasit";
    return sp.siste;
  }
  // Take back the last result and point again.
  function angre(sp) {
    const r = sp.siste;
    if (sp.fase !== "fasit" || !r) return false;
    r.pluss.forEach((p, i) => (sp.poeng[i] -= p));
    if (!r.fanget) sp.slapp[r.mandel] -= 1;
    sp.siste = null;
    sp.fase = "pek";
    return true;
  }
  // The next round (a new almond, the next player starts), or the end.
  function nesteRunde(sp, rng) {
    if (sp.fase !== "fasit") return null;
    sp.runde += 1;
    if (sp.runde >= sp.runder) {
      sp.ferdig = true;
      return "slutt";
    }
    Object.assign(sp, { mandel: Math.floor(rng() * sp.antall), start: sp.runde % sp.antall, sett: 0, sett1: false, fase: "gi", spurt: null, k: null, pekt: [], siste: null });
    return "gi";
  }

  const R = window.Rusj;
  if (!R) {
    window.Nissen = { RUNDER, POENG_FANGET, POENG_SLAPP, TREKNINGSLENKE, ny, tur, sett, videre, imunnen, nesteSpurt, avgjor, angre, nesteRunde };
    return;
  }

  // ---------- The game ----------

  const SPORSMAL = window.RUSJ_DATA.sporsmal;
  const esc = R.esc;
  const stokk = R.kortstokk("sporsmal", SPORSMAL.length);
  const MIN = 3;
  const MAKS = 12;
  const PRATETID = 60; // seconds of the elf's questions before pointing
  const HOLD = R.t("Hold fingeren på kortet for å se");
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  let H; // the actions, so one action can reuse another
  let teller = false; // the 3-2-1 countdown is running
  let feire = false; // Kåringen was just reached (not a reload)

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS);
  }

  // The elf asks the next player a new question.
  function nyttSporsmal(sp) {
    sp.spurt = nesteSpurt(sp, Math.random);
    sp.k = stokk.neste();
    if (sp.k < 0 || !SPORSMAL[sp.k]) sp.k = R.heltall(0, SPORSMAL.length - 1);
  }

  const rader = (sp, medPluss) => sp.poeng.map((poeng, i) => ({ i, poeng, ...(medPluss && sp.siste && sp.siste.pluss[i] ? { pluss: sp.siste.pluss[i] } : {}) }));
  const toppen = (sp) => {
    const best = Math.max(...sp.poeng);
    return best > 0 ? range(sp.antall).filter((i) => sp.poeng[i] === best) : [];
  };

  // Once per game, when it is over: statistics and the evening's scoreboard.
  function fullfor(S) {
    const sp = S.spill;
    if (!sp || sp.feiret) return;
    sp.ferdig = true;
    sp.feiret = true;
    feire = true;
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.runde, avbrutt: sp.runde < sp.runder });
    if (sp.runde > 0) R.kveld.registrer(rader(sp));
  }

  // The porridge bowl, drawn: with the almond on top or just porridge.
  const bolle = (mandel) => `
    <svg class="ng-bolle" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="48" rx="66" ry="20" fill="#fff4dc" stroke="var(--blekk)" stroke-width="5"/>
      <path d="M14 48 Q16 108 80 110 Q144 108 146 48" fill="#3a6fd8" stroke="var(--blekk)" stroke-width="5" stroke-linejoin="round"/>
      <path d="M28 70 Q80 84 132 70" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 10"/>
      <ellipse cx="96" cy="45" rx="13" ry="6" fill="#ffd23f" stroke="var(--blekk)" stroke-width="3"/>
      <circle cx="58" cy="44" r="2.2" fill="#c98a4b"/><circle cx="70" cy="50" r="2" fill="#c98a4b"/><circle cx="112" cy="52" r="2" fill="#c98a4b"/>
      ${mandel ? `<g class="ng-mandel"><path d="M46 44 Q50 26 72 24 Q84 24 86 30 Q78 46 46 44Z" fill="#c8874a" stroke="var(--blekk)" stroke-width="3.5" stroke-linejoin="round"/><path d="M54 40 Q66 32 80 30" fill="none" stroke="#8a5428" stroke-width="2.4" stroke-linecap="round"/></g>` : ""}
    </svg>`;

  R.start({
    id: "nissen",
    versjon: 2, // version 1 was the Secret Santa draw that used to live here (now «nissetrekning»)
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      runder: 5,
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      if (!RUNDER.includes(S.runder)) S.runder = 5;
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const liste = (l) => Array.isArray(l) && l.length === n && l.every((x) => Number.isInteger(x));
        const ok =
          Number.isInteger(n) && n >= MIN && n <= MAKS &&
          RUNDER.includes(sp.runder) && Number.isInteger(sp.runde) && sp.runde >= 0 && sp.runde <= sp.runder &&
          spiller(sp.mandel) && spiller(sp.start) && Number.isInteger(sp.sett) && sp.sett >= 0 && sp.sett <= n &&
          ["gi", "se", "munn", "prat", "pek", "fasit"].includes(sp.fase) &&
          liste(sp.poeng) && liste(sp.slapp) && Array.isArray(sp.pekt) && sp.pekt.every(spiller) &&
          (sp.fase !== "prat" || (spiller(sp.spurt) && !!SPORSMAL[sp.k])) &&
          (sp.fase !== "fasit" || (sp.siste && Array.isArray(sp.siste.pluss) && sp.siste.pluss.length === n));
        if (!ok) S.spill = null;
      }
      const skjermer = { gi: "gi", se: "gi", munn: "munn", prat: "prat", pek: "pek", fasit: "fasit" };
      if (["gi", "se", "munn", "prat", "pek", "fasit"].includes(S.skjerm)) S.skjerm = pagar(S) ? skjermer[S.spill.fase] : "hjem";
      // The bowl is never on the screen after a reload: back to «give the phone to …».
      if (pagar(S) && S.spill.fase === "se") {
        S.spill.fase = "gi";
        S.spill.sett1 = false;
      }
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Mandelen i grøten som bløffespill. Én av dere får mandelen i hemmelighet – og må late som ingenting mens nissen stiller spørsmål.") + " " + R.t("Dere trenger én hel mandel per spiller – eller noe like stort, som en sjokoladebit eller en stor drops."),
      steg: [
        [R.t("Se i bollen"), R.t("Mobilen går rundt. Hold fingeren på grøtbollen og se i hemmelighet om du fikk mandelen. Bare én får den.")],
        [R.t("Snu dere bort"), R.t("Alle snur seg samtidig og later som de putter mandelen i munnen. Bare den som fikk mandelen, putter den ekte i munnen – de andre gjemmer sin i hånda.")],
        [R.t("Nissen spør"), R.t("Nissen stiller spørsmål til én og én. Svar så godt du kan – med mandelen i munnen – og prøv å se uskyldig ut.")],
        [R.t("Pek samtidig"), R.t("Tell ned og pek på den du tror har mandelen. Den som holder mobilen, trykker på den eller dem som fikk flest fingrer.")],
        [R.t("Gap opp"), R.t("Den som hadde mandelen, gaper opp og viser den. Ble mandelholderen tatt, får alle andre 1 poeng. Slapp hen unna, får hen 3 poeng og marsipangrisen.")],
      ],
      tips: [R.t("Alle trenger en hel mandel. Nøtteallergi rundt bordet? Bruk noe like stort som er vanskelig å skjule, som en sjokoladebit eller en stor drops."), R.t("Den som har mandelen, kan godt peke på noen andre."), R.t("De som ikke har mandelen, kan godt tygge litt for å lure de andre."), R.t("Alle må svare på spørsmålene – også den som har mandelen.")],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp) return { html: "" };
        const har = tur(sp) === sp.mandel;
        return {
          html: `<div class="ng-se ${har ? "har" : ""}">${bolle(har)}<p class="ng-se-tekst">${esc(har ? R.t("MANDELEN!") : R.t("Bare grøt"))}</p><p class="ng-se-hint">${esc(har ? R.t("Når alle snur seg: putt mandelen ekte i munnen. Ikke vis noe!") : R.t("Når alle snur seg: bare lat som du putter mandelen i munnen."))}</p></div>`,
          si: har ? R.t("Du har mandelen!") : R.t("Bare grøt"),
          klasse: "ng-bak",
        };
      },
      sett(S) {
        const sp = S.spill;
        if (!pagar(S) || !sett(sp)) return;
        R.vis();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Én har mandelen i grøten."))}<br><em>${esc(R.t("Klarer hen å late som ingenting?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              [R.t("1 mandel"), R.t("per spiller")],
              [`${MIN}–${MAKS}`, R.t("spillere")],
              [String(SPORSMAL.length), R.t("spørsmål")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <p class="papirboks ng-mandler">${esc(R.t("Alle trenger en hel mandel. Nøtteallergi rundt bordet? Bruk noe like stort som er vanskelig å skjule, som en sjokoladebit eller en stor drops."))}</p>
            ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Mobilen går rundt i samme rekkefølge som lista.") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Runder"))}</h2></div>
              ${R.ui.seg("runder", RUNDER.map((n) => [String(n), String(n)]), String(S.runder))}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      gi: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis: (S) =>
          R.ui.giTil({
            i: tur(S.spill),
            h: "jeg-er",
            advarsel: R.t("De andre ser bort"),
            prikker: [S.spill.antall, S.spill.sett],
          }),
        inn: () => R.holdVaken(),
      },

      se: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const sist = sp.sett + 1 >= sp.antall;
          return `
            <div data-hemmelig>
              <h1 class="vh" id="skjerm-tittel">${esc(R.t("{navn}: Se i grøtbollen din", { navn: R.navn(tur(sp)) }))}</h1>
              ${R.ui.mappe({ etikett: R.t("Grøtbollen"), tekst: HOLD, etikettAria: R.t("Hold fingeren på kortet for å se om du fikk mandelen") })}
            </div>
            ${R.ui.dokk(
              sp.sett1 ? "" : `<p class="hjelp">${esc(R.t("Se i bollen først."))}</p>`,
              R.ui.knapp(sist ? R.t("Alle har sett – snu dere bort") : R.t("Ferdig – gi mobilen videre"), "videre", { av: !sp.sett1 }),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
      },

      munn: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis() {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Snu dere bort!"))}</h1>
            <p class="ingress">${esc(R.t("Alle snur ryggen til bordet og later som de putter mandelen i munnen. Bare den som fikk mandelen, gjør det ekte."))}</p>
            <div class="ng-fasit">${bolle(true)}</div>
            ${R.ui.knapp2(R.t("3 · 2 · 1 – Nam!"), "nam", { ikon: "😋" })}
            <p class="hjelp">${esc(R.t("Snu dere tilbake og tygg uskyldig. Ingen sier noe!"))}</p>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Alle har snudd seg – til nissen"), "til-nissen"),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      prat: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="ng-nissen">
              ${R.figur()}
              <div class="ng-boble">
                <p class="etikett">${esc(R.t("Nissen spør {navn}", { navn: R.navn(sp.spurt) }))}</p>
                <h1 id="skjerm-tittel">${esc(SPORSMAL[sp.k])}</h1>
              </div>
            </div>
            <p class="ng-til">${R.avatar(sp.spurt, "stor")}<b>${esc(R.navn(sp.spurt))}</b></p>
            ${R.ui.timer({ id: "klokke", sekunder: PRATETID, kontrollHtml: `<span class="etikett">${esc(R.t("Tid til å snakke"))}</span>${R.ui.knapp2(R.t("+30 s"), "pluss", { variant: "liten" })}` })}
            ${R.ui.dokk(
              R.ui.knapp2(R.t("Nytt spørsmål"), "nytt-sporsmal", { ikon: "🎅" }),
              R.ui.knapp(R.t("Klare til å peke"), "til-pek", { variant: "rosa" }),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn() {
          R.holdVaken();
          new R.Timer({ id: "klokke", sekunder: PRATETID }).start();
        },
        etter() {
          const t = R.timer("klokke");
          if (t) t.tegn();
        },
      },

      pek: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "prat",
        vis(S) {
          const sp = S.spill;
          const m = sp.pekt;
          const knapp = !m.length
            ? R.t("Trykk på den som fikk flest")
            : m.length > 2
              ? R.t("{n} ble pekt ut", { n: m.length })
              : R.t("{hvem} ble pekt ut|{hvem} ble pekt ut", { n: m.length, hvem: R.ramsOpp(m.map(R.navn)) });
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Hvem har mandelen?"))}</h1>
            <p class="ingress">${esc(R.t("Tell ned og pek samtidig på den du tror har mandelen."))}</p>
            ${R.ui.knapp2(R.t("3 · 2 · 1 – Pek!"), "pek", { ikon: "👉" })}
            <section class="seksjon">
              <h2>${esc(R.t("Hvem fikk flest fingrer?"))}</h2>
              ${R.ui.velgere("pekt", range(sp.antall), m)}
              <p class="hjelp">${esc(R.t("Står det likt, trykker du på alle som fikk flest."))}</p>
            </section>
            ${R.ui.lenke(R.t("Ingen fikk mer enn én finger"), "ingen")}
            ${R.ui.dokk(R.ui.knapp(knapp, "snu", { variant: "rosa", av: !m.length }))}`;
        },
      },

      fasit: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.siste;
          const navn = R.navn(r.mandel);
          const sist = sp.runde + 1 >= sp.runder;
          const banner = r.fanget
            ? R.ui.banner({ etikett: R.t("Mandelen er funnet!"), tittel: R.t("{navn} hadde mandelen", { navn }), tekst: R.t("Gap opp, {navn}! Alle andre får 1 poeng.", { navn }), klasse: "aksent", stemning: "lei" })
            : R.ui.banner({ etikett: R.t("{navn} hadde mandelen!", { navn }), tittel: R.t("{navn} vinner marsipangrisen!", { navn }), tekst: R.t("Gap opp og vis mandelen! Ingen avslørte det. 3 poeng.", { navn }), klasse: "aksent ng-gris-banner", stemning: "jubel" });
          return `
            ${banner}
            <div class="ng-fasit">${bolle(true)}${r.fanget ? "" : `<span class="ng-gris" aria-hidden="true">🐷</span>`}</div>
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${R.ui.dokk(R.ui.knapp(sist ? R.t("Til kåringen") : R.t("Neste runde"), "neste"), R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          if (S.spill.siste && !S.spill.siste.fanget) R.konfetti(["--rosa", "--lampe", "--aksent"]);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = toppen(sp);
          const griser = sp.slapp.reduce((s, n) => s + n, 0);
          const banner = topp.length
            ? R.ui.banner({ tittel: R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(topp.map(R.navn)), n: topp.length }), tekst: R.t("{poeng} etter {runder}", { poeng: R.flertall(sp.poeng[topp[0]], "poeng", "poeng"), runder: R.flertall(sp.runde, "runde", "runder") }), klasse: "aksent" })
            : R.ui.banner({ tittel: R.t("Ingen poeng ennå"), tekst: R.t("Spill en runde, så blir det kåring!"), klasse: "aksent", stemning: "" });
          const grisLinje = griser
            ? R.t("Marsipangriser i kveld: {liste}", {
                liste: R.ramsOpp(
                  range(sp.antall)
                    .filter((i) => sp.slapp[i] > 0)
                    .map((i) => `${R.navn(i)} ${"🐷".repeat(Math.min(sp.slapp[i], 5))}`),
                ),
              })
            : R.t("Ingen slapp unna med mandelen i kveld. For en gjeng med detektiver!");
          return `
            ${banner}
            ${topp.length ? R.ui.pall(rader(sp)) : ""}
            ${sp.runde ? R.ui.poengliste(rader(sp)) : ""}
            ${sp.runde ? `<p class="papirboks ng-griser">${esc(grisLinje)}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          R.slippVaken();
          if (!feire) return; // back on the screen, or after a reload: the party was held already
          feire = false;
          if (toppen(S.spill).length) {
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
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre(el, e, S) {
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        if (S.spill.fase === "se") {
          S.spill.fase = "gi";
          S.spill.sett1 = false;
        }
        R.gaTil(S.spill.fase);
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if (RUNDER.includes(n)) S.runder = n;
        R.vis();
      },
      start(el, e, S) {
        const antall = R.klamp(S.antall || 4, MIN, MAKS);
        S.spill = ny(antall, S.runder, Math.random);
        R.statistikk("start", { spillere: antall, runder: S.runder });
        R.gaTil("gi");
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "gi") return;
        sp.fase = "se";
        sp.sett1 = false;
        R.gaTil("se");
      },
      videre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const hvor = videre(sp);
        if (!hvor) return;
        if (hvor === "munn") R.lyd.pling();
        R.gaTil(hvor);
      },
      async nam() {
        if (teller) return;
        teller = true;
        let ferdig = false;
        try {
          ferdig = await R.nedtelling(["3", "2", "1", R.t("NAM!")], 700);
        } finally {
          teller = false;
        }
        if (ferdig) R.vibrer([60, 40, 120]);
      },
      "til-nissen"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !imunnen(sp)) return;
        nyttSporsmal(sp);
        R.lyd.pling();
        R.gaTil("prat");
      },
      "nytt-sporsmal"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "prat") return;
        nyttSporsmal(sp);
        R.lyd.sveip();
        R.vis();
        R.si(`${R.navn(sp.spurt)}: ${SPORSMAL[sp.k]}`);
      },
      pluss() {
        const t = R.timer("klokke");
        if (t) t.leggTil(30);
      },
      "til-pek"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "prat") return;
        sp.fase = "pek";
        sp.pekt = [];
        R.gaTil("pek");
      },
      async pek() {
        if (teller) return;
        teller = true;
        let ferdig = false;
        try {
          ferdig = await R.nedtelling(["3", "2", "1", R.t("PEK!")], 700);
        } finally {
          teller = false;
        }
        if (!ferdig) return; // the screen changed during the countdown
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
      },
      pekt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "pek") return;
        const i = Number(el.dataset.v);
        sp.pekt = sp.pekt.includes(i) ? sp.pekt.filter((x) => x !== i) : [...sp.pekt, i];
        R.vis();
      },
      ingen(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "pek") return;
        sp.pekt = [];
        H.snu(el, e, S, true);
      },
      async snu(el, e, S, ingen) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "pek" || (!sp.pekt.length && !ingen)) return;
        const fortsatt = R.vakt();
        R.lyd.trommevirvel(1);
        await R.vent(R.rolig() ? 200 : 900);
        if (!fortsatt() || S.spill !== sp || sp.fase !== "pek") return;
        const r = avgjor(sp, sp.pekt);
        if (!r) return;
        if (r.fanget) R.lyd.buu();
        else {
          R.lyd.fanfare();
          R.vibrer([40, 30, 90]);
        }
        R.gaTil("fasit");
        R.si(r.fanget ? R.t("{navn} hadde mandelen", { navn: R.navn(r.mandel) }) : R.t("{navn} vinner marsipangrisen!", { navn: R.navn(r.mandel) }));
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !angre(sp)) return;
        R.toast(R.t("Angret – poengene er tatt bort"));
        R.gaTil("pek");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const hvor = nesteRunde(sp, Math.random);
        if (!hvor) return;
        if (hvor === "slutt") {
          fullfor(S);
          R.gaTil("slutt");
          return;
        }
        R.gaTil("gi");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = sp.runde === 0 && sp.fase !== "fasit";
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ingenting ? R.t("Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (sp.fase === "fasit") sp.runde += 1; // this round was played to the end
        fullfor(S);
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
