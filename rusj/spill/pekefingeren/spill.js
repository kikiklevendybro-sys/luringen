/* Pekefingeren — "Who is most likely to …?"
   Read the statement, count down, everyone points at once. Optional scoring: tap who got the
   most fingers (undoable until the next action), and the game crowns the group's "most likely"
   at the end. Reference game for the rusj kit (see rusj/KIT.md). */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.utsagn;
  const esc = R.esc;

  // All statements in one list so the deck can remember what has been shown.
  const ALLE = [];
  D.pakker.forEach((p) => p.utsagn.forEach((t) => ALLE.push({ p: p.id, t })));
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const stokk = R.kortstokk("utsagn", ALLE.length);
  // A game is running until the crowning (then «Spill igjen» / «Endre oppsett» start a new one).
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  let H; // the actions, so one action can reuse another

  function nyttKort(S) {
    const valgt = new Set(S.oppsett.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    S.spill.kort = i;
    S.spill.nr += 1;
    S.spill.fase = "les";
  }

  // Screen readers don't announce a card that is redrawn in place, so say it.
  const siKort = (S) => R.si(`Kort ${S.spill.nr}. ${D.prefiks.replace(" …", "")} ${ALLE[S.spill.kort].t}?`);

  function poengRader(S) {
    return Array.from({ length: S.spill.antall }, (_, i) => ({ i, poeng: S.spill.poeng[i] || 0 }));
  }

  // Remember the vote that was just given, so it can be undone until the next action.
  function huskAngre(S, i) {
    S.spill.angre = { i, kort: S.spill.kort, nr: S.spill.nr };
  }

  R.start({
    id: "pekefingeren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 4,
      oppsett: { pakker: ["familie", "venner"], poeng: true },
      spill: null,
    }),

    // Drop saved settings that no longer match the content (e.g. a removed pack).
    lastet(S) {
      S.oppsett.pakker = (S.oppsett.pakker || []).filter((id) => pakke(id));
      if (!S.oppsett.pakker.length) S.oppsett.pakker = ["familie", "venner"];
      if (S.spill && (S.spill.kort == null || !ALLE[S.spill.kort])) S.spill = null;
      if (S.spill && S.spill.angre && !ALLE[S.spill.angre.kort]) S.spill.angre = null;
    },

    regler: {
      intro: "Et utsagn dukker opp. Alle peker samtidig på den i gjengen som passer best.",
      steg: [
        ["Les høyt", "Én leser utsagnet: «Hvem er mest sannsynlig til å …»"],
        ["Tell ned", "Trykk på knappen. Når mobilen sier PEK, peker alle på én person – samtidig."],
        ["Kår vinneren", "Den som fikk flest fingrer, får poenget. Like mange fingrer? Da får ingen poeng."],
      ],
      tips: [
        "Lov å forsvare seg – men bare i ti sekunder.",
        "Trykket feil? «Angre» på neste kort tar poenget tilbake.",
        "Sveip kortet til siden for å hoppe til neste.",
        "Skru av poeng hvis dere bare vil prate.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Les utsagnet. Tell ned.<br><em>Alle peker samtidig.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · kort ${S.spill.nr}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–20", "spillere"],
              [String(ALLE.length), "utsagn"],
              ["0", "reklame"],
            ],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Velg pakker</h2><span class="tall">${S.oppsett.pakker.length} valgt</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.utsagn.length}`, ikon: p.ikon })),
              S.oppsett.pakker,
            )}
          </section>
          ${R.ui.bryter("poeng", S.oppsett.poeng, "Tell poeng", "Trykk på den som fikk flest fingrer – og se hvem som vinner til slutt.")}
          ${S.oppsett.poeng ? R.ui.spillere({ min: 3, max: 20 }) : ""}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !S.oppsett.pakker.length }))}`,
      },

      kort: {
        tittel: (S) => `Kort ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = ALLE[sp.kort];
          const p = pakke(k.p);
          const velg = sp.fase === "velg";
          const kort = R.ui.storkort({
            etikett: `${p.ikon} ${p.navn}`,
            nr: `#${sp.nr}`,
            tekstHtml: `<span class="prefiks">${esc(D.prefiks)}</span>${esc(k.t)}?`,
            klasse: velg ? "aksent" : "",
            sveip: velg ? null : "neste",
            kompakt: velg,
          });
          if (!velg) {
            const angre = sp.angre
              ? R.ui.lenke(sp.angre.i >= 0 ? `↶ Angre +1 til ${R.navn(sp.angre.i)}` : "↶ Angre «uavgjort»", "angre", { id: "angre" })
              : "";
            return `
              <h1 class="vh" id="skjerm-tittel">Kort ${sp.nr}</h1>
              ${kort}
              <p class="sveip-hint" aria-hidden="true">← Sveip for nytt kort →</p>
              ${R.ui.dokk(
                R.ui.knapp("3 · 2 · 1 – PEK!", "pek", { variant: "stor", ikon: "👉" }),
                R.ui.lenkerad(angre, R.ui.lenke("Hopp over", "neste"), sp.poeng ? R.ui.lenke("Avslutt", "slutt") : R.ui.lenke("Avslutt", "avslutt")),
              )}`;
          }
          return `
            <h1 class="vh">Kort ${sp.nr}: hvem fikk flest fingrer?</h1>
            ${kort}
            <section class="seksjon">
              <h2 id="skjerm-tittel">Hvem fikk flest fingrer?</h2>
              ${R.ui.velgere("vinner", Array.from({ length: sp.antall }, (_, i) => i), null)}
            </section>
            ${R.ui.dokk(R.ui.knapp2("Uavgjort – ingen poeng", "uavgjort"))}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const rader = poengRader(S);
          const best = rader.slice().sort((a, b) => b.poeng - a.poeng)[0];
          const harPoeng = best && best.poeng > 0;
          const vinnere = harPoeng ? rader.filter((r) => r.poeng === best.poeng).map((r) => r.i) : [];
          const vunnet = vinnere.length === 1 ? (S.spill.vunnet[best.i] || []).slice(-3) : [];
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${vinnere.length > 1 ? "Like sannsynlige til alt" : "Mest sannsynlig til alt"}</p>
              <h1 id="skjerm-tittel">${
                !harPoeng ? "Ingen vinner denne gangen" : vinnere.length > 3 ? `${vinnere.length} spillere vinner!` : `${esc(R.ramsOpp(vinnere.map((i) => R.navn(i))))} vinner!`
              }</h1>
              ${vunnet.length ? `<p class="ingress">Blant annet til å ${esc(R.ramsOpp(vunnet.map((k) => ALLE[k].t)))}.</p>` : ""}
              ${harPoeng ? "" : `<p class="ingress">Ingen fikk poeng. Neste gang: trykk på den som fikk flest fingrer.</p>`}
            </div>
            ${harPoeng ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: S.spill.antall })}
            ${R.ui.dokk(
              R.ui.knapp("Spill igjen", "igjen"),
              R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`),
            )}`;
        },
        inn(S) {
          if (poengRader(S).some((r) => r.poeng > 0)) {
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
      poeng(el, e, S) {
        S.oppsett.poeng = !S.oppsett.poeng;
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        S.spill = {
          antall: S.antall,
          poeng: S.oppsett.poeng ? {} : null,
          vunnet: {},
          nr: 0,
          kort: null,
          fase: "les",
          angre: null,
          ferdig: false,
        };
        nyttKort(S);
        R.gaTil("kort");
      },
      async pek(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "les") return;
        S.spill.angre = null;
        if (!(await R.nedtelling(["3", "2", "1", "PEK!"], 700))) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        if (S.spill.poeng) {
          S.spill.fase = "velg";
          R.vis();
          R.si("Hvem fikk flest fingrer?");
          const h = R.$("#skjerm-tittel");
          if (h) h.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
        } else {
          const fortsatt = R.vakt();
          await R.kastKort(-1);
          if (!fortsatt()) return;
          nyttKort(S);
          R.vis();
          siKort(S);
        }
      },
      async neste(el, e, S) {
        if (!pagar(S)) return;
        S.spill.angre = null;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S);
        R.vis();
        siKort(S);
      },
      vinner(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "velg") return;
        const i = Number(el.dataset.v);
        huskAngre(S, i);
        S.spill.poeng[i] = (S.spill.poeng[i] || 0) + 1;
        (S.spill.vunnet[i] = S.spill.vunnet[i] || []).push(S.spill.kort);
        R.lyd.riktig();
        R.toast(`+1 til ${R.navn(i)}`);
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
        siKort(S);
      },
      uavgjort(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "velg") return;
        huskAngre(S, -1);
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
        siKort(S);
      },
      // Take back the last vote: the point goes away and the card comes back to the vote.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp.angre;
        if (!a) return;
        if (a.i >= 0) {
          sp.poeng[a.i] = Math.max(0, (sp.poeng[a.i] || 0) - 1);
          const v = sp.vunnet[a.i] || [];
          const n = v.lastIndexOf(a.kort);
          if (n >= 0) v.splice(n, 1);
        }
        sp.kort = a.kort;
        sp.nr = a.nr;
        sp.fase = "velg";
        sp.angre = null;
        R.lyd.snu();
        R.toast(a.i >= 0 ? `Angret +1 til ${R.navn(a.i)}` : "Angret «uavgjort»");
        R.vis();
        const h = R.$("#skjerm-tittel");
        if (h) h.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
      },
      // «Avslutt» with points: straight to the crowning (the sheet says so).
      async slutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen. Den med flest poeng vinner.", "Avslutt", "Fortsett");
        if (!ja || !fortsatt() || !pagar(S)) return;
        S.spill.angre = null;
        S.spill.ferdig = true;
        R.gaTil("slutt");
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Fortsett")) && fortsatt()) {
          S.spill = null;
          R.gaTil("hjem");
        }
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
