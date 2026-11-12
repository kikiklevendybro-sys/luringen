/* Sladrehanken — «Jeg har aldri …»
   A card says "Jeg har aldri …" (I have never …). Everyone who HAS done it is exposed.
   Two modes: "Fem liv" (everyone starts with five lives; on «AVSLØR!» those who have done it raise
   a hand and lose a life) and "Bare kort" (read, laugh, swipe). Not a drinking game.
   "Fem liv" ends when the first player runs out of lives (nobody sits and watches) or, if the
   group chooses, when one player is left. A player who is alone in having done something gets the
   spotlight: tell the story, and the table may give the life back. About every sixth card the
   reader makes up the statement, and the phone goes round: a new reader for every card. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;
  const LIV = 5;

  // All cards in one list so the deck can remember what has been shown across sessions. The order
  // follows the data file (new packs are added last there), so the remembered numbers stay valid.
  const ALLE = [];
  D.pakker.forEach((p) => p.kort.forEach((t) => ALLE.push({ p: p.id, t })));
  const pakke = (id) => D.pakker.find((p) => p.id === id);
  // The Christmas pack is listed first while it is the season (1 Nov – 6 Jan), otherwise last.
  const julesesong = (d = new Date()) => d.getMonth() >= 10 || (d.getMonth() === 0 && d.getDate() <= 6);
  const PAKKER = (() => {
    const jul = D.pakker.filter((p) => p.id === "jul");
    const andre = D.pakker.filter((p) => p.id !== "jul");
    return julesesong() ? [...jul, ...andre] : [...andre, ...jul];
  })();
  const STANDARD = D.pakker.filter((p) => !p.voksen && p.id !== "jul").map((p) => p.id);
  const stokk = R.kortstokk("kort", ALLE.length);
  let H; // the actions, so one action can reuse another
  let knekker = null; // players whose heart is breaking right now (animation only, never saved)
  let opptatt = false; // an animation is running: ignore double taps (ghost taps: the kit)

  const HJERTE =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21.3C6.2 17.5 1.8 13.6 1.8 8.8 1.8 5.8 4.1 3.6 7 3.6c2 0 3.7 1 5 2.9 1.3-1.9 3-2.9 5-2.9 2.9 0 5.2 2.2 5.2 5.2 0 4.8-4.4 8.7-10.2 12.5z"/></svg>';

  const setning = (t) => (/[.!?…]$/.test(t) ? t : t + ".");
  const storrelse = (t) => (t.length > 62 ? "sladre-lang" : t.length > 34 ? "sladre-mid" : "sladre-kort");
  const alle = (sp) => Array.from({ length: sp.antall }, (_, i) => i);
  const inne = (sp, i) => sp.liv[i] > 0;
  const levende = (sp) => alle(sp).filter((i) => inne(sp, i));
  const pagar = (S) => !!(S.spill && S.spill.fase !== "ferdig");
  const ganger = (n) => (n === 1 ? R.t("én gang") : R.t("{n} ganger", { n }));
  const navneliste = (liste) => R.ramsOpp(liste.map((i) => R.navn(i))); // «A, B og C»
  const iSpill = (sp, i) => Number.isInteger(i) && i >= 0 && i < sp.antall;

  // «Spillet varer til …»: the first player is out ("forste") or one player is left ("siste").
  // Until the group chooses, big groups end at the first knock-out (otherwise the ones with the
  // best stories sit and watch for half the game) and small groups play it out as before.
  const REGLER = ["forste", "siste"];
  const regelFor = (o, antall) => (REGLER.includes(o.regel) ? o.regel : antall >= 5 ? "forste" : "siste");

  // Five hearts. `truet` marks the one that will be lost, `knekk` breaks it (animation).
  function hjerter(liv, o = {}) {
    let html = "";
    for (let n = 0; n < LIV; n++) {
      const siste = n === liv - 1;
      const klasse = n >= liv ? "tomt" : siste && o.knekk ? "knekk" : siste && o.truet ? "truet" : "fullt";
      html += `<i class="${klasse}">${HJERTE}</i>`;
    }
    return `<span class="sladre-hjerter" role="img" aria-label="${esc(R.t("{liv} av {maks} liv", { liv, maks: LIV }))}">${html}</span>`;
  }

  // A new card. `bytte`: the card on the table was skipped, so the same reader gets another one.
  // About every sixth card that is played, the reader makes up the statement (cards 4, 10, 16 …).
  function nyttKort(S, bytte) {
    const sp = S.spill;
    const harSpillere = sp.modus === "liv";
    if (!bytte && sp.nr > 0) {
      if (harSpillere) sp.leser = (sp.leser + 1) % sp.antall;
      sp.sidenEgen = sp.egen ? 0 : sp.sidenEgen + 1;
    } else if (bytte && sp.egen) sp.sidenEgen = 0;
    sp.nr += 1;
    sp.fase = "les";
    sp.valgt = [];
    sp.historie = null;
    if (!bytte && sp.sidenEgen >= 5) {
      sp.egen = true;
      sp.kort = null;
      return;
    }
    const valgt = new Set(sp.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    sp.egen = false;
    sp.kort = i;
  }

  // Who makes up the statement on a «Finn på et selv» card.
  const finnerPa = (sp) => (sp.modus === "liv" ? R.navn(sp.leser) : R.t("Den som leser"));
  // The card as one sentence (for the hidden heading and screen readers).
  const kortSetning = (sp) => (sp.egen ? `${R.t("{navn} finner på resten:", { navn: finnerPa(sp) })} ${D.prefiks}` : `${D.prefiks} ${setning(ALLE[sp.kort].t)}`);

  // Screen readers don't announce a card that is redrawn in place, so say it.
  const siKort = (S) => {
    const sp = S.spill;
    R.si(`${R.t("Kort {nr}.", { nr: sp.nr })} ${sp.modus === "liv" && !sp.egen ? `${R.t("{navn} leser.", { navn: R.navn(sp.leser) })} ` : ""}${kortSetning(sp).replace(" …", "")}`);
  };

  function nyttSpill(S) {
    const o = S.oppsett;
    const antall = R.klamp(S.antall || 4, 2, 20);
    S.spill = {
      modus: o.modus,
      regel: regelFor(o, antall),
      pakker: o.pakker.slice(),
      antall,
      liv: Array(antall).fill(LIV),
      avslort: Array(antall).fill(0), // cards each player has done (and confessed)
      uteNr: Array(antall).fill(0), // the card a player went out on (0 = still in)
      historier: Array(antall).fill(0), // good stories (each gave a life back)
      erfarne: [], // the first one(s) out
      sisteUte: [], // knocked out by the last card
      spilt: 0, // cards that counted
      topp: null, // { k, egen, n, av }: the card that exposed the most players
      slutt: false, // the game is over after the knock-out screen
      angre: null, // what the last lost lives changed, so it can be undone until the next action
      nr: 0,
      kort: null,
      egen: false, // the card on the table is a «Finn på et selv» card (then kort is null)
      sidenEgen: 2, // cards played since the last such card (the first one is card 4)
      leser: (S.lesere || 0) % antall, // who reads the card on the table; a new reader for every card
      historie: null, // { i }: the player in the spotlight, while the table decides about the story
      fase: "les", // les → velg → (historie) → (ute) → ferdig
      valgt: [],
    };
    S.lesere = ((S.lesere || 0) + 1) % 1000; // the next game starts with the next reader
    nyttKort(S);
  }

  // Best first: still in, then out later, more lives left, fewer confessions.
  function rangering(sp) {
    return alle(sp).sort(
      (a, b) =>
        (inne(sp, a) ? 0 : 1) - (inne(sp, b) ? 0 : 1) ||
        sp.uteNr[b] - sp.uteNr[a] ||
        sp.liv[b] - sp.liv[a] ||
        sp.avslort[a] - sp.avslort[b] ||
        a - b,
    );
  }
  const likt = (sp, a, b) => sp.uteNr[a] === sp.uteNr[b] && sp.liv[a] === sp.liv[b] && sp.avslort[a] === sp.avslort[b];
  // The place of everyone in `rang` (equal results share a place: 1, 1, 3).
  function plasser(sp, rang) {
    const ut = {};
    let plass = 0;
    rang.forEach((i, n) => {
      if (n === 0 || !likt(sp, i, rang[n - 1])) plass = n + 1;
      ut[i] = plass;
    });
    return ut;
  }
  function kaaring(sp) {
    const rang = rangering(sp);
    const vinnere = rang.filter((i) => likt(sp, i, rang[0]));
    let erfarne = sp.erfarne.length ? sp.erfarne.slice() : rang.filter((i) => likt(sp, i, rang[rang.length - 1]));
    if (erfarne.some((i) => vinnere.includes(i))) erfarne = [];
    const flest = Math.max(0, ...sp.historier);
    const fortellere = flest > 0 ? alle(sp).filter((i) => sp.historier[i] === flest) : [];
    return { rang, vinnere, erfarne, fortellere, flest };
  }
  // The card that exposed the most players, as text.
  const toppTekst = (sp) => (sp.topp.egen ? R.t("Et kort dere fant på selv.") : `${D.prefiks} ${setning(ALLE[sp.topp.k].t)}`);
  const harTopp = (sp) => !!(sp.topp && sp.topp.n > 1 && (sp.topp.egen || ALLE[sp.topp.k]));

  // The game is over: titles for the most innocent and the most experienced, and the evening's table.
  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    sp.fase = "ferdig";
    sp.angre = null;
    sp.historie = null;
    const rang = rangering(sp);
    const plass = plasser(sp, rang);
    R.statistikk("ferdig", { modus: "liv", regel: sp.regel, spillere: sp.antall, kort: sp.spilt, historier: sp.historier.reduce((a, b) => a + b, 0), tidlig: !!tidlig });
    // The ranking of the result list, as points for «Kveldens gjeng» (best = most).
    R.kveld.registrer(rang.map((i) => ({ i, poeng: sp.antall + 1 - plass[i] })));
    R.slippVaken();
    R.gaTil("slutt");
  }

  // After a card has taken its lives: someone is out (the knock-out screen), or on to the next card.
  function etterKort(S, blirUte, melding) {
    const sp = S.spill;
    sp.historie = null;
    if (blirUte.length) {
      if (!sp.erfarne.length) sp.erfarne = blirUte.slice();
      sp.sisteUte = blirUte.slice();
      sp.slutt = sp.regel === "forste" || levende(sp).length <= 1;
      sp.fase = "ute";
      R.gaTil("ute");
      return;
    }
    nyttKort(S);
    R.gaTil("kort");
    if (melding) R.toast(melding);
    siKort(S);
  }

  function kortet(S, kompakt) {
    const sp = S.spill;
    if (sp.egen) {
      return R.ui.storkort({
        etikett: R.t("✍️ Finn på et selv"),
        nr: `#${sp.nr}`,
        tekstHtml: `<span class="prefiks">${esc(R.t("{navn} finner på resten:", { navn: finnerPa(sp) }))}</span>${esc(D.prefiks)}`,
        klasse: `sladre sladre-kort sladre-egen${kompakt ? " aksent" : ""}`,
        sveip: kompakt ? null : "neste",
        fot: kompakt ? null : R.t("Noe du tror noen her har gjort?"),
        kompakt,
      });
    }
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: `#${sp.nr}`,
      tekstHtml: `<span class="prefiks">${esc(D.prefiks)}</span>${esc(setning(k.t))}`,
      klasse: `sladre ${storrelse(k.t)}${kompakt ? " aksent" : ""}`,
      sveip: kompakt ? null : "neste",
      kompakt,
    });
  }

  // The players still in, as big toggles: tap everyone who has done it.
  function velgere(sp) {
    const igjen = levende(sp);
    return `<div class="sladre-spillere${igjen.length <= 5 ? " bred" : ""}">${igjen
      .map((i) => {
        const pa = sp.valgt.includes(i);
        const knekk = !!(knekker && knekker.has(i));
        return `<button class="sladre-spiller" data-h="avslor" data-v="${i}" data-stille aria-pressed="${pa}"${opptatt ? " disabled" : ""}>
          ${R.avatar(i, "mid")}<span class="sladre-spiller-navn">${esc(R.navn(i))}</span>${hjerter(sp.liv[i], { truet: pa, knekk })}
        </button>`;
      })
      .join("")}</div>`;
  }

  function uteRad(sp) {
    const ute = alle(sp).filter((i) => !inne(sp, i));
    if (!ute.length) return "";
    return `<p class="sladre-ute-rad"><span class="etikett">${esc(R.t("Ute"))}</span>${ute
      .map((i) => `<span class="sladre-ute-navn">${R.avatar(i)}${esc(R.navn(i))}</span>`)
      .join("")}</p>`;
  }

  // Everyone still in, small: avatar + hearts (shown between cards).
  function stilling(sp) {
    return `<ul class="sladre-stilling" aria-label="${esc(R.t("Stillingen"))}">${rangering(sp)
      .filter((i) => inne(sp, i))
      .map((i) => `<li>${R.avatar(i)}<span class="sladre-stilling-navn">${esc(R.navn(i))}</span>${hjerter(sp.liv[i])}</li>`)
      .join("")}</ul>`;
  }

  // «↶ Angre» until the next action, after lives were lost (or given back) by mistake.
  // (Short on purpose: with a name in it the links wrap and the big button jumps.)
  const angreLenke = (sp) => (sp.angre ? R.ui.lenke(R.t("↶ Angre"), "angre", { id: "angre" }) : "");

  function knappTekst(sp) {
    const n = sp.valgt.length;
    if (!n) return R.t("Ingen har gjort det");
    if (n === 1) return R.t("{navn} mister et liv", { navn: R.navn(sp.valgt[0]) });
    return R.t("{n} mister et liv", { n });
  }

  // Alone in having done it: the story gets the spotlight, and the table may give the life back.
  function historien(S) {
    const sp = S.spill;
    const i = sp.historie.i;
    const tom = sp.liv[i] === 0;
    return `
      <div class="sladre-historie-kort">${kortet(S, true)}</div>
      <div class="banner sladre-historie">
        <span class="sladre-historie-figur">${R.avatar(i, "gigant")}<span class="sladre-mikrofon" aria-hidden="true">🎤</span></span>
        <p class="etikett">${esc(tom ? R.t("Alene om det – og tom for liv!") : R.t("Alene om det!"))}</p>
        <h1 id="skjerm-tittel">${esc(R.t("{navn} – fortell!", { navn: R.navn(i) }))}</h1>
        ${hjerter(sp.liv[i])}
        <p class="ingress">${esc(tom ? R.t("En god historie redder deg.") : R.t("Kortversjonen holder, og en god historie gir livet tilbake."))} ${esc(R.t("Det er lov å si pass."))}</p>
      </div>
      ${R.ui.dokk(
        `<div class="knapprad">${R.ui.knapp2(R.t("Videre"), "historie-videre")}${R.ui.knapp(R.t("God historie! +1 liv"), "historie-god", { variant: "mynte" })}</div>`,
        R.ui.lenkerad(angreLenke(sp), R.ui.lenke(R.t("Avslutt"), "avslutt")),
      )}`;
  }

  R.start({
    id: "sladrehanken",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, 2, 20),
      oppsett: { modus: "liv", regel: "auto", pakker: STANDARD.slice() },
      lesere: 0,
      spill: null,
    }),

    // Drop saved settings or games that no longer fit the content, and give games saved by an
    // earlier version what they lack.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "liv", regel: "auto", pakker: [] }, S.oppsett));
      if (o.modus !== "liv" && o.modus !== "kort") o.modus = "liv";
      if (!REGLER.includes(o.regel)) o.regel = "auto";
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      const sp = S.spill;
      const ok =
        sp &&
        (sp.egen === true || ALLE[sp.kort]) &&
        Array.isArray(sp.pakker) &&
        Array.isArray(sp.liv) &&
        sp.liv.length === sp.antall &&
        Array.isArray(sp.valgt) &&
        Array.isArray(sp.uteNr) &&
        Array.isArray(sp.avslort);
      if (!ok) S.spill = null;
      else {
        if (!REGLER.includes(sp.regel)) sp.regel = "siste"; // a game from before the choice existed
        sp.egen = sp.egen === true;
        if (!Number.isInteger(sp.sidenEgen)) sp.sidenEgen = 0;
        if (!iSpill(sp, sp.leser)) sp.leser = 0;
        if (!Array.isArray(sp.historier) || sp.historier.length !== sp.antall) sp.historier = Array(sp.antall).fill(0);
        if (!Array.isArray(sp.erfarne)) sp.erfarne = [];
        if (!Array.isArray(sp.sisteUte)) sp.sisteUte = [];
        if (sp.topp && !(sp.topp.egen || ALLE[sp.topp.k])) sp.topp = null;
        if (sp.angre && !(Array.isArray(sp.angre.liv) && (sp.angre.egen === true || ALLE[sp.angre.kort]))) sp.angre = null;
        if (!["les", "velg", "historie", "ute", "ferdig"].includes(sp.fase)) sp.fase = "les";
        if (sp.fase === "historie" && !(sp.historie && iSpill(sp, sp.historie.i))) sp.fase = "les";
        if (sp.fase !== "historie") sp.historie = null;
      }
      if (!S.spill && ["kort", "ute", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    // rusj.no/sladrehanken/#jul opens «Gjør klart» with only the Christmas pack chosen.
    vedHash(S, hash) {
      if (String(hash).trim().toLowerCase() !== "jul" || !pakke("jul") || pagar(S)) return null;
      S.oppsett.pakker = ["jul"];
      return "oppsett";
    },

    regler: {
      intro: R.t("Hvert kort begynner med «Jeg har aldri …». Har du gjort det likevel, er du avslørt – og historien må gjerne fram."),
      steg: [
        [R.t("Les kortet høyt"), R.t("Den som har mobilen, leser hele kortet: «Jeg har aldri …» Så går mobilen videre til nestemann.")],
        [R.t("Avslør dere"), R.t("Trykk på knappen. På «AVSLØR!» rekker alle som HAR gjort det, opp hånda – samtidig.")],
        [R.t("Mist et liv"), R.t("Trykk på alle som rakte opp hånda. De mister et liv. Når den første går tom, er spillet over – og den med flest liv igjen er uskyldigst.")],
      ],
      tips: [
        R.t("Er du alene om det, må historien fram. Er den god, gir gjengen deg livet tilbake."),
        R.t("Ingen trenger å fortelle mer enn de vil. Det er lov å si pass."),
        R.t("Av og til finner dere på resten av setningen selv. Sikt gjerne på noen rundt bordet!"),
        R.t("Vil dere spille til bare én står igjen? Velg det under «Spillet varer til …»."),
        R.t("Velg «Bare kort» hvis dere vil lese og prate uten å telle liv."),
        R.t("Festpakken er for voksne og er ikke med før dere velger den."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Les kortet høyt."))}<br><em>${esc(R.t("Har du gjort det, er du avslørt!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · kort {nr}", { nr: S.spill.nr }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["2–20", R.t("spillere")],
              [String(ALLE.length), R.t("kort")],
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
          const antallKort = D.pakker.filter((p) => o.pakker.includes(p.id)).reduce((s, p) => s + p.kort.length, 0);
          const regel = regelFor(o, R.klamp(S.antall || 4, 2, 20));
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvordan vil dere spille?"))}</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "liv", tittel: R.t("Fem liv"), tekst: R.t("Mist et liv hver gang du er avslørt. Flest liv til slutt vinner."), ikon: "❤️" },
                { v: "kort", tittel: R.t("Bare kort"), tekst: R.t("Les, le og sveip videre. Ingen poeng."), ikon: "🃏" },
              ],
              o.modus,
            )}
          </section>
          ${
            o.modus === "liv"
              ? `<section class="seksjon">
                  <h2>${esc(R.t("Spillet varer til …"))}</h2>
                  ${R.ui.seg("regel", [["forste", R.t("Første er ute")], ["siste", R.t("Én står igjen")]], regel, { etikett: R.t("Spillet varer til") })}
                  <p class="hjelp">${esc(
                    regel === "forste"
                      ? R.t("Ingen blir sittende og se på: Når den første går tom for liv, er det kåring.")
                      : R.t("Den som går tom for liv, er ute. Den siste med liv igjen vinner."),
                  )}</p>
                </section>`
              : ""
          }
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.t("{n} kort", { n: antallKort }))}</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          ${o.modus === "liv" ? R.ui.spillere({ min: 2, max: 20, hjelp: R.t("Alle starter med fem liv.") }) : ""}
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel: (S) => R.t("Kort {nr}", { nr: S.spill.nr }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          if (sp.fase === "historie") return historien(S);
          const tittel = `<h1 class="vh" id="skjerm-tittel">${esc(R.t("Kort {nr}: {kort}", { nr: sp.nr, kort: kortSetning(sp) }))}</h1>`;
          if (sp.modus === "kort") {
            return `
              ${tittel}
              ${kortet(S, false)}
              <p class="sladre-hint"><span aria-hidden="true">✋</span> ${esc(R.t("Har du gjort det? Rekk opp hånda!"))}</p>
              ${R.ui.dokk(R.ui.knapp(R.t("Neste kort"), "neste", { variant: "stor" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
          }
          if (sp.fase !== "velg") {
            return `
              ${tittel}
              ${kortet(S, false)}
              <div class="sladre-under">
                <p class="sladre-leser">${R.avatar(sp.leser)}<span>${esc(R.t("Leser:"))} <b>${esc(R.navn(sp.leser))}</b></span></p>
                <p class="sladre-hint"><span aria-hidden="true">✋</span> ${esc(R.t("Har du gjort det? Rekk opp hånda på «AVSLØR!»"))}</p>
              </div>
              ${R.ui.dokk(
                R.ui.knapp(R.t("3 · 2 · 1 – Avslør!"), "avslor-na", { variant: "stor", ikon: "✋" }),
                R.ui.lenkerad(angreLenke(sp), R.ui.lenke(R.t("Hopp over kortet"), "neste"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
              )}`;
          }
          return `
            <h1 class="vh">${esc(R.t("Kort {nr}: hvem har gjort det?", { nr: sp.nr }))}</h1>
            ${kortet(S, true)}
            <section class="seksjon sladre-velg">
              <div class="seksjon-hode"><h2 id="skjerm-tittel">${esc(R.t("Hvem har gjort det?"))}</h2><span class="tall">${esc(R.t("{n} avslørt", { n: sp.valgt.length }))}</span></div>
              <p class="sladre-hjelp">${esc(R.t("Trykk på alle som rakte opp hånda."))}</p>
              ${velgere(sp)}
              ${sp.valgt.length > 1 ? `<p class="sladre-prat"><span aria-hidden="true">💬</span> ${esc(R.t("Hvem har den beste historien?"))}</p>` : ""}
              ${uteRad(sp)}
            </section>
            ${R.ui.dokk(R.ui.knapp(knappTekst(sp), "ferdig", { variant: sp.valgt.length ? "" : "mynte", av: opptatt }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      ute: {
        tittel: R.t("Avslørt!"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ute = sp.sisteUte.length ? sp.sisteUte : rangering(sp).slice(-1);
          const forst = sp.erfarne.length && sp.erfarne.every((i) => ute.includes(i)) && ute.every((i) => sp.erfarne.includes(i));
          const mange = ute.length > 1;
          const igjen = levende(sp);
          const over = sp.slutt || igjen.length <= 1; // the crowning is next
          const forsteUte = sp.regel === "forste";
          return `
            <div class="banner rosa sladre-ute">
              <div class="sladre-ute-figurer">${ute.map((i) => R.avatar(i, mange ? "stor" : "gigant")).join("")}</div>
              <p class="etikett">${esc(forsteUte ? (mange ? R.t("Tomme for liv – samtidig") : R.t("Første tom for liv")) : mange ? R.t("Avslørt og ute – alle sammen") : R.t("Avslørt og ute"))}</p>
              <h1 id="skjerm-tittel">${ute.length > 3 ? esc(R.t("{n} på én gang", { n: ute.length })) : esc(navneliste(ute))}</h1>
              <div class="stempel-sted"><span class="stempel">${esc(R.t("Ute!"))}</span></div>
              <p class="ingress">${esc(
                ute.length > 3
                  ? R.t("{navn} gikk tom for liv på samme kort.", { navn: navneliste(ute) })
                  : mange
                    ? R.t("Tomt for liv på samme kort. Det er mye å fortelle!")
                    : R.t("Har gjort {n} av {alle} ting. Det er mye å fortelle!", { n: sp.avslort[ute[0]], alle: sp.spilt }),
              )}</p>
            </div>
            ${
              forst
                ? `<div class="papirboks sladre-tittel">
                    <span class="sladre-tittel-ikon" aria-hidden="true">😎</span>
                    <div><p class="etikett">${esc(R.t("Ny tittel"))}</p><p class="sladre-tittel-navn">${esc(R.t("Mest erfaren"))}</p><p>${esc(mange ? R.t("Først ute – de har levd et spennende liv.") : R.t("Først ute – har levd et spennende liv."))}</p></div>
                  </div>`
                : ""
            }
            ${
              !over
                ? `<section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Fortsatt med"))}</h2><span class="tall">${esc(R.t("{n} igjen", { n: igjen.length }))}</span></div>${stilling(sp)}</section>`
                : `<p class="ingress midt">${esc(forsteUte && igjen.length > 1 ? R.t("Dermed er spillet over. Hvem er uskyldigst?") : R.t("Bare én er igjen …"))}</p>`
            }
            ${R.ui.dokk(R.ui.knapp(over ? R.t("Til kåringen") : R.t("Neste kort"), "videre"), R.ui.lenkerad(angreLenke(sp), over ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn() {
          // A drum roll for the title «Mest erfaren» — never a boo: the player was honest.
          R.lyd.trommevirvel(0.4);
          R.vibrer([80, 60, 180]);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const { rang, vinnere, erfarne, fortellere, flest } = kaaring(sp);
          const v = vinnere[0];
          const delt = vinnere.length > 1;
          const x = sp.avslort[v];
          const linje = delt
            ? R.t("Like mange liv igjen. Like uskyldige – eller like flinke til å lyve?")
            : x === 0
              ? R.t("Ikke avslørt én eneste gang på {n} kort. Engel – eller bare flink til å lyve?", { n: sp.spilt })
              : R.t("Avslørt bare {ganger} på {n} kort. Mistenkelig uskyldig!", { ganger: ganger(x), n: sp.spilt });
          const plass = plasser(sp, rang);
          const rader = rang
            .map((i) => {
              const hoyre = inne(sp, i) ? hjerter(sp.liv[i]) : `<span class="sladre-ute-merke">${esc(sp.regel === "forste" ? R.t("Tom for liv") : R.t("Ute på kort {nr}", { nr: sp.uteNr[i] }))}</span>`;
              return `<li class="${plass[i] === 1 ? "leder" : ""}"><span class="plass-nr">${plass[i]}</span>${R.avatar(i)}<span class="navn">${esc(R.navn(i))}</span>${hoyre}</li>`;
            })
            .join("");
          const tittelboks = (ikon, etikett, hvem, tekst) => `<div class="papirboks sladre-tittel">
              <span class="sladre-tittel-ikon" aria-hidden="true">${ikon}</span>
              <div><p class="etikett">${esc(etikett)}</p><p class="sladre-tittel-navn">${hvem.length > 3 ? esc(R.t("{n} spillere", { n: hvem.length })) : esc(navneliste(hvem))}</p><p>${esc(tekst)}</p></div>
            </div>`;
          return `
            ${R.ui.banner({
              klasse: `aksent${delt ? " sladre-delt" : ""}`,
              etikett: delt ? R.t("Delt seier – uskyldigst") : R.t("Uskyldigst 😇"),
              tittel: vinnere.length > 3 ? R.t("{n} spillere vinner!", { n: vinnere.length }) : R.t("{navn} vinner!|{navn} vinner!", { navn: navneliste(vinnere), n: vinnere.length }),
              tekst: linje,
            })}
            ${erfarne.length ? tittelboks("😎", R.t("Mest erfaren"), erfarne, sp.erfarne.length ? R.t("Først ute. Her er det mange historier å hente!") : R.t("Avslørt flest ganger. Her er det mange historier å hente!")) : ""}
            ${fortellere.length ? tittelboks("🎤", R.t("Beste forteller"), fortellere, flest === 1 ? R.t("Fikk livet tilbake for en god historie.") : R.t("Fikk livet tilbake for {n} gode historier.", { n: flest })) : ""}
            ${
              harTopp(sp)
                ? `<div class="papirboks sladre-topp">
                    <p class="etikett">${esc(R.t("Kortet som avslørte flest"))}</p>
                    <p class="sladre-topp-tekst">${esc(toppTekst(sp))}</p>
                    <p>${esc(R.t("{n} av {alle} hadde gjort det.", { n: sp.topp.n, alle: sp.topp.av }))}</p>
                  </div>`
                : ""
            }
            <section class="seksjon">
              <h2>${esc(R.t("Resultatliste"))}</h2>
              <ol class="poengliste sladre-rang">${rader}</ol>
              ${R.ui.knapp2(R.t("Del kåringen"), "del")}
            </section>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn() {
          R.lyd.fanfare();
          R.konfetti();
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
        if (!pagar(S)) return;
        R.holdVaken();
        R.gaTil(S.spill.fase === "ute" ? "ute" : "kort");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "kort" ? "kort" : "liv";
        R.vis();
      },
      regel(el, e, S) {
        S.oppsett.regel = el.dataset.v === "siste" ? "siste" : "forste";
        R.vis();
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        nyttSpill(S);
        const sp = S.spill;
        R.statistikk("start", { modus: sp.modus, regel: sp.modus === "liv" ? sp.regel : "", spillere: sp.modus === "liv" ? sp.antall : 0, pakker: o.pakker.length, jul: o.pakker.includes("jul") });
        R.holdVaken();
        R.gaTil("kort");
      },
      // Next card ("Bare kort") or skip this one ("Fem liv"). Also called by swiping the card.
      async neste(el, e, S) {
        if (opptatt || !pagar(S) || S.spill.fase !== "les") return;
        S.spill.angre = null;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S, S.spill.modus === "liv");
        R.vis();
        window.scrollTo(0, 0);
        siKort(S);
      },
      async "avslor-na"(el, e, S) {
        if (opptatt || !pagar(S) || S.spill.modus !== "liv" || S.spill.fase !== "les") return;
        S.spill.angre = null;
        opptatt = true;
        let ferdigTelt = false;
        try {
          ferdigTelt = await R.nedtelling(["3", "2", "1", R.t("AVSLØR!")], 650);
        } finally {
          opptatt = false;
        }
        if (!ferdigTelt) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        S.spill.fase = "velg";
        S.spill.valgt = [];
        R.vis();
        R.si(R.t("Hvem har gjort det? Trykk på alle som rakte opp hånda."));
        const h = R.$("#skjerm-tittel");
        if (h) h.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "start" });
      },
      avslor(el, e, S) {
        if (opptatt) return;
        const sp = S.spill;
        if (!sp || sp.fase !== "velg") return;
        const i = Number(el.dataset.v);
        if (!iSpill(sp, i) || !inne(sp, i)) return;
        const pa = sp.valgt.includes(i);
        sp.valgt = pa ? sp.valgt.filter((x) => x !== i) : [...sp.valgt, i];
        if (pa) R.lyd.klikk();
        else {
          R.lyd.pop();
          R.vibrer(15);
        }
        R.vis();
      },
      async ferdig(el, e, S) {
        if (opptatt) return;
        const sp = S.spill;
        if (!sp || sp.fase !== "velg") return;
        const valgt = sp.valgt.filter((i) => inne(sp, i));
        const igjenFor = levende(sp);
        if (!valgt.length) {
          sp.spilt += 1;
          R.lyd.riktig();
          R.toast(R.t("Uskyldige, alle sammen!"));
          nyttKort(S);
          R.vis();
          window.scrollTo(0, 0);
          siKort(S);
          return;
        }
        const blirUte = valgt.filter((i) => sp.liv[i] === 1);
        // Show the hearts breaking before anything is saved (a reload now just shows the choice again).
        const fortsatt = R.vakt();
        opptatt = true;
        knekker = new Set(valgt);
        R.vis();
        R.lyd.tone(520, 0, 0.12, "triangle", 0.16, 300);
        R.lyd.tone(300, 0.12, 0.22, "triangle", 0.14, 160);
        R.vibrer([40, 30, 60]);
        await R.vent(R.rolig() ? 150 : 820);
        knekker = null;
        opptatt = false;
        // Left the screen meanwhile (back button): nothing is changed, the choice is still there.
        if (!fortsatt()) return;
        if (blirUte.length === igjenFor.length) {
          // Everyone left would be out at once: this card doesn't count.
          R.toast(R.t("Alle ville røket ut samtidig – kortet teller ikke!"));
          nyttKort(S, true);
          R.vis();
          window.scrollTo(0, 0);
          siKort(S);
          return;
        }
        sp.angre = {
          kort: sp.kort,
          egen: sp.egen,
          nr: sp.nr,
          leser: sp.leser,
          sidenEgen: sp.sidenEgen,
          valgt: valgt.slice(),
          liv: sp.liv.slice(),
          avslort: sp.avslort.slice(),
          uteNr: sp.uteNr.slice(),
          historier: sp.historier.slice(),
          erfarne: sp.erfarne.slice(),
          spilt: sp.spilt,
          topp: sp.topp,
        };
        sp.spilt += 1;
        valgt.forEach((i) => {
          sp.liv[i] -= 1;
          sp.avslort[i] += 1;
          if (sp.liv[i] === 0) sp.uteNr[i] = sp.nr;
        });
        if (!sp.topp || valgt.length > sp.topp.n) sp.topp = { k: sp.egen ? -1 : sp.kort, egen: sp.egen, n: valgt.length, av: igjenFor.length };
        if (valgt.length === 1) {
          // Alone in having done it: the story first. A good one gives the life back — also the last one.
          sp.fase = "historie";
          sp.historie = { i: valgt[0] };
          R.gaTil("kort");
          R.lyd.pling();
          R.si(R.t("{navn} er alene om det og mistet et liv. Fortell! En god historie gir livet tilbake.", { navn: R.navn(valgt[0]) }));
          return;
        }
        etterKort(S, blirUte, R.t("{n} mistet et liv", { n: valgt.length }));
      },
      // The table liked the story: the life comes back (and a player on zero is in again).
      "historie-god"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "historie" || !sp.historie) return;
        const i = sp.historie.i;
        sp.liv[i] = Math.min(LIV, sp.liv[i] + 1);
        sp.uteNr[i] = 0;
        sp.historier[i] += 1;
        R.lyd.riktig();
        R.vibrer(30);
        etterKort(S, [], R.t("{navn} fikk livet tilbake", { navn: R.navn(i) }));
      },
      // No story (or not this time): on to the next card — or out, if that was the last life.
      "historie-videre"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "historie" || !sp.historie) return;
        const i = sp.historie.i;
        etterKort(S, sp.liv[i] === 0 ? [i] : []);
      },
      // Take back the last card: lives, stories and titles are as before, and the card comes back
      // to «Hvem har gjort det?» with the same choice.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || opptatt || !pagar(S)) return;
        Object.assign(sp, {
          kort: a.kort,
          egen: a.egen === true,
          nr: a.nr,
          valgt: a.valgt,
          liv: a.liv,
          avslort: a.avslort,
          uteNr: a.uteNr,
          erfarne: a.erfarne,
          spilt: a.spilt,
          topp: a.topp,
        });
        if (iSpill(sp, a.leser)) sp.leser = a.leser;
        if (Number.isInteger(a.sidenEgen)) sp.sidenEgen = a.sidenEgen;
        if (Array.isArray(a.historier) && a.historier.length === sp.antall) sp.historier = a.historier;
        sp.sisteUte = [];
        sp.slutt = false;
        sp.historie = null;
        sp.fase = "velg";
        sp.angre = null;
        R.lyd.snu();
        R.gaTil("kort");
        R.toast(R.t("Angret – velg på nytt"));
      },
      // From the knock-out screen: the next card, or the crowning when the game is over.
      videre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "ute") return;
        if (sp.slutt || levende(sp).length <= 1) return tilSlutt(S);
        sp.sisteUte = [];
        sp.angre = null;
        nyttKort(S);
        R.gaTil("kort");
        siKort(S);
      },
      // «Avslutt»: with lives at stake straight to the crowning (the sheet says so), otherwise home.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const medKaaring = sp.modus === "liv" && sp.spilt > 0;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), medKaaring ? R.t("Dere går rett til kåringen. Den med flest liv igjen er uskyldigst.") : R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !pagar(S)) return;
        if (medKaaring) {
          // A player in the spotlight on zero lives never got the story: out, as «Videre» would say.
          if (sp.fase === "historie" && sp.historie && sp.liv[sp.historie.i] === 0 && !sp.erfarne.length) sp.erfarne = [sp.historie.i];
          return tilSlutt(S, true);
        }
        R.statistikk("ferdig", { modus: sp.modus, regel: "", spillere: 0, kort: Math.max(0, sp.nr - 1), historier: 0, tidlig: true });
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },
      // The crowning as text, for the group chat.
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.modus !== "liv" || sp.fase !== "ferdig") return;
        const { vinnere, erfarne, fortellere } = kaaring(sp);
        const navn = (liste) => (liste.length > 3 ? R.t("{n} spillere", { n: liste.length }) : navneliste(liste));
        const deler = [R.t("{navn} er uskyldigst 😇|{navn} er uskyldigst 😇", { navn: navn(vinnere), n: vinnere.length })];
        if (erfarne.length) deler.push(R.t("{navn} er mest erfaren 😎|{navn} er mest erfaren 😎", { navn: navn(erfarne), n: erfarne.length }));
        if (fortellere.length) deler.push(R.t("{navn} er beste forteller 🎤|{navn} er beste forteller 🎤", { navn: navn(fortellere), n: fortellere.length }));
        let tekst = R.t("Kåringen i {spill}: {deler}.", { spill: R.app.navn, deler: R.ramsOpp(deler) });
        if (harTopp(sp)) tekst += " " + (sp.topp.egen ? R.t("Kortet som avslørte flest, fant vi på selv.") : R.t("Kortet som avslørte flest: «{kort}».", { kort: `${D.prefiks.replace(" …", "")} ${setning(ALLE[sp.topp.k].t).replace(/[.]$/, "")}` }));
        R.del(R.app.navn, tekst, location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "sladrehanken") + "/");
      },
      // Play again with the same mode as the game that just ended.
      igjen(el, e, S) {
        if (S.spill) S.oppsett.modus = S.spill.modus;
        H.start(el, e, S);
      },
    }),
  });
})();
