/* Pekefingeren — "Who is most likely to …?"
   Read the statement, count down, everyone points at once. With scoring: tap who got the most
   fingers (two or more names when the vote is split), the winner gets a spotlight and something to
   answer for, and after 10 or 20 cards the game crowns the group's "most likely" by itself — with
   a diploma for everyone who won a card. Reference game for the rusj kit (see rusj/KIT.md). */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.utsagn;
  const esc = R.esc;

  // All statements in one list so the deck can remember what has been shown. The order follows
  // the data file (new packs are added last there), so the remembered card numbers stay valid.
  const ALLE = [];
  D.pakker.forEach((p) => p.utsagn.forEach((t) => ALLE.push({ p: p.id, t })));
  const pakke = (id) => D.pakker.find((p) => p.id === id);
  // The Christmas pack is listed first while it is the season (1 Nov – 6 Jan), otherwise last.
  const julesesong = (d = new Date()) => d.getMonth() >= 10 || (d.getMonth() === 0 && d.getDate() <= 6);
  const PAKKER = (() => {
    const jul = D.pakker.filter((p) => p.id === "jul");
    const andre = D.pakker.filter((p) => p.id !== "jul");
    return julesesong() ? [...jul, ...andre] : [...andre, ...jul];
  })();
  const STANDARD = ["familie", "venner"];
  const LENGDER = [10, 20, 0]; // cards in a session; 0 = «Fritt» (until someone taps «Avslutt»)
  const stokk = R.kortstokk("utsagn", ALLE.length);
  // A game is running until the crowning (then «Spill igjen» / «Endre oppsett» start a new one).
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const alle = (sp) => Array.from({ length: sp.antall }, (_, i) => i);
  const navneliste = (liste) => R.ramsOpp(liste.map((i) => R.navn(i))); // «A, B og C»
  // The card on the table is the last one of the session.
  const sisteKort = (sp) => sp.lengde > 0 && sp.nr >= sp.lengde;
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  let H; // the actions, so one action can reuse another

  // One line under the stamp: something for the table to talk about before the next card.
  const LINJER = [
    R.t("Forsvar deg – ti sekunder!"),
    R.t("Når skjedde det sist?"),
    R.t("Du leser neste kort."),
    R.t("Hva sier du til tiltalen?"),
    R.t("Hvem pekte du på selv?"),
    R.t("Ta det som et kompliment!"),
    R.t("Én setning til ditt forsvar!"),
    R.t("Fortell om forrige gang!"),
  ];
  const LINJER_DELT = [
    R.t("Ti sekunder hver til å forsvare dere!"),
    R.t("Avgjør det med stein, saks, papir!"),
    R.t("Dere leser neste kort – i kor."),
    R.t("Pek på hverandre og forklar!"),
  ];

  // A new card. `bytte`: the card on the table is swapped (skipped), so its number stays.
  function nyttKort(S, bytte) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    sp.kort = i;
    if (!bytte) sp.nr += 1;
    sp.fase = "les";
    sp.valgt = [];
    sp.delt = false;
  }

  // Screen readers don't announce a card that is redrawn in place, so say it.
  const siKort = (S) => R.si(`${R.t("Kort {nr}.", { nr: S.spill.nr })} ${D.prefiks.replace(" …", "")} ${ALLE[S.spill.kort].t}?`);

  function poengRader(S) {
    return alle(S.spill).map((i) => ({ i, poeng: S.spill.poeng[i] || 0 }));
  }

  // Remember the vote that was just given, so it can be undone until the next action.
  function huskAngre(S, vinnere) {
    S.spill.angre = { vinnere: vinnere.slice(), kort: S.spill.kort, nr: S.spill.nr };
  }

  // «+1 til Kari» / «+1 til begge» / «+1 til alle tre»
  function plussTekst(vinnere) {
    if (vinnere.length === 1) return R.t("+1 til {navn}", { navn: R.navn(vinnere[0]) });
    if (vinnere.length === 2) return R.t("+1 til begge");
    return R.t("+1 til alle {n}", { n: vinnere.length });
  }

  // The latest statements a player won (at most three), for the banner and the diploma.
  const vunnetAv = (sp, i, n = 3) => (sp.vunnet[i] || []).filter((k) => ALLE[k]).slice(-n);
  // Everyone with at least one card, best first.
  const diplomer = (S) =>
    poengRader(S)
      .filter((r) => r.poeng > 0 && vunnetAv(S.spill, r.i).length)
      .sort((a, b) => b.poeng - a.poeng || a.i - b.i);

  // The game is over: straight to the crowning (or, without points, a calm end screen).
  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    sp.angre = null;
    sp.ferdig = true;
    R.statistikk("ferdig", { kort: sp.spilt, spillere: sp.poeng ? sp.antall : 0, poeng: !!sp.poeng, lengde: sp.lengde, tidlig: !!tidlig });
    if (sp.poeng) R.kveld.registrer(poengRader(S));
    R.slippVaken();
    R.gaTil("slutt");
  }

  // One or more players got the card: points, then the spotlight.
  function giPoeng(S, vinnere) {
    const sp = S.spill;
    huskAngre(S, vinnere);
    vinnere.forEach((i) => {
      sp.poeng[i] = (sp.poeng[i] || 0) + 1;
      (sp.vunnet[i] = sp.vunnet[i] || []).push(sp.kort);
    });
    sp.spilt += 1;
    sp.siste = { vinnere: vinnere.slice(), kort: sp.kort };
    sp.fase = "kaaret";
    sp.valgt = [];
    sp.delt = false;
    R.gaTil("kort");
    R.lyd.trommevirvel(0.45);
    R.vibrer([30, 40, 30, 40, 120]);
    const hvem = navneliste(vinnere);
    R.si(`${vinnere.length > 1 ? R.t("{navn} deler kortet: til å {utsagn}.", { navn: hvem, utsagn: ALLE[sp.kort].t }) : R.t("{navn} er mest sannsynlig: til å {utsagn}.", { navn: hvem, utsagn: ALLE[sp.kort].t })} ${plussTekst(vinnere)}.`);
  }

  function kortet(S, kompakt) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: sp.lengde ? R.t("{n} av {alle}", { n: sp.nr, alle: sp.lengde }) : `#${sp.nr}`,
      tekstHtml: `<span class="prefiks">${esc(D.prefiks)}</span>${esc(k.t)}?`,
      klasse: kompakt ? "aksent" : "",
      sveip: kompakt ? null : "neste",
      fot: !kompakt && sisteKort(sp) ? (sp.poeng ? R.t("Siste kort – så er det kåring.") : R.t("Siste kort!")) : null,
      kompakt,
    });
  }

  // The spotlight after a vote: who got the card, the stamp and one line to talk about.
  function kaaret(S) {
    const sp = S.spill;
    const v = sp.siste.vinnere;
    const k = ALLE[sp.siste.kort];
    const siste = sisteKort(sp);
    const angre = sp.angre ? R.ui.lenke(R.t("↶ Angre"), "angre", { id: "angre" }) : "";
    const dokk = R.ui.dokk(R.ui.knapp(siste ? R.t("Til kåringen") : R.t("Neste kort"), "videre"), R.ui.lenkerad(angre, siste ? "" : R.ui.lenke(R.t("Avslutt"), "slutt")));
    if (!v.length) {
      // «Ingen poeng» on the last card: one calm stop before the crowning, so it can still be undone.
      return `
        <div class="banner peke-kaaret">
          <p class="etikett">${esc(R.t("Kort {nr} av {alle}", { nr: sp.nr, alle: sp.lengde }))}</p>
          <h1 id="skjerm-tittel">${esc(R.t("Ingen poeng"))}</h1>
          <p class="peke-kaaret-til">${esc(R.t("Det var siste kort. Nå er det kåring!"))}</p>
        </div>
        ${dokk}`;
    }
    const delt = v.length > 1;
    const linjer = delt ? LINJER_DELT : LINJER;
    return `
      <div class="banner aksent peke-kaaret${delt ? " delt" : ""}">
        <div class="peke-kaaret-figurer">${v.map((i) => R.avatar(i, delt ? "stor" : "gigant")).join("")}</div>
        <h1 id="skjerm-tittel">${v.length > 3 ? esc(R.t("{n} spillere", { n: v.length })) : esc(navneliste(v))}</h1>
        <div class="stempel-sted"><span class="stempel aksent">${esc(delt ? R.t("Delt!") : R.t("Mest sannsynlig!"))}</span></div>
        <p class="peke-kaaret-til">${esc(R.t("… til å {utsagn}", { utsagn: k.t }))}</p>
        <p class="peke-kaaret-linje"><b>${esc(plussTekst(v))}</b><span>${esc(linjer[(sp.fro + sp.nr) % linjer.length])}</span></p>
      </div>
      ${dokk}`;
  }

  R.start({
    id: "pekefingeren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 4, 3, 20),
      oppsett: { pakker: STANDARD.slice(), poeng: true, lengde: 20 },
      spill: null,
    }),

    // Drop saved settings that no longer match the content (e.g. a removed pack), and give games
    // saved by an earlier version what they lack.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ pakker: STANDARD.slice(), poeng: true, lengde: 20 }, S.oppsett));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      if (!LENGDER.includes(o.lengde)) o.lengde = 20;
      o.poeng = !!o.poeng;
      const sp = S.spill;
      if (sp && !(ALLE[sp.kort] && Number.isInteger(sp.nr) && sp.nr >= 1 && (sp.poeng == null || typeof sp.poeng === "object"))) S.spill = null;
      if (S.spill) {
        sp.antall = R.klamp(Number(sp.antall) || 3, 3, 20);
        if (!Array.isArray(sp.pakker) || !sp.pakker.some((id) => pakke(id))) sp.pakker = o.pakker.slice();
        if (!LENGDER.includes(sp.lengde)) sp.lengde = 0; // a game from before sessions had a length
        if (!Number.isInteger(sp.spilt)) sp.spilt = Math.max(0, sp.nr - 1);
        if (!Number.isInteger(sp.fro)) sp.fro = 0;
        if (!sp.vunnet || typeof sp.vunnet !== "object") sp.vunnet = {};
        const iSpill = (i) => Number.isInteger(i) && i >= 0 && i < sp.antall;
        sp.valgt = (Array.isArray(sp.valgt) ? sp.valgt : []).filter(iSpill);
        sp.delt = !!sp.delt;
        if (sp.angre && !(Array.isArray(sp.angre.vinnere) && sp.angre.vinnere.every(iSpill) && ALLE[sp.angre.kort])) sp.angre = null;
        const sisteOk = sp.siste && Array.isArray(sp.siste.vinnere) && sp.siste.vinnere.every(iSpill) && ALLE[sp.siste.kort];
        if (!["les", "velg", "kaaret"].includes(sp.fase) || (sp.fase !== "les" && !sp.poeng) || (sp.fase === "kaaret" && !sisteOk)) sp.fase = "les";
      }
      if (!S.spill && ["kort", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    // rusj.no/pekefingeren/#jul opens «Gjør klart» with only the Christmas pack chosen.
    vedHash(S, hash) {
      if (String(hash).trim().toLowerCase() !== "jul" || !pakke("jul") || pagar(S)) return null;
      S.oppsett.pakker = ["jul"];
      return "oppsett";
    },

    regler: {
      intro: R.t("Et utsagn dukker opp. Alle peker samtidig på den i gjengen som passer best."),
      steg: [
        [R.t("Les høyt"), R.t("Én leser utsagnet: «Hvem er mest sannsynlig til å …»")],
        [R.t("Tell ned"), R.t("Trykk på knappen. Når mobilen sier PEK, peker alle på én person – samtidig.")],
        [R.t("Kår vinneren"), R.t("Trykk på den som fikk flest fingrer. Like mange? Velg «Delt mellom flere», så får alle sammen ett poeng hver.")],
      ],
      tips: [
        R.t("Den som får kortet, får også noe å svare for. Lov å forsvare seg – men bare i ti sekunder."),
        R.t("Etter 10 eller 20 kort kommer kåringen av seg selv – med diplom til alle som vant et kort."),
        R.t("Trykket feil? «Angre» tar poenget tilbake."),
        R.t("Sveip kortet til siden for å bytte det ut."),
        R.t("Skru av poeng hvis dere bare vil prate."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Les utsagnet. Tell ned."))}<br><em>${esc(R.t("Alle peker samtidig."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? (S.spill.lengde ? R.t("Fortsett · kort {nr} av {alle}", { nr: S.spill.nr, alle: S.spill.lengde }) : R.t("Fortsett · kort {nr}", { nr: S.spill.nr })) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["3–20", R.t("spillere")],
              [String(ALLE.length), R.t("utsagn")],
              ["0", R.t("reklame")],
            ],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const lengdeHjelp = !o.lengde
            ? R.t("Dere spiller til noen trykker «Avslutt».")
            : o.poeng
              ? R.t("Etter {n} kort kommer kåringen av seg selv.", { n: o.lengde })
              : R.t("Etter {n} kort er runden ferdig.", { n: o.lengde });
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.t("{n} valgt", { n: o.pakker.length }))}</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.utsagn.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          <section class="seksjon">
            <h2 id="lengde-tittel">${esc(R.t("Hvor mange kort?"))}</h2>
            ${R.ui.seg("lengde", LENGDER.map((n) => [String(n), n ? String(n) : R.t("Fritt")]), String(o.lengde), { etikett: R.t("Hvor mange kort?") })}
            <p class="hjelp">${esc(lengdeHjelp)}</p>
          </section>
          ${R.ui.bryter("poeng", o.poeng, R.t("Tell poeng"), R.t("Trykk på den som fikk flest fingrer – og se hvem som vinner til slutt."))}
          ${o.poeng ? R.ui.spillere({ min: 3, max: 20 }) : ""}
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel: (S) => (S.spill.lengde ? R.t("Kort {nr} av {alle}", { nr: S.spill.nr, alle: S.spill.lengde }) : R.t("Kort {nr}", { nr: S.spill.nr })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          if (sp.fase === "kaaret") return kaaret(S);
          if (sp.fase !== "velg") {
            // (Short on purpose: with a name in it the links wrap and the big button jumps.)
            const angre = sp.angre ? R.ui.lenke(R.t("↶ Angre"), "angre", { id: "angre" }) : "";
            return `
              <h1 class="vh" id="skjerm-tittel">${esc(R.t("Kort {nr}", { nr: sp.nr }))}</h1>
              ${kortet(S, false)}
              <p class="sveip-hint" aria-hidden="true">${esc(R.t("← Sveip for å bytte kort →"))}</p>
              ${R.ui.dokk(
                R.ui.knapp(R.t("3 · 2 · 1 – PEK!"), "pek", { variant: "stor", ikon: "👉" }),
                R.ui.lenkerad(angre, R.ui.lenke(R.t("Bytt kort"), "neste"), sp.poeng ? R.ui.lenke(R.t("Avslutt"), "slutt") : R.ui.lenke(R.t("Avslutt"), "avslutt")),
              )}`;
          }
          if (sp.delt) {
            const n = sp.valgt.length;
            return `
              <h1 class="vh">${esc(R.t("Kort {nr}: hvem fikk like mange fingrer?", { nr: sp.nr }))}</h1>
              ${kortet(S, true)}
              <section class="seksjon">
                <div class="seksjon-hode"><h2 id="skjerm-tittel">${esc(R.t("Hvem delte førsteplassen?"))}</h2><span class="tall">${esc(R.t("{n} valgt", { n }))}</span></div>
                <p class="peke-hjelp">${esc(R.t("Trykk på alle som fikk flest fingrer."))}</p>
                ${R.ui.velgere("velg", alle(sp), sp.valgt)}
              </section>
              ${R.ui.dokk(
                R.ui.knapp(n < 2 ? R.t("Velg minst to") : R.t("Delt! {pluss}", { pluss: plussTekst(sp.valgt) }), "delt-ferdig", { av: n < 2 }),
                R.ui.lenkerad(R.ui.lenke(R.t("Bare én fikk flest"), "delt"), R.ui.lenke(R.t("Avslutt"), "slutt")),
              )}`;
          }
          return `
            <h1 class="vh">${esc(R.t("Kort {nr}: hvem fikk flest fingrer?", { nr: sp.nr }))}</h1>
            ${kortet(S, true)}
            <section class="seksjon">
              <h2 id="skjerm-tittel">${esc(R.t("Hvem fikk flest fingrer?"))}</h2>
              ${R.ui.velgere("vinner", alle(sp), null)}
            </section>
            ${R.ui.dokk(R.ui.knapp2(R.t("Delt mellom flere"), "delt"), R.ui.lenkerad(R.ui.lenke(R.t("Ingen poeng"), "uavgjort"), R.ui.lenke(R.t("Avslutt"), "slutt")))}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      slutt: {
        // «Kåringen» only when players are ranked; without points the top bar shows the game's name.
        tittel: (S) => (S.spill && S.spill.poeng ? R.t("Kåringen") : null),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const dokk = R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`));
          if (!sp.poeng) {
            return `
              ${R.ui.banner({
                etikett: R.t("Uten poeng"),
                tittel: sp.spilt === 1 ? R.t("Ett kort – ferdig!") : R.t("{n} kort – ferdig!", { n: sp.spilt }),
                tekst: R.t("Ingen kåring denne gangen. Skru på «Tell poeng» for å se hvem gjengen peker ut til slutt."),
                stemning: "",
              })}
              ${R.ui.flereSpill()}
              ${dokk}`;
          }
          const rader = poengRader(S);
          const best = rader.slice().sort((a, b) => b.poeng - a.poeng)[0];
          const harPoeng = best && best.poeng > 0;
          const vinnere = harPoeng ? rader.filter((r) => r.poeng === best.poeng).map((r) => r.i) : [];
          // «Blant annet til å …»: three statements for a single winner, one each when the win is shared.
          let blantAnnet = "";
          if (vinnere.length === 1) blantAnnet = R.t("Blant annet til å {utsagn}.", { utsagn: R.ramsOpp(vunnetAv(sp, vinnere[0]).map((k) => ALLE[k].t)) });
          else if (vinnere.length > 1 && vinnere.length <= 3) blantAnnet = R.t("Blant annet: {liste}.", { liste: R.ramsOpp(vinnere.map((i) => R.t("{navn} til å {utsagn}", { navn: R.navn(i), utsagn: ALLE[vunnetAv(sp, i, 1)[0]].t }))) });
          const dipl = diplomer(S);
          return `
            ${R.ui.banner({
              klasse: "aksent",
              etikett: !harPoeng ? R.t("Ingen poeng") : vinnere.length > 1 ? R.t("Like sannsynlige til alt") : R.t("Mest sannsynlig til alt"),
              tittel: !harPoeng ? R.t("Ingen vinner denne gangen") : vinnere.length > 3 ? R.t("{n} spillere vinner!", { n: vinnere.length }) : R.t("{navn} vinner!|{navn} vinner!", { navn: navneliste(vinnere), n: vinnere.length }),
              tekst: harPoeng ? blantAnnet : R.t("Ingen fikk poeng. Neste gang: trykk på den som fikk flest fingrer."),
              stemning: harPoeng ? "jubel" : "",
            })}
            ${harPoeng ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${
              dipl.length
                ? `<section class="seksjon peke-diplomer" aria-labelledby="diplom-tittel">
                    <h2 id="diplom-tittel">${esc(R.t("Diplomer"))}</h2>
                    <ul class="peke-diplomliste">${dipl
                      .map(
                        (r) => `<li class="peke-diplom">
                          <p class="peke-diplom-hode">${R.avatar(r.i)}<b>${esc(R.navn(r.i))}</b></p>
                          <p class="etikett">${esc(R.t("Mest sannsynlig til å"))}</p>
                          <p class="peke-diplom-tekst">${esc(R.ramsOpp(vunnetAv(sp, r.i).map((k) => ALLE[k].t)))}.</p>
                        </li>`,
                      )
                      .join("")}</ul>
                    ${R.ui.knapp2(dipl.length === 1 ? R.t("Del diplomet") : R.t("Del diplomene"), "del")}
                  </section>`
                : ""
            }
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${dokk}`;
        },
        inn(S) {
          if (S.spill.poeng && poengRader(S).some((r) => r.poeng > 0)) {
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
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("kort");
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const valgt = S.oppsett.pakker;
        S.oppsett.pakker = valgt.includes(id) ? valgt.filter((x) => x !== id) : [...valgt, id];
        R.vis();
      },
      lengde(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.lengde = LENGDER.includes(n) ? n : 20;
        R.vis();
      },
      poeng(el, e, S) {
        S.oppsett.poeng = !S.oppsett.poeng;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        const antall = R.klamp(S.antall || 4, 3, 20);
        S.spill = {
          antall,
          pakker: o.pakker.slice(),
          lengde: o.lengde,
          poeng: o.poeng ? {} : null,
          vunnet: {},
          nr: 0, // the card on the table (1, 2, 3 …); a swapped card keeps its number
          spilt: 0, // cards that were pointed at
          kort: null,
          fase: "les", // les → velg → kaaret (the last two only with points)
          valgt: [], // the names tapped while a split vote is being picked
          delt: false,
          siste: null, // the vote the spotlight is showing: { vinnere, kort }
          fro: R.heltall(0, 999), // where this game starts in the lines under the stamp
          angre: null,
          ferdig: false,
        };
        nyttKort(S);
        R.statistikk("start", { poeng: !!o.poeng, spillere: o.poeng ? antall : 0, lengde: o.lengde, pakker: o.pakker.length, jul: o.pakker.includes("jul") });
        R.gaTil("kort");
      },
      async pek(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "les") return;
        const sp = S.spill;
        sp.angre = null;
        if (!(await R.nedtelling(["3", "2", "1", R.t("PEK!")], 700))) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        if (sp.poeng) {
          sp.fase = "velg";
          sp.valgt = [];
          sp.delt = false;
          R.vis();
          R.si(R.t("Hvem fikk flest fingrer?"));
          const h = R.$("#skjerm-tittel");
          if (h) h.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
          return;
        }
        // Without points: the card is done, on to the next one (or the session is over).
        sp.spilt += 1;
        if (sisteKort(sp)) return tilSlutt(S);
        const fortsatt = R.vakt();
        await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S);
        R.vis();
        siKort(S);
      },
      // Swap the card on the table for another one (the link, or a swipe). It keeps its number.
      async neste(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "les") return;
        S.spill.angre = null;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S, true);
        R.vis();
        siKort(S);
      },
      vinner(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "velg" || S.spill.delt) return;
        const i = Number(el.dataset.v);
        if (!(i >= 0 && i < S.spill.antall)) return;
        giPoeng(S, [i]);
      },
      // The vote was split: pick everyone who shared first place (and back again).
      delt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "velg") return;
        sp.delt = !sp.delt;
        sp.valgt = [];
        R.vis();
        R.si(sp.delt ? R.t("Trykk på alle som fikk flest fingrer.") : R.t("Hvem fikk flest fingrer?"));
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "velg" || !sp.delt) return;
        const i = Number(el.dataset.v);
        if (!(i >= 0 && i < sp.antall)) return;
        sp.valgt = sp.valgt.includes(i) ? sp.valgt.filter((x) => x !== i) : [...sp.valgt, i].sort((a, b) => a - b);
        R.vis();
      },
      "delt-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "velg" || !sp.delt || sp.valgt.length < 2) return;
        giPoeng(S, sp.valgt);
      },
      // Nobody gets the card. On the last card there is one stop before the crowning (for «Angre»).
      uavgjort(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "velg") return;
        huskAngre(S, []);
        sp.spilt += 1;
        if (sisteKort(sp)) {
          sp.siste = { vinnere: [], kort: sp.kort };
          sp.fase = "kaaret";
          R.gaTil("kort");
          return;
        }
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
        siKort(S);
      },
      // From the spotlight: the next card, or the crowning after the last one.
      videre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kaaret") return;
        if (sisteKort(sp)) return tilSlutt(S);
        nyttKort(S);
        R.gaTil("kort");
        siKort(S);
      },
      // Take back the last vote: the points go away and the card comes back to the vote.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || !pagar(S)) return;
        a.vinnere.forEach((i) => {
          sp.poeng[i] = Math.max(0, (sp.poeng[i] || 0) - 1);
          const v = sp.vunnet[i] || [];
          const n = v.lastIndexOf(a.kort);
          if (n >= 0) v.splice(n, 1);
        });
        sp.kort = a.kort;
        sp.nr = a.nr;
        sp.spilt = Math.max(0, sp.spilt - 1);
        sp.fase = "velg";
        sp.valgt = [];
        sp.delt = false;
        sp.siste = null;
        sp.angre = null;
        R.lyd.snu();
        R.gaTil("kort");
        R.toast(a.vinnere.length === 1 ? R.t("Angret +1 til {navn}", { navn: R.navn(a.vinnere[0]) }) : a.vinnere.length ? R.t("Angret delt poeng") : R.t("Angret «ingen poeng»"));
        const h = R.$("#skjerm-tittel");
        if (h) h.scrollIntoView({ behavior: "auto", block: "center" });
      },
      // «Avslutt» with points: straight to the crowning (the sheet says so).
      async slutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere går rett til kåringen. Den med flest poeng vinner."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !pagar(S)) return;
        tilSlutt(S, true);
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"))) && fortsatt()) {
          if (S.spill) R.statistikk("ferdig", { kort: S.spill.spilt, spillere: 0, poeng: false, lengde: S.spill.lengde, tidlig: true });
          S.spill = null;
          R.gaTil("hjem");
        }
      },
      // The diplomas as text, for the group chat.
      del(el, e, S) {
        if (!S.spill || !S.spill.poeng) return;
        const linjer = diplomer(S).map((r) => R.t("{navn} – mest sannsynlig til å {utsagn}.", { navn: R.navn(r.i), utsagn: R.ramsOpp(vunnetAv(S.spill, r.i).map((k) => ALLE[k].t)) }));
        if (!linjer.length) return;
        R.del(R.app.navn, [linjer.length === 1 ? R.t("Diplom fra {spill} 👉", { spill: R.app.navn }) : R.t("Diplomer fra {spill} 👉", { spill: R.app.navn }), ...linjer].join("\n"), location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "pekefingeren") + "/");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
