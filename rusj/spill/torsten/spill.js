/* Tørsten — «Jeg har aldri – drikkeversjon» (18+).
   A card says "Jeg har aldri …". The reader (a new one every card) reads it out loud, the phone
   counts down, and on «SKÅL!» everyone who HAS done it raises the glass and takes a small sip –
   together. With the «Drikk eller fortell» twist, some cards let those who have done it tell the
   story instead of drinking. Stars mark the cards that gave the best stories, and at the end the
   group crowns the evening's best storyteller (a vote, never a drinking score).
   Responsible by design: small sips only, alcohol-free counts the same, everyone may pass, and a
   water card comes every ten cards. All statements are new (none shared with Sladrehanken). */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;

  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const ALLE = [];
  PAKKER.forEach((p) => p.kort.forEach((t) => ALLE.push({ p: p.id, t })));
  const stokk = R.kortstokk("kort", ALLE.length);
  const VANN_HVERT = 10; // a water card after every tenth card
  const VRI_ANDEL = 0.3; // with the twist on, about every third card is «Drikk eller fortell»

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const setning = (t) => (/[.!?…]$/.test(t) ? t : t + ".");
  const storrelse = (t) => (t.length > 62 ? "torst-lang" : t.length > 34 ? "torst-mid" : "torst-kort");
  const nesteLeser = (sp) => (sp.leser + 1) % sp.antall;

  let H; // the actions, so one action can reuse another
  let opptatt = false; // the countdown is running: ignore double taps on the card's buttons

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, 3, 20);
  }

  // Two glasses that clink (drawn for the dark background: light outlines, bright drinks).
  const GLASS =
    '<svg class="torst-glass" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
    '<g class="torst-glass-v"><path d="M10 14 L26 14 L24 40 Q23.5 44 20 44 L16 44 Q12.5 44 12 40 Z" fill="rgba(255,241,221,.12)" stroke="var(--papir)" stroke-width="2.6" stroke-linejoin="round"/><path d="M11.3 22 L24.7 22 L23.4 39.5 Q23 42 20 42 L16 42 Q13 42 12.6 39.5 Z" fill="var(--lampe)"/><path d="M14 25 V36" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/><path d="M18 44 V54 M12 55 H24" stroke="var(--papir)" stroke-width="2.6" stroke-linecap="round"/></g>' +
    '<g class="torst-glass-h"><path d="M38 14 L54 14 L52 40 Q51.5 44 48 44 L44 44 Q40.5 44 40 40 Z" fill="rgba(255,241,221,.12)" stroke="var(--papir)" stroke-width="2.6" stroke-linejoin="round"/><path d="M39.3 22 L52.7 22 L51.4 39.5 Q51 42 48 42 L44 42 Q41 42 40.6 39.5 Z" fill="var(--himmel)"/><path d="M42 25 V36" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/><path d="M46 44 V54 M40 55 H52" stroke="var(--papir)" stroke-width="2.6" stroke-linecap="round"/></g>' +
    '<g class="torst-glimt" stroke="var(--lampe)" stroke-width="3" stroke-linecap="round"><path d="M32 3 V8"/><path d="M24 6 L27 10"/><path d="M40 6 L37 10"/></g>' +
    "</svg>";

  // A glass clinking: two bright tones that ring out.
  function klirr() {
    R.lyd.tone(2637, 0, 0.32, "sine", 0.12);
    R.lyd.tone(3520, 0.015, 0.4, "sine", 0.07);
    R.lyd.tone(1760, 0.03, 0.25, "triangle", 0.05);
  }

  // ---------- Cards ----------

  function nyttKort(S) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    sp.kort = i;
    sp.nr += 1;
    sp.fase = "les";
    sp.vriKort = sp.vri && Math.random() < VRI_ANDEL;
  }

  // Next card for the next reader, or a water card first.
  function videre(S) {
    const sp = S.spill;
    sp.leser = nesteLeser(sp);
    if (sp.nr - sp.sisteVann >= VANN_HVERT) {
      sp.sisteVann = sp.nr;
      sp.vann += 1;
      sp.fase = "vann";
      R.gaTil("vann");
      return;
    }
    nyttKort(S);
    R.gaTil("kort");
  }

  const siKort = (S) => R.si(`${R.navn(S.spill.leser)} leser. ${D.prefiks.replace(" …", "")} ${setning(ALLE[S.spill.kort].t)}`);

  function kortHtml(S) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    const skal = sp.fase === "skal";
    const fav = sp.fav.includes(sp.kort);
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: `#${sp.nr}`,
      tekstHtml: `<span class="prefiks">${esc(D.prefiks)}</span>${esc(setning(k.t))}`,
      klasse: `torst ${storrelse(k.t)}${sp.vriKort ? " vri" : ""}`,
      sveip: skal ? null : "hopp",
      kompakt: skal,
      id: "torst-kort",
      fotHtml: `<span class="torst-fot">${
        sp.vriKort ? `<span class="torst-vri-merke"><span aria-hidden="true">🗣️</span> Drikk eller fortell</span>` : `<span></span>`
      }<button class="torst-stjerne" data-h="favoritt" aria-pressed="${fav}" aria-label="${fav ? "Fjern fra favoritter" : "Merk som favoritt"}"><span aria-hidden="true">${fav ? "★" : "☆"}</span></button></span>`,
    });
  }

  // ---------- The game ----------

  R.start({
    id: "torsten",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: { pakker: PAKKER.map((p) => p.id), vri: true },
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), 3, 20);
      const o = (S.oppsett = Object.assign({ pakker: [], vri: true }, S.oppsett || {}));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = PAKKER.map((p) => p.id);
      o.vri = o.vri !== false;
      const sp = S.spill;
      if (sp) {
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 3 && sp.antall <= 20 &&
          Number.isInteger(sp.leser) && sp.leser >= 0 && sp.leser < sp.antall &&
          Array.isArray(sp.pakker) && sp.pakker.some((id) => pakke(id)) &&
          ["les", "skal", "vann", "stem"].includes(sp.fase) &&
          Array.isArray(sp.fav) &&
          (sp.fase === "vann" || sp.fase === "stem" || !!ALLE[sp.kort]);
        if (!ok) S.spill = null;
        else {
          sp.pakker = sp.pakker.filter((id) => pakke(id));
          sp.fav = sp.fav.filter((i) => Number.isInteger(i) && !!ALLE[i]);
          if (!(sp.vinner == null || (Number.isInteger(sp.vinner) && sp.vinner >= -1 && sp.vinner < sp.antall))) sp.vinner = null;
          if (sp.ferdig && sp.vinner == null) sp.vinner = -1;
          if (sp.fase === "stem" && !["les", "skal", "vann"].includes(sp.forStem)) sp.forStem = "les";
        }
      }
      const fase = S.spill && S.spill.fase;
      if (["kort", "vann", "stem"].includes(S.skjerm)) S.skjerm = pagar(S) ? (fase === "les" || fase === "skal" ? "kort" : fase) : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Hvert kort begynner med «Jeg har aldri …». Har du gjort det likevel, tar du en liten slurk – samtidig med alle andre som har gjort det.",
      steg: [
        ["Les kortet høyt", "Mobilen viser hvem som leser. Les hele kortet: «Jeg har aldri …»"],
        ["Tell ned og skål", "Trykk på knappen. På «SKÅL!» løfter alle som HAR gjort det glasset og tar en liten slurk."],
        ["Drikk eller fortell", "Med vrien på kan dere på noen kort fortelle historien i stedet for å drikke. Til slutt kårer dere kveldens beste historie."],
      ],
      tips: [
        "Alkoholfritt teller like mye, og alle kan stå over – uten å forklare seg.",
        "Hvert tiende kort er et vannkort. Da tar alle en slurk vann.",
        "Du forteller bare så mye du vil.",
        "Trykk på stjerna på kort som ga en god historie. De dukker opp på kåringen.",
        "Sveip kortet til siden for å hoppe over det.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "«Jeg har aldri …»<br><em>Har du gjort det, løfter du glasset.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · kort ${Math.max(1, S.spill.nr)}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–20", "spillere"],
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
              <div class="seksjon-hode"><h2>Velg pakker</h2><span class="tall">${antallKort} kort</span></div>
              ${R.ui.fliser(
                "pakke",
                PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
                o.pakker,
              )}
            </section>
            ${R.ui.bryter("vri", o.vri, "Drikk eller fortell", "På noen kort kan dere fortelle historien i stedet for å ta en slurk.")}
            ${R.ui.spillere({ min: 3, max: 20, hjelp: "Dere bytter på å lese kortene høyt." })}
            <div class="papirboks torst-vett">
              <p class="etikett">Slik er slurkene</p>
              <ul class="tips">
                <li>En slurk er en liten slurk – aldri mer.</li>
                <li>Alkoholfritt teller like mye, og alle kan stå over.</li>
                <li>Hvert tiende kort er et vannkort.</li>
              </ul>
            </div>
            ${R.ui.dokk(o.pakker.length ? "" : `<p class="hjelp">Velg minst én pakke.</p>`, R.ui.knapp("Start", "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel: (S) => `Kort ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const skal = sp.fase === "skal";
          const neste = nesteLeser(sp);
          const tittel = `<h1 class="vh" id="skjerm-tittel">Kort ${sp.nr}: ${esc(D.prefiks)} ${esc(setning(ALLE[sp.kort].t))}</h1>`;
          const leser = `<div class="torst-leser">
              ${R.avatar(sp.leser)}
              <p><b>${esc(R.navn(sp.leser))}</b> leser</p>
            </div>`;
          if (!skal) {
            return `
              ${tittel}
              ${leser}
              ${kortHtml(S)}
              <p class="torst-hint"><span aria-hidden="true">✋</span> Har du gjort det? Løft glasset på «SKÅL!»</p>
              <p class="torst-fot-linje"><span aria-hidden="true">🥤</span> Alkoholfritt teller like mye · alle kan stå over</p>
              ${R.ui.dokk(
                R.ui.knapp("3 · 2 · 1 – Skål!", "skal", { variant: "stor", ikon: "🥂" }),
                R.ui.lenkerad(R.ui.lenke("Hopp over", "hopp"), R.ui.lenke("Avslutt", "avslutt")),
              )}`;
          }
          return `
            ${tittel}
            ${leser}
            ${kortHtml(S)}
            <div class="torst-feiring" aria-hidden="true">${GLASS}<span class="stempel aksent">Skål!</span></div>
            <p class="torst-etter${sp.vriKort ? " vri" : ""}">${
              sp.vriKort
                ? "Har du gjort det? <b>Drikk – eller fortell historien!</b>"
                : "Har du gjort det? <b>Ta en liten slurk.</b>"
            }</p>
            <p class="torst-fot-linje"><span aria-hidden="true">🥤</span> Alkoholfritt teller like mye · alle kan stå over</p>
            ${R.ui.dokk(
              `<p class="torst-neste-linje">${R.avatar(neste)}<span><b>${esc(R.navn(neste))}</b> leser neste</span></p>`,
              R.ui.knapp("Neste kort", "neste"),
              R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      vann: {
        tittel: "Vannkort",
        tilbake: "hjem",
        vis: (S) => `
          <div class="torst-vann">
            <svg class="torst-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
              <defs><clipPath id="torst-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
              <g clip-path="url(#torst-glass-innside)">
                <path class="torst-vannflate" d="M0 70 Q15 62 30 70 T60 70 T90 70 T120 70 T150 70 V160 H0 Z" fill="var(--himmel)"/>
                <circle class="torst-boble" cx="50" cy="120" r="4" fill="#fff" opacity=".7"/>
                <circle class="torst-boble to" cx="70" cy="128" r="3" fill="#fff" opacity=".6"/>
              </g>
              <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
              <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
            </svg>
            <p class="etikett">Vannkort · etter ${S.spill.nr} kort</p>
            <h1 id="skjerm-tittel">Alle tar en slurk vann!</h1>
            <p class="ingress">Skål i vann – kroppen takker, og kvelden varer lenger.</p>
          </div>
          ${R.ui.dokk(R.ui.knapp("Skål i vann!", "vann-ferdig", { variant: "himmel", ikon: "💧" }), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`,
        inn() {
          R.lyd.pop();
          R.vibrer(20);
        },
      },

      stem: {
        tittel: "Kåringen",
        // Back from the vote: the game goes on where it was.
        tilbake: (S) => {
          const sp = S.spill;
          if (!sp) return "hjem";
          sp.fase = ["les", "skal", "vann"].includes(sp.forStem) && (sp.forStem === "vann" || ALLE[sp.kort]) ? sp.forStem : "les";
          if (sp.fase === "les" && !ALLE[sp.kort]) nyttKort(S);
          return sp.fase === "vann" ? "vann" : "kort";
        },
        vis: (S) => `
          <div class="torst-stem-topp">
            <span class="torst-stem-ikon" aria-hidden="true">🎤</span>
            <h1 id="skjerm-tittel">Hvem fortalte kveldens beste historie?</h1>
            <p class="ingress">Tell til tre og pek samtidig. Trykk på den som fikk flest fingrer.</p>
          </div>
          ${R.ui.velgere("kaar", Array.from({ length: S.spill.antall }, (_, i) => i), null)}
          ${R.ui.dokk(R.ui.knapp2("Ingen kåring – bare skål", "kaar", { v: "-1" }))}`,
        inn() {
          R.lyd.trommevirvel(1.2);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.vinner;
          const fav = sp.fav.filter((i) => ALLE[i]);
          const pakkeNavn = sp.pakker.length === PAKKER.length ? "alle pakkene" : R.ramsOpp(sp.pakker.map((id) => pakke(id).navn));
          return `
            <div class="banner aksent torst-banner">
              ${
                v != null && v >= 0
                  ? `<div class="torst-vinner">${R.avatar(v, "gigant")}<span class="torst-mikrofon" aria-hidden="true">🎤</span></div>
                     <p class="etikett">Kveldens beste historie</p>
                     <h1 id="skjerm-tittel">${esc(R.navn(v))} vinner!</h1>`
                  : `${R.figur()}<p class="etikett">Takk for i kveld</p><h1 id="skjerm-tittel">Skål for gjengen!</h1>`
              }
              <p class="ingress">${esc(R.flertall(sp.nr, "kort", "kort"))} fra ${esc(pakkeNavn)}.${sp.vann ? ` ${esc(R.flertall(sp.vann, "vannkort", "vannkort"))} underveis.` : ""}</p>
            </div>
            ${
              fav.length
                ? `<div class="papirboks torst-favoritter">
                    <p class="etikett">★ Kveldens favorittkort</p>
                    <ul>${fav.map((i) => `<li>${esc(D.prefiks.replace(" …", ""))} ${esc(setning(ALLE[i].t))}</li>`).join("")}</ul>
                  </div>`
                : ""
            }
            <p class="hjelp">💧 Husk vann, mat og trygg vei hjem.</p>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          if (S.spill.vinner != null && S.spill.vinner >= 0) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--lampe", "--rosa", "--mynte", "--himmel"]);
          } else {
            klirr();
          }
          R.slippVaken();
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
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        const f = S.spill.fase;
        R.gaTil(f === "vann" ? "vann" : f === "stem" ? "stem" : "kort");
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      vri(el, e, S) {
        S.oppsett.vri = !S.oppsett.vri;
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        const antall = R.klamp(S.antall || 4, 3, 20);
        S.spill = {
          antall,
          pakker: S.oppsett.pakker.slice(),
          vri: !!S.oppsett.vri,
          leser: R.heltall(0, antall - 1),
          nr: 0,
          kort: null,
          fase: "les",
          vriKort: false,
          fav: [],
          vann: 0,
          sisteVann: 0,
          vinner: null,
          ferdig: false,
        };
        nyttKort(S);
        R.statistikk("start", { spillere: antall, pakker: S.spill.pakker.length, vri: S.spill.vri });
        R.gaTil("kort");
      },
      // The countdown: on «SKÅL!» everyone who has done it raises the glass.
      async skal(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.fase !== "les") return;
        opptatt = true;
        let ferdig = false;
        try {
          ferdig = await R.nedtelling(["3", "2", "1", "SKÅL!"], 650);
        } finally {
          opptatt = false;
        }
        if (!ferdig || S.spill !== sp || sp.fase !== "les") return;
        sp.fase = "skal";
        klirr();
        R.vibrer([40, 30, 90]);
        R.vis();
        R.si(sp.vriKort ? "Skål! Har du gjort det: drikk – eller fortell historien." : "Skål! Har du gjort det, tar du en liten slurk.");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "skal") return;
        videre(S);
      },
      // Skip the card (link or swipe): same reader, new card.
      async hopp(el, e, S) {
        const sp = S.spill;
        if (opptatt || !pagar(S) || sp.fase !== "les") return;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt() || S.spill !== sp) return;
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
        siKort(S);
      },
      favoritt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.kort == null) return;
        const pa = sp.fav.includes(sp.kort);
        sp.fav = pa ? sp.fav.filter((i) => i !== sp.kort) : [...sp.fav, sp.kort];
        if (pa) R.lyd.klikk();
        else {
          R.lyd.pling();
          R.vibrer(15);
        }
        R.vis();
        R.toast(pa ? "Fjernet fra favoritter" : "★ Lagt til i favoritter");
      },
      "vann-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "vann") return;
        nyttKort(S);
        R.gaTil("kort");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        if (sp.nr <= 1 && sp.fase === "les") {
          if ((await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Spill videre")) && fortsatt()) {
            S.spill = null;
            R.gaTil("hjem");
          }
          return;
        }
        const ja = await R.bekreft("Avslutte runden?", sp.vri ? "Til slutt kårer dere kveldens beste historie." : "Dere går rett til kåringen.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || S.spill !== sp) return;
        // Without «Drikk eller fortell» nobody has told stories: no vote, straight to the toast.
        if (!sp.vri) {
          sp.vinner = -1;
          sp.ferdig = true;
          R.statistikk("ferdig", { kort: sp.nr, kaaret: false, favoritter: sp.fav.length });
          R.gaTil("slutt");
          return;
        }
        sp.forStem = sp.fase;
        sp.fase = "stem";
        R.gaTil("stem");
      },
      kaar(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "stem") return;
        const v = Number(el.dataset.v);
        sp.vinner = Number.isInteger(v) && v >= 0 && v < sp.antall ? v : -1;
        sp.ferdig = true;
        R.statistikk("ferdig", { kort: sp.nr, kaaret: sp.vinner >= 0, favoritter: sp.fav.length });
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
