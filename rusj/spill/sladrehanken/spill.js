/* Sladrehanken — «Jeg har aldri …»
   A card says "Jeg har aldri …" (I have never …). Everyone who HAS done it is exposed.
   Two modes: "Fem liv" (everyone starts with five lives; on «AVSLØR!» those who have done it raise
   a hand and lose a life; the last one with lives left is crowned the most innocent) and
   "Bare kort" (read, laugh, swipe). Not a drinking game. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;
  const LIV = 5;

  // All cards in one list so the deck can remember what has been shown across sessions.
  const ALLE = [];
  D.pakker.forEach((p) => p.kort.forEach((t) => ALLE.push({ p: p.id, t })));
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const STANDARD = PAKKER.filter((p) => !p.voksen).map((p) => p.id);
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
  const ganger = (n) => (n === 1 ? "én gang" : `${n} ganger`);
  const navneliste = (liste) => R.ramsOpp(liste.map((i) => R.navn(i))); // «A, B og C»

  // Five hearts. `truet` marks the one that will be lost, `knekk` breaks it (animation).
  function hjerter(liv, o = {}) {
    let html = "";
    for (let n = 0; n < LIV; n++) {
      const siste = n === liv - 1;
      const klasse = n >= liv ? "tomt" : siste && o.knekk ? "knekk" : siste && o.truet ? "truet" : "fullt";
      html += `<i class="${klasse}">${HJERTE}</i>`;
    }
    return `<span class="sladre-hjerter" role="img" aria-label="${liv} av ${LIV} liv">${html}</span>`;
  }

  function nyttKort(S) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    sp.kort = i;
    sp.nr += 1;
    sp.fase = "les";
    sp.valgt = [];
  }

  // Screen readers don't announce a card that is redrawn in place, so say it.
  const siKort = (S) => R.si(`Kort ${S.spill.nr}. ${D.prefiks.replace(" …", "")} ${setning(ALLE[S.spill.kort].t)}`);

  function nyttSpill(S) {
    const antall = R.klamp(S.antall || 4, 2, 20);
    S.spill = {
      modus: S.oppsett.modus,
      pakker: S.oppsett.pakker.slice(),
      antall,
      liv: Array(antall).fill(LIV),
      avslort: Array(antall).fill(0), // cards each player has done (and confessed)
      uteNr: Array(antall).fill(0), // the card a player went out on (0 = still in)
      erfarne: [], // the first one(s) out
      sisteUte: [], // knocked out by the last card
      spilt: 0, // cards that counted
      topp: null, // { k, n, av }: the card that exposed the most players
      slutt: false,
      angre: null, // what the last lost lives changed, so it can be undone until the next action
      nr: 0,
      kort: null,
      fase: "les",
      valgt: [],
    };
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
  function kaaring(sp) {
    const rang = rangering(sp);
    const vinnere = rang.filter((i) => likt(sp, i, rang[0]));
    let erfarne = sp.erfarne.length ? sp.erfarne.slice() : rang.filter((i) => likt(sp, i, rang[rang.length - 1]));
    if (erfarne.some((i) => vinnere.includes(i))) erfarne = [];
    return { rang, vinnere, erfarne };
  }

  function kortet(S, kompakt) {
    const sp = S.spill;
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
    return `<p class="sladre-ute-rad"><span class="etikett">Ute</span>${ute
      .map((i) => `<span class="sladre-ute-navn">${R.avatar(i)}${esc(R.navn(i))}</span>`)
      .join("")}</p>`;
  }

  // Everyone still in, small: avatar + hearts (shown between cards).
  function stilling(sp) {
    return `<ul class="sladre-stilling" aria-label="Stillingen">${rangering(sp)
      .filter((i) => inne(sp, i))
      .map((i) => `<li>${R.avatar(i)}<span class="sladre-stilling-navn">${esc(R.navn(i))}</span>${hjerter(sp.liv[i])}</li>`)
      .join("")}</ul>`;
  }

  // «↶ Angre» until the next action, after lives were lost by mistake.
  function angreLenke(sp) {
    const a = sp.angre;
    if (!a) return "";
    const hvem = a.valgt.length === 1 ? `${R.navn(a.valgt[0])} mistet et liv` : `${a.valgt.length} mistet et liv`;
    return R.ui.lenke(`↶ Angre: ${hvem}`, "angre");
  }

  function knappTekst(sp) {
    const n = sp.valgt.length;
    if (!n) return "Ingen har gjort det";
    if (n === 1) return `${R.navn(sp.valgt[0])} mister et liv`;
    return `${n} mister et liv`;
  }

  R.start({
    id: "sladrehanken",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, 2, 20),
      oppsett: { modus: "liv", pakker: STANDARD.slice() },
      spill: null,
    }),

    // Drop saved settings or games that no longer fit the content.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "liv", pakker: [] }, S.oppsett));
      if (o.modus !== "liv" && o.modus !== "kort") o.modus = "liv";
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      const sp = S.spill;
      const ok =
        sp &&
        ALLE[sp.kort] &&
        Array.isArray(sp.pakker) &&
        Array.isArray(sp.liv) &&
        sp.liv.length === sp.antall &&
        Array.isArray(sp.valgt) &&
        Array.isArray(sp.uteNr) &&
        Array.isArray(sp.avslort);
      if (!ok) S.spill = null;
      if (S.spill && S.spill.angre && !(Array.isArray(S.spill.angre.liv) && ALLE[S.spill.angre.kort])) S.spill.angre = null;
      if (!S.spill && ["kort", "ute", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Hvert kort begynner med «Jeg har aldri …». Har du gjort det likevel, er du avslørt – og historien må gjerne fram.",
      steg: [
        ["Les kortet høyt", "Én leser hele kortet: «Jeg har aldri …»"],
        ["Avslør dere", "Trykk på knappen. På «AVSLØR!» rekker alle som HAR gjort det, opp hånda – samtidig."],
        ["Mist et liv", "Trykk på alle som rakte opp hånda. De mister et liv. Den siste med liv igjen er den uskyldigste."],
      ],
      tips: [
        "Den som blir avslørt, forteller gjerne hva som skjedde. Kortversjonen holder!",
        "Ingen trenger å fortelle mer enn de vil. Det er lov å si pass.",
        "Velg «Bare kort» hvis dere vil lese og prate uten å telle liv.",
        "Festpakken er for voksne og er ikke med før dere velger den.",
        "Sveip kortet til siden for å hoppe over det.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Les kortet høyt.<br><em>Har du gjort det, er du avslørt!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · kort ${S.spill.nr}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–20", "spillere"],
              [String(ALLE.length), "kort"],
              ["0", "reklame"],
            ],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const antallKort = PAKKER.filter((p) => o.pakker.includes(p.id)).reduce((s, p) => s + p.kort.length, 0);
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <h2>Hvordan vil dere spille?</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "liv", tittel: "Fem liv", tekst: "Mist et liv hver gang du er avslørt. Sist igjen vinner.", ikon: "❤️" },
                { v: "kort", tittel: "Bare kort", tekst: "Les, le og sveip videre. Ingen poeng.", ikon: "🃏" },
              ],
              o.modus,
            )}
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Velg pakker</h2><span class="tall">${antallKort} kort</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          ${o.modus === "liv" ? R.ui.spillere({ min: 2, max: 20, hjelp: "Alle starter med fem liv." }) : ""}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel: (S) => `Kort ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const tittel = `<h1 class="vh" id="skjerm-tittel">Kort ${sp.nr}: ${esc(D.prefiks)} ${esc(ALLE[sp.kort].t)}</h1>`;
          if (sp.modus === "kort") {
            return `
              ${tittel}
              ${kortet(S, false)}
              <p class="sladre-hint"><span aria-hidden="true">✋</span> Har du gjort det? Rekk opp hånda!</p>
              ${R.ui.dokk(
                R.ui.knapp("Neste kort", "neste", { variant: "stor", ikon: "👉" }),
                R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")),
              )}`;
          }
          if (sp.fase !== "velg") {
            return `
              ${tittel}
              ${kortet(S, false)}
              <p class="sladre-hint"><span aria-hidden="true">✋</span> Har du gjort det? Rekk opp hånda på «AVSLØR!»</p>
              ${R.ui.dokk(
                R.ui.knapp("3 · 2 · 1 – Avslør!", "avslor-na", { variant: "stor", ikon: "✋" }),
                R.ui.lenkerad(angreLenke(sp), R.ui.lenke("Hopp over kortet", "neste"), R.ui.lenke("Avslutt", "avslutt")),
              )}`;
          }
          return `
            <h1 class="vh">Kort ${sp.nr}: hvem har gjort det?</h1>
            ${kortet(S, true)}
            <section class="seksjon sladre-velg">
              <div class="seksjon-hode"><h2 id="skjerm-tittel">Hvem har gjort det?</h2><span class="tall">${sp.valgt.length} avslørt</span></div>
              <p class="sladre-hjelp">Trykk på alle som rakte opp hånda.</p>
              ${velgere(sp)}
              ${uteRad(sp)}
            </section>
            ${R.ui.dokk(R.ui.knapp(knappTekst(sp), "ferdig", { variant: sp.valgt.length ? "" : "mynte", av: opptatt }))}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      ute: {
        tittel: "Avslørt!",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ute = sp.sisteUte.length ? sp.sisteUte : rangering(sp).slice(-1);
          const forst = sp.erfarne.length && sp.erfarne.every((i) => ute.includes(i)) && ute.every((i) => sp.erfarne.includes(i));
          const mange = ute.length > 1;
          const igjen = levende(sp);
          const fortsatt = igjen.length > 1;
          return `
            <div class="banner rosa sladre-ute">
              <div class="sladre-ute-figurer">${ute.map((i) => R.avatar(i, mange ? "stor" : "gigant")).join("")}</div>
              <p class="etikett">${mange ? "Avslørt og ute – alle sammen" : "Avslørt og ute"}</p>
              <h1 id="skjerm-tittel">${ute.length > 3 ? `${ute.length} på én gang` : esc(navneliste(ute))}</h1>
              <div class="stempel-sted"><span class="stempel">Ute!</span></div>
              <p class="ingress">${
                ute.length > 3
                  ? `${esc(navneliste(ute))} gikk tom for liv på samme kort.`
                  : mange
                    ? `Tomt for liv på samme kort. Det er mye å fortelle!`
                    : `Har gjort ${sp.avslort[ute[0]]} av ${sp.spilt} ting. Det er mye å fortelle!`
              }</p>
            </div>
            ${
              forst
                ? `<div class="papirboks sladre-tittel">
                    <span class="sladre-tittel-ikon" aria-hidden="true">😎</span>
                    <div><p class="etikett">Ny tittel</p><p class="sladre-tittel-navn">Mest erfaren</p><p>Først ute – ${mange ? "de har" : "har"} levd et spennende liv.</p></div>
                  </div>`
                : ""
            }
            ${
              fortsatt
                ? `<section class="seksjon"><div class="seksjon-hode"><h2>Fortsatt med</h2><span class="tall">${igjen.length} igjen</span></div>${stilling(sp)}</section>`
                : `<p class="ingress midt">Bare én er igjen …</p>`
            }
            ${R.ui.dokk(
              fortsatt ? R.ui.knapp("Neste kort", "videre", { ikon: "👉" }) : R.ui.knapp("Hvem vant?", "videre", { ikon: "🏆", variant: "stor" }),
              sp.angre ? R.ui.lenkerad(angreLenke(sp)) : "",
            )}`;
        },
        inn() {
          R.lyd.buu();
          R.vibrer([80, 60, 180]);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const { rang, vinnere, erfarne } = kaaring(sp);
          const v = vinnere[0];
          const delt = vinnere.length > 1;
          const x = sp.avslort[v];
          const linje = delt
            ? `Like mange liv igjen. Like uskyldige – eller like flinke til å lyve?`
            : x === 0
              ? `Ikke avslørt én eneste gang på ${sp.spilt} kort. Engel – eller bare flink til å lyve?`
              : `Avslørt bare ${ganger(x)} på ${sp.spilt} kort. Mistenkelig uskyldig!`;
          const topp = sp.topp && ALLE[sp.topp.k];
          let plass = 0;
          const rader = rang
            .map((i, n) => {
              if (n === 0 || !likt(sp, i, rang[n - 1])) plass = n + 1;
              const hoyre = inne(sp, i) ? hjerter(sp.liv[i]) : `<span class="sladre-ute-merke">Ute på kort ${sp.uteNr[i]}</span>`;
              return `<li class="${plass === 1 ? "leder" : ""}"><span class="plass-nr">${plass}</span>${R.avatar(i)}<span class="navn">${esc(R.navn(i))}</span>${hoyre}</li>`;
            })
            .join("");
          return `
            <div class="banner aksent${delt ? " sladre-delt" : ""}">
              ${R.figur()}
              <p class="etikett">${delt ? "Delt seier – uskyldigst" : "Uskyldigst 😇"}</p>
              <h1 id="skjerm-tittel">${vinnere.length > 3 ? `${vinnere.length} spillere vinner!` : `${esc(navneliste(vinnere))} vinner!`}</h1>
              <p class="ingress">${esc(linje)}</p>
            </div>
            ${
              erfarne.length
                ? `<div class="papirboks sladre-tittel">
                    <span class="sladre-tittel-ikon" aria-hidden="true">😎</span>
                    <div><p class="etikett">Mest erfaren</p><p class="sladre-tittel-navn">${erfarne.length > 3 ? `${erfarne.length} spillere` : esc(navneliste(erfarne))}</p><p>${
                      sp.erfarne.length ? "Først ute. Her er det mange historier å hente!" : "Avslørt flest ganger. Her er det mange historier å hente!"
                    }</p></div>
                  </div>`
                : ""
            }
            ${
              topp && sp.topp.n > 1
                ? `<div class="papirboks sladre-topp">
                    <p class="etikett">Kortet som avslørte flest</p>
                    <p class="sladre-topp-tekst">${esc(D.prefiks)} ${esc(setning(topp.t))}</p>
                    <p>${sp.topp.n} av ${sp.topp.av} hadde gjort det.</p>
                  </div>`
                : ""
            }
            <section class="seksjon">
              <h2>Resultatliste</h2>
              <ol class="poengliste sladre-rang">${rader}</ol>
            </section>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
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
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        nyttSpill(S);
        R.holdVaken();
        R.gaTil("kort");
      },
      // Next card ("Bare kort") or skip this one ("Fem liv"). Also called by swiping the card.
      async neste(el, e, S) {
        if (opptatt || !pagar(S)) return;
        S.spill.angre = null;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
        siKort(S);
      },
      async "avslor-na"(el, e, S) {
        if (opptatt || !pagar(S) || S.spill.fase !== "les") return;
        S.spill.angre = null;
        opptatt = true;
        let ferdigTelt = false;
        try {
          ferdigTelt = await R.nedtelling(["3", "2", "1", "AVSLØR!"], 650);
        } finally {
          opptatt = false;
        }
        if (!ferdigTelt) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        S.spill.fase = "velg";
        S.spill.valgt = [];
        R.vis();
        R.si("Hvem har gjort det? Trykk på alle som rakte opp hånda.");
        const h = R.$("#skjerm-tittel");
        if (h) h.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "start" });
      },
      avslor(el, e, S) {
        if (opptatt) return;
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!inne(sp, i)) return;
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
          R.toast("Uskyldige, alle sammen!");
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
          R.toast("Alle ville røket ut samtidig – kortet teller ikke!");
          nyttKort(S);
          R.vis();
          window.scrollTo(0, 0);
          siKort(S);
          return;
        }
        sp.angre = {
          kort: sp.kort,
          nr: sp.nr,
          valgt: valgt.slice(),
          liv: sp.liv.slice(),
          avslort: sp.avslort.slice(),
          uteNr: sp.uteNr.slice(),
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
        if (!sp.topp || valgt.length > sp.topp.n) sp.topp = { k: sp.kort, n: valgt.length, av: igjenFor.length };
        if (blirUte.length) {
          if (!sp.erfarne.length) sp.erfarne = blirUte.slice();
          sp.sisteUte = blirUte;
          sp.slutt = igjenFor.length - blirUte.length <= 1;
          sp.fase = "ute";
          R.gaTil("ute");
          return;
        }
        R.toast(valgt.length === 1 ? `${R.navn(valgt[0])} mistet et liv` : `${valgt.length} mistet et liv`);
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
        siKort(S);
      },
      // Take back the last lost lives: the card comes back to «Hvem har gjort det?» with the same choice.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || opptatt) return;
        Object.assign(sp, { kort: a.kort, nr: a.nr, valgt: a.valgt, liv: a.liv, avslort: a.avslort, uteNr: a.uteNr, erfarne: a.erfarne, spilt: a.spilt, topp: a.topp });
        sp.sisteUte = [];
        sp.slutt = false;
        sp.fase = "velg";
        sp.angre = null;
        R.lyd.snu();
        R.toast("Angret – velg på nytt");
        R.gaTil("kort");
      },
      // From the knock-out screen: the next card, or the crowning when only one is left.
      videre(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (sp.slutt || levende(sp).length <= 1) {
          sp.fase = "ferdig";
          sp.angre = null;
          R.slippVaken();
          R.gaTil("slutt");
          return;
        }
        sp.sisteUte = [];
        nyttKort(S);
        R.gaTil("kort");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        const fortsatt = R.vakt();
        if (sp && sp.modus === "liv" && sp.spilt > 0) {
          const svar = await R.velgIArk("Avslutte spillet?", [
            { v: "kar", tekst: "Kår den uskyldigste nå" },
            { v: "slett", tekst: "Avslutt uten kåring" },
          ], "Den med flest liv igjen blir kåret.");
          if (!fortsatt()) return;
          if (svar === "kar") {
            sp.fase = "ferdig";
            sp.angre = null;
            R.slippVaken();
            R.gaTil("slutt");
          } else if (svar === "slett") {
            S.spill = null;
            R.slippVaken();
            R.gaTil("hjem");
          }
          return;
        }
        if ((await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Fortsett")) && fortsatt()) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },
      // Play again with the same mode as the game that just ended.
      igjen(el, e, S) {
        if (S.spill) S.oppsett.modus = S.spill.modus;
        H.start(el, e, S);
      },
    }),
  });
})();
