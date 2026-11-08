/* Pekefingeren — "Who is most likely to …?"
   Read the statement, count down, everyone points at once. Optional scoring: tap who got the
   most fingers, and the game crowns the group's "most likely" at the end.
   Reference game for the rusj kit (see rusj/KIT.md). */
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
  let H; // the actions, so one action can reuse another

  function nyttKort(S) {
    const valgt = new Set(S.oppsett.pakker);
    const i = stokk.neste((n) => valgt.has(ALLE[n].p));
    S.spill.kort = i;
    S.spill.nr += 1;
    S.spill.fase = "les";
  }

  function poengRader(S) {
    return Array.from({ length: S.spill.antall }, (_, i) => ({ i, poeng: S.spill.poeng[i] || 0 }));
  }

  R.start({
    id: "pekefingeren",
    versjon: 1,

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
    },

    regler: {
      intro: "Et utsagn dukker opp. Alle peker samtidig på den i gjengen som passer best.",
      steg: [
        ["Les høyt", "Én leser utsagnet: «Hvem er mest sannsynlig til å …»"],
        ["Tell ned", "Trykk på knappen. Når mobilen sier PEK, peker alle på én person – samtidig."],
        ["Kår vinneren", "Den som fikk flest fingre, får poenget. Lik stemmer? Ingen får poeng."],
      ],
      tips: ["Lov å forsvare seg – men bare i ti sekunder.", "Sveip kortet til siden for å hoppe til neste.", "Skru av poeng hvis dere bare vil prate."],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Les utsagnet. Tell ned.<br><em>Alle peker samtidig.</em>",
            knapperHtml:
              R.ui.knapp("Start spill", "nytt") +
              (S.spill ? R.ui.knapp2(`Fortsett · kort ${S.spill.nr}`, "fortsett") : "") +
              R.ui.lenke("Slik spiller du", "regler"),
            merker: [
              ["3–20", "spillere"],
              [String(ALLE.length), "utsagn"],
              ["0", "reklame"],
            ],
          }),
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
          ${R.ui.bryter("poeng", S.oppsett.poeng, "Tell poeng", "Trykk på den som fikk flest fingre – og se hvem som vinner til slutt.")}
          ${S.oppsett.poeng ? R.ui.spillere({ min: 3, max: 20 }) : ""}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !S.oppsett.pakker.length }))}`,
      },

      kort: {
        tittel: (S) => `Kort ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const k = ALLE[S.spill.kort];
          const p = pakke(k.p);
          const velg = S.spill.fase === "velg";
          const kort = R.ui.storkort({
            etikett: `${p.ikon} ${p.navn}`,
            nr: `#${S.spill.nr}`,
            tekstHtml: `<span class="prefiks">${esc(D.prefiks)}</span>${esc(k.t)}?`,
            klasse: velg ? "aksent" : "",
            sveip: velg ? null : "neste",
            kompakt: velg,
          });
          if (!velg) {
            return `
              <h1 class="vh" id="skjerm-tittel">Kort ${S.spill.nr}</h1>
              ${kort}
              <p class="sveip-hint" aria-hidden="true">← Sveip for nytt kort →</p>
              ${R.ui.dokk(
                R.ui.knapp("3 · 2 · 1 – PEK!", "pek", { variant: "stor", ikon: "👉" }),
                R.ui.lenkerad(R.ui.lenke("Hopp over", "neste"), S.spill.poeng ? R.ui.lenke("Avslutt og se vinneren", "slutt") : R.ui.lenke("Avslutt", "avslutt")),
              )}`;
          }
          return `
            ${kort}
            <section class="seksjon">
              <h2 id="skjerm-tittel">Hvem fikk flest fingre?</h2>
              ${R.ui.velgere("vinner", Array.from({ length: S.spill.antall }, (_, i) => i), null)}
            </section>
            ${R.ui.dokk(R.ui.knapp2("Uavgjort – ingen poeng", "uavgjort"))}`;
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
          const vunnet = harPoeng ? (S.spill.vunnet[best.i] || []).slice(-3) : [];
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">Mest sannsynlig til alt</p>
              <h1 id="skjerm-tittel">${harPoeng ? esc(R.navn(best.i)) : "Ingen vinner"}</h1>
              ${vunnet.length ? `<p class="ingress">Blant annet til å ${vunnet.map((k) => esc(ALLE[k].t)).join(", ")}.</p>` : ""}
            </div>
            ${harPoeng ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), R.ui.lenke("Til forsiden", "hjem")))}`;
        },
        inn(S) {
          if (poengRader(S).some((r) => r.poeng > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          }
        },
      },
    },

    handlinger: (H = {
      nytt: () => R.gaTil("oppsett"),
      hjem: () => R.gaTil("hjem"),
      fortsett: () => R.gaTil("kort"),
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
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
        };
        nyttKort(S);
        R.holdVaken();
        R.gaTil("kort");
      },
      async pek(el, e, S) {
        await R.nedtelling(["3", "2", "1", "PEK!"], 700);
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        if (S.spill.poeng) {
          S.spill.fase = "velg";
          R.vis();
          const h = R.$("#skjerm-tittel");
          if (h) h.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
        } else {
          await R.kastKort(-1);
          nyttKort(S);
          R.vis();
        }
      },
      async neste(el, e, S) {
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        nyttKort(S);
        R.vis();
      },
      vinner(el, e, S) {
        const i = Number(el.dataset.v);
        S.spill.poeng[i] = (S.spill.poeng[i] || 0) + 1;
        (S.spill.vunnet[i] = S.spill.vunnet[i] || []).push(S.spill.kort);
        R.lyd.riktig();
        R.toast(`+1 til ${R.navn(i)}`);
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
      },
      uavgjort(el, e, S) {
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
      },
      slutt: () => R.gaTil("slutt"),
      async avslutt(el, e, S) {
        if (await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Fortsett")) {
          S.spill = null;
          R.slippVaken();
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
