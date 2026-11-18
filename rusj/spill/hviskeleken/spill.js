/* Hviskeleken — telephone with pictures, as a card of its own on the front page. The game itself is
   Kunstneren's Hviskeleken mode (rusj/spill/kunstneren): word → drawing → guess → drawing … around
   the table, then the whole chain replayed stroke by stroke. This page holds no drawing code: it
   hands over at once to Kunstneren in the same edition with «#hvisk», which opens Kunstneren's
   setup with Hviskeleken chosen. The address is replaced, so «back» goes to where the visitor came from.
   The rules below are the «Slik spiller dere» text under the page (the build runs this file in Node,
   where nothing is handed over) and the «?» sheet of the start screen, which only shows if a
   browser does not follow the hand-over. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;

  // Kunstneren in this edition: the build lists every other game in RUSJ_ANDRE (with its address
  // outside Norwegian); the fallback is its folder per edition.
  const kunstneren = () => {
    const g = (window.RUSJ_ANDRE || []).find((x) => x && x.id === "kunstneren");
    if (g && typeof g.url === "string" && g.url.startsWith("/")) return g.url;
    return { en: "/en/doodler/", da: "/da/kunstneren/" }[R.sprak] || "/kunstneren/";
  };
  const adresse = () => kunstneren() + "#hvisk";

  // ---------- Hand over first ----------
  try {
    const sted = window.location;
    if (sted && typeof sted.pathname === "string" && typeof sted.replace === "function") {
      sted.replace(adresse());
      return;
    }
  } catch (e) {
    /* not a browser (the build reading the rules): carry on */
  }

  // ---------- The start screen (only if the hand-over did not happen) ----------
  R.start({
    id: "hviskeleken",
    versjon: 1,
    tilstand: () => ({}),
    regler: {
      intro: R.t("Hviskeleken er tegn og gjett i kjede: et ord blir en tegning, tegningen blir en gjetning, og gjetningen blir en ny tegning – til ingen kjenner igjen hvor dere startet."),
      steg: [
        [R.t("Tegn ordet"), R.t("Den første får et hemmelig ord – eller finner på en setning selv – og tegner det.")],
        [R.t("Gjett tegningen"), R.t("Neste ser bare tegningen og skriver hva den forestiller.")],
        [R.t("Tegn svaret"), R.t("Neste ser bare svaret og tegner det. Slik går mobilen rundt bordet.")],
        [R.t("Se kjeden"), R.t("Til slutt spilles hele kjeden av, strek for strek. Hvor langt fra start havnet dere?")],
      ],
      tips: [
        R.t("For fire eller flere på én mobil. Er dere et oddetall, gjetter hele bordet den siste tegningen sammen."),
        R.t("Kort tid per tegning gir de morsomste kjedene."),
        R.t("Hviskeleken spilles på tegnebrettet til Kunstneren."),
      ],
    },
    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: () =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Ord blir tegning blir gjetning."))}<br><em>${esc(R.t("Og så ler alle."))}</em>`,
            knapperHtml: R.ui.knapp(R.t("Start"), "start") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            merker: [
              ["4–20", R.t("spillere")],
              ["1", R.t("mobil")],
            ],
          }),
      },
    },
    handlinger: {
      start: () => window.location.assign(adresse()),
    },
  });
})();
