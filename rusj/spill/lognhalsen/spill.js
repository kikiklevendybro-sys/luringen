/* Løgnhalsen — «To sannheter og en løgn».
   The teller gets a theme, thinks of two true things and one lie, and either says them out loud
   or types them in secret (the app shuffles them into numbered cards). 3 · 2 · 1 – everyone
   shows 1, 2 or 3 fingers. The lie gets a big «LØGN!» stamp, everyone who guessed right gets a
   point, and the teller gets a point for each player fooled — and a nose that grows. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.temaer;
  const esc = R.esc;

  const TEMAER = D.temaer;
  const ALLE_TEMAER = TEMAER.map((t) => t.id);
  const tema = (id) => TEMAER.find((t) => t.id === id);
  const ALLE = [];
  TEMAER.forEach((t) => t.kort.forEach(([tekst, start]) => ALLE.push({ t: t.id, tekst, start })));
  const STOKK = R.kortstokk("temaer", ALLE.length);
  const MAKS = 100; // characters per typed claim
  // Which screen shows each phase of a turn. The private typing screen is never resumed
  // directly (after a reload or "Fortsett"): the phone is handed over again first.
  const SKJERM_FOR = { tema: "tur", gi: "gi", skriv: "gi", pek: "pek", velg: "avslor", klar: "avslor", hvem: "avslor", resultat: "resultat" };

  let H; // the actions, so one can call another
  let opptatt = false; // a countdown or reveal is running

  // ---------- Helpers ----------

  const tellerAv = (sp) => (sp.start + sp.k) % sp.antall;
  const totalt = (sp) => sp.runder * sp.antall;
  const rundeNr = (sp) => Math.floor(sp.k / sp.antall) + 1;
  const lyttere = (sp) => {
    const t = tellerAv(sp);
    return Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== t);
  };
  const navneliste = (indekser) => {
    const navn = indekser.map((i) => R.navn(i));
    return navn.length < 2 ? navn.join("") : navn.slice(0, -1).join(", ") + " og " + navn[navn.length - 1];
  };
  const ferdigSpilt = (sp) => sp.fase === "resultat" && sp.k + 1 >= totalt(sp);
  const tittel = (S) => (S.spill ? `Runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "Løgnhalsen");

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, 3, 20);
  }

  function trekkTema(sp) {
    const valgt = new Set(sp.temaer);
    sp.tema = STOKK.neste((i) => valgt.has(ALLE[i].t));
  }

  function nyTur(S) {
    const sp = S.spill;
    trekkTema(sp);
    sp.utkast = ["", "", ""];
    sp.kort = null;
    sp.logn = null;
    sp.riktige = [];
    sp.fase = sp.modus === "skriv" ? "gi" : "tema";
    R.gaTil(sp.modus === "skriv" ? "gi" : "tur");
  }

  // Progress dots for this round, in seat order: who has told already, who is telling now.
  function fremdrift(sp) {
    const forste = (rundeNr(sp) - 1) * sp.antall;
    const ferdige = [];
    for (let k = forste; k < sp.k; k++) ferdige.push((sp.start + k) % sp.antall);
    return R.ui.fremdrift(sp.antall, tellerAv(sp), ferdige);
  }

  function temaKort(sp) {
    const k = ALLE[sp.tema];
    const t = tema(k.t);
    return `<div class="lh-temakort">${R.ui.storkort({
      etikett: `${t.ikon} ${t.navn}`,
      tekst: k.tekst,
      fotHtml: `Begynn for eksempel sånn: <b>«${esc(k.start)}»</b>`,
      klasse: "lh-tema",
    })}</div>`;
  }

  // A small version of the theme for the typing screen (room for the keyboard).
  function temaBoks(sp) {
    const k = ALLE[sp.tema];
    const t = tema(k.t);
    return `<div class="lh-temaboks">
      <div class="lh-temaboks-tekst"><span class="etikett">${t.ikon} ${esc(t.navn)}</span><p>${esc(k.tekst)}</p></div>
      <button class="knapp-2 liten" data-h="nytt-tema" aria-label="Nytt tema"><span aria-hidden="true">🎲</span> Nytt</button>
    </div>`;
  }

  function temaSammendrag(S) {
    const valgt = S.oppsett.temaer;
    if (valgt.length === TEMAER.length) return "🎲 Alle temaer";
    return valgt.map((id) => `${tema(id).ikon} ${tema(id).navn}`).join(" · ");
  }

  function temaArk(S) {
    return `
      <h2 id="ark-tittel">Velg temaer</h2>
      <p class="ingress">Temaene gir fortelleren noe å snakke om. Velg så mange dere vil.</p>
      ${R.ui.brikker("temavalg", TEMAER.map((t) => ({ v: t.id, tekst: t.navn, ikon: t.ikon, antall: t.kort.length })), S.oppsett.temaer, { alle: true, etikett: "Temaer" })}
      <button class="knapp" data-h="lukk-ark">Ferdig</button>`;
  }

  // The three typed claims as numbered cards; after the reveal the lie gets the stamp.
  function pastanderHtml(sp, avslort) {
    return `<ol class="lh-pastander${avslort ? " avslort" : ""}">${sp.kort
      .map((tekst, i) => {
        const logn = avslort && i === sp.logn;
        const sant = avslort && i !== sp.logn;
        return `<li class="lh-pastand${logn ? " logn" : ""}${sant ? " sant" : ""}">
          <span class="lh-nr" aria-hidden="true">${i + 1}</span>
          <p><span class="vh">Nummer ${i + 1}${logn ? ", løgnen" : sant ? ", sant" : ""}: </span>${esc(tekst)}</p>
          ${logn ? `<span class="stempel lh-stempel" aria-hidden="true">Løgn!</span>` : ""}${sant ? `<span class="lh-sant" aria-hidden="true">Sant</span>` : ""}
        </li>`;
      })
      .join("")}</ol>`;
  }

  // "Si det høyt": three big numbers; after the reveal the lie gets the stamp.
  function tallHtml(sp) {
    return `<div class="lh-tall-rad avslort">${[0, 1, 2]
      .map((i) => {
        const logn = i === sp.logn;
        return `<div class="lh-tall${logn ? " logn" : " sant"}"><span class="lh-siffer" aria-hidden="true">${i + 1}</span>${
          logn ? `<span class="stempel lh-stempel">Løgn!</span>` : `<span class="lh-sant">Sant</span>`
        }<span class="vh">Nummer ${i + 1}: ${logn ? "løgnen" : "sant"}</span></div>`;
      })
      .join("")}</div>`;
  }

  // A player with a nose that grows with how many they fooled (andel 0–1).
  function neseHtml(i, andel, storrelse) {
    const lengde = andel > 0 ? 0.3 + andel * 0.7 : 0;
    return `<span class="lh-nesefjes ${storrelse || "gigant"}" style="--lengde: ${lengde.toFixed(2)}">${R.avatar(i, storrelse || "gigant")}${
      lengde ? `<span class="lh-nese" aria-hidden="true">${lengde >= 0.75 ? '<span class="lh-blad"></span>' : ""}</span>` : ""
    }</span>`;
  }

  function ferdigTekst(sp) {
    const n = sp.riktige.length;
    const alle = lyttere(sp).length;
    if (!n) return "Ferdig – ingen hadde rett";
    if (n === alle) return "Ferdig – alle hadde rett";
    return `Ferdig – ${n} hadde rett`;
  }

  function topp(liste, minst) {
    const verdier = liste.filter((v) => v != null);
    if (!verdier.length) return null;
    const mal = minst ? Math.min(...verdier) : Math.max(...verdier);
    if (!minst && mal <= 0) return null;
    const hvem = [];
    liste.forEach((v, i) => {
      if (v === mal) hvem.push(i);
    });
    return { verdi: mal, hvem };
  }

  function prisHtml(ikon, overskrift, vinner, tekst, farge) {
    return `<li class="lh-pris" style="--vf: ${farge}">
      <span class="lh-pris-ikon" aria-hidden="true">${ikon}</span>
      <span class="lh-pris-tekst"><span class="etikett">${esc(overskrift)}</span><b>${esc(vinner)}</b><span>${esc(tekst)}</span></span>
    </li>`;
  }

  // Enter in a claim field moves on to the next one (the last one closes the keyboard).
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (e.key !== "Enter" || e.shiftKey || !el || !el.matches || !el.matches(".lh-felt textarea")) return;
    e.preventDefault();
    const neste = document.getElementById(`lh-felt-${Number(el.dataset.i) + 1}`);
    if (neste) neste.focus();
    else el.blur();
  });

  // ---------- The game ----------

  R.start({
    id: "lognhalsen",
    versjon: 1,
    pagar: (S) => !!S.spill && S.skjerm !== "slutt" && !ferdigSpilt(S.spill),

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: { modus: "hoyt", runder: 2, temaer: ALLE_TEMAER.slice() },
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ modus: "hoyt", runder: 2, temaer: ALLE_TEMAER.slice() }, S.oppsett || {});
      if (!["hoyt", "skriv"].includes(S.oppsett.modus)) S.oppsett.modus = "hoyt";
      S.oppsett.runder = R.klamp(Number(S.oppsett.runder) || 2, 1, 5);
      S.oppsett.temaer = (Array.isArray(S.oppsett.temaer) ? S.oppsett.temaer : []).filter((id) => tema(id));
      if (!S.oppsett.temaer.length) S.oppsett.temaer = ALLE_TEMAER.slice();
      S.antall = R.klamp(Number(S.antall) || standardAntall(), 3, 20);
      const sp = S.spill;
      if (sp) {
        const lister = ["poeng", "lurt", "treff", "fortalt"].every((n) => Array.isArray(sp[n]) && sp[n].length === sp.antall);
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 3 && sp.antall <= 20 && ["hoyt", "skriv"].includes(sp.modus) &&
          Number.isInteger(sp.runder) && Number.isInteger(sp.k) && sp.k >= 0 && sp.k < sp.runder * sp.antall &&
          Number.isInteger(sp.start) && lister && !!ALLE[sp.tema] && Array.isArray(sp.temaer);
        if (!ok) S.spill = null;
        else {
          sp.temaer = sp.temaer.filter((id) => tema(id));
          if (!sp.temaer.length) sp.temaer = ALLE_TEMAER.slice();
          sp.riktige = (Array.isArray(sp.riktige) ? sp.riktige : []).filter((i) => Number.isInteger(i) && i >= 0 && i < sp.antall);
          const harKort = Array.isArray(sp.kort) && sp.kort.length === 3 && sp.logn >= 0 && sp.logn <= 2;
          // A typed round without its cards (or the private typing screen) goes back to the hand-over.
          if (sp.modus === "skriv" && ["pek", "klar", "hvem"].includes(sp.fase) && !harKort) sp.fase = "gi";
          if (sp.modus === "hoyt" && sp.fase === "hvem" && !(sp.logn >= 0 && sp.logn <= 2)) sp.fase = "velg";
          if (sp.fase === "resultat" && !sp.siste) sp.fase = sp.modus === "skriv" ? "gi" : "tema";
          if (!Array.isArray(sp.utkast) || sp.utkast.length !== 3) sp.utkast = ["", "", ""];
        }
      }
      // Keep the saved screen in step with the turn (the private typing screen itself is sent
      // back to the hand-over by its gjenoppta: "gi").
      if (["tur", "gi", "pek", "avslor", "resultat"].includes(S.skjerm)) S.skjerm = S.spill ? SKJERM_FOR[S.spill.fase] || "hjem" : "hjem";
      if (S.skjerm === "slutt" && !S.spill) S.skjerm = "hjem";
    },

    regler: {
      intro: "Fortell tre ting om deg selv. To er sanne, én er løgn. Klarer de andre å avsløre deg?",
      steg: [
        ["Få et tema", "Den som forteller, får et tema – for eksempel «Et sted du har sovet». Tenk ut to sanne ting og en løgn."],
        ["Si det – eller skriv det", "Si påstandene høyt som nummer 1, 2 og 3. Eller skriv dem i hemmelighet, så blander appen dem."],
        ["3 · 2 · 1 – pek!", "Alle viser 1, 2 eller 3 fingrer samtidig. Riktig svar gir 1 poeng. Fortelleren får 1 poeng for hver som ble lurt."],
      ],
      tips: [
        "Den beste løgnen er nesten sann. Den beste sannheten høres helt sprø ut.",
        "Liker du ikke temaet? Trykk «Nytt tema».",
        "Fortell gjerne historien bak de sanne påstandene etterpå – det er ofte det morsomste.",
        "Du trenger ikke fortelle noe du ikke vil. Hold det hyggelig.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Si tre ting om deg selv.<br>To er sanne. <em>Én er løgn.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: !!S.spill && !ferdigSpilt(S.spill),
              fortsettTekst: S.spill ? `Fortsett · runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–20", "spillere"],
              [String(ALLE.length), "kort"],
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
            <h2>Hvordan forteller dere?</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "hoyt", tittel: "Si det høyt", tekst: "Raskest. Fortelleren sier påstandene høyt.", ikon: "🗣️" },
                { v: "skriv", tittel: "Skriv inn", tekst: "I hemmelighet. Appen blander dem.", ikon: "✍️" },
              ],
              S.oppsett.modus,
            )}
          </section>
          ${R.ui.spillere({ min: 3, max: 20 })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Antall runder</h2><span class="tall">${S.oppsett.runder * S.antall} turer</span></div>
            ${R.ui.teller("runder", S.oppsett.runder, 1, 5, { enhet: S.oppsett.runder === 1 ? "runde" : "runder", minus: "Færre runder", pluss: "Flere runder" })}
            <p class="hjelp">Alle forteller én gang per runde.</p>
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Temaer</h2><span class="tall">${S.oppsett.temaer.length} av ${TEMAER.length}</span></div>
            <button class="knapp-2 lh-temaknapp" data-h="vis-temaer"><span class="lh-temaknapp-tekst">${esc(temaSammendrag(S))}</span><span class="lh-endre">Endre</span></button>
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start"))}`,
      },

      // "Si det høyt": the teller sees the theme, thinks, says the three claims out loud.
      tur: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          return `
            ${fremdrift(sp)}
            <div class="lh-teller">${R.avatar(t, "stor")}<div><p class="etikett">Nå forteller</p><h1 id="skjerm-tittel">${esc(R.navn(t))}</h1></div></div>
            ${temaKort(sp)}
            ${R.ui.lenkerad(R.ui.lenke("🎲 Nytt tema", "nytt-tema"))}
            <div class="lh-oppskrift" aria-hidden="true"><span>1</span><span>2</span><span>3</span></div>
            ${R.ui.dokk(
              `<p class="hjelp">Tenk ut to sanne ting og en løgn. Si dem høyt som nummer 1, 2 og 3.</p>`,
              R.ui.knapp("3 · 2 · 1 – Pek på løgnen!", "pek", { variant: "stor", id: "lh-pek" }),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "tur";
        },
      },

      // "Skriv inn": hand the phone to the teller.
      gi: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          return `${fremdrift(sp)}${R.ui.giTil({ i: t, h: "jeg-er", tekst: "Gi mobilen til", knapp: `Jeg er ${R.navn(t)}`, advarsel: "De andre ser bort mens du skriver" })}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
        },
      },

      skriv: {
        tittel: "Hemmelig",
        gjenoppta: "gi",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = ALLE[sp.tema];
          const felt = (i, merke, klasse) => `
            <label class="lh-felt ${klasse}" for="lh-felt-${i}">
              <span class="lh-merke">${merke}</span>
              <textarea id="lh-felt-${i}" data-felt="utkast" data-i="${i}" rows="2" maxlength="${MAKS}" placeholder="${esc(k.start)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="${i < 2 ? "next" : "done"}">${esc(sp.utkast[i])}</textarea>
            </label>`;
          return `
            <div class="lh-skriv-topp">
              <p class="etikett">🤫 Bare ${esc(R.navn(tellerAv(sp)))} ser dette</p>
              <h1 id="skjerm-tittel">To sannheter og en løgn</h1>
            </div>
            ${temaBoks(sp)}
            <div class="lh-felter">
              ${felt(0, "✅ Sant", "sant")}
              ${felt(1, "✅ Også sant", "sant")}
              ${felt(2, "🤥 Løgnen", "logn")}
            </div>
            <p class="hjelp">Appen blander rekkefølgen, så ingen ser hvilken som er løgnen.</p>
            ${R.ui.dokk(R.ui.knapp("Ferdig – bland og vis", "ferdig-skrevet", { id: "lh-ferdig", av: sp.utkast.some((t) => !String(t || "").trim()) }))}`;
        },
        inn(S) {
          S.spill.skjerm = "skriv";
        },
      },

      // "Skriv inn": the shuffled claims, for everyone.
      pek: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          return `
            <div class="lh-teller liten">${R.avatar(t, "mid")}<div><p class="etikett">${esc(R.navn(t))} forteller</p><p class="lh-tema-linje">${esc(ALLE[sp.tema].tekst)}</p></div></div>
            <h1 id="skjerm-tittel">Hvilken er løgnen?</h1>
            ${pastanderHtml(sp, false)}
            ${R.ui.dokk(
              `<p class="hjelp">Les dem høyt. Så teller dere ned, og alle viser 1, 2 eller 3 fingrer.</p>`,
              R.ui.knapp("3 · 2 · 1 – Pek på løgnen!", "pek", { variant: "stor", id: "lh-pek" }),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "pek";
        },
      },

      avslor: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = tellerAv(sp);
          if (sp.fase === "velg") {
            return `
              <div class="lh-teller">${R.avatar(t, "stor")}<div><p class="etikett">${esc(R.navn(t))}</p><h1 id="skjerm-tittel">Hvilken var løgnen?</h1></div></div>
              <p class="lh-fingre"><span aria-hidden="true">✋</span> Alle andre: hold fingrene oppe!</p>
              <div class="lh-figur">${R.figur()}</div>
              ${R.ui.dokk(
                `<p class="hjelp">${esc(R.navn(t))} trykker på nummeret til løgnen</p>`,
                `<div class="lh-tall-rad">${[0, 1, 2]
                  .map((i) => `<button class="lh-tall" data-h="velg-logn" data-v="${i}" aria-label="Løgnen var nummer ${i + 1}"><span class="lh-siffer">${i + 1}</span></button>`)
                  .join("")}</div>`,
              )}`;
          }
          if (sp.fase === "klar") {
            return `
              <div class="lh-teller liten">${R.avatar(t, "mid")}<div><p class="etikett">${esc(R.navn(t))} forteller</p><p class="lh-tema-linje">${esc(ALLE[sp.tema].tekst)}</p></div></div>
              <h1 id="skjerm-tittel">Fingrene opp!</h1>
              ${pastanderHtml(sp, false)}
              ${R.ui.dokk(R.ui.knapp("Vis løgnen!", "vis-logn", { variant: "stor", ikon: "🤥" }))}`;
          }
          return `
            ${sp.modus === "skriv" ? pastanderHtml(sp, true) : tallHtml(sp)}
            <section class="seksjon lh-hvem">
              <h1 id="skjerm-tittel">Hvem pekte på nr. ${sp.logn + 1}?</h1>
              <p class="hjelp">Trykk på alle som gjettet riktig.</p>
              ${R.ui.velgere("riktig", lyttere(sp), sp.riktige)}
            </section>
            ${R.ui.dokk(
              R.ui.knapp(ferdigTekst(sp), "ferdig", { id: "lh-ferdig-tur" }),
              sp.modus === "hoyt" ? R.ui.lenkerad(R.ui.lenke("Feil nummer? Velg på nytt", "angre-logn")) : "",
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "avslor";
        },
      },

      resultat: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.siste;
          const t = r.teller;
          const overskrift = r.lurt === 0 ? "Avslørt!" : r.lurt === r.av ? "Lurte alle sammen!" : `Lurte ${r.lurt} av ${r.av}!`;
          const deler = [];
          if (r.lurt) deler.push(`${R.navn(t)} får ${r.lurt} poeng`);
          if (r.riktige.length) deler.push(`${navneliste(r.riktige)} får 1 poeng${r.riktige.length > 1 ? " hver" : ""}`);
          const rader = Array.from({ length: sp.antall }, (_, i) => ({ i, poeng: sp.poeng[i], pluss: i === t ? r.lurt : r.riktige.includes(i) ? 1 : 0 }));
          const sist = sp.k + 1 >= totalt(sp);
          const neste = (sp.start + sp.k + 1) % sp.antall;
          return `
            <div class="lh-resultat${r.lurt === 0 ? " avslort" : ""}">
              ${neseHtml(t, r.av ? r.lurt / r.av : 0)}
              <p class="etikett">${esc(R.navn(t))}</p>
              <h1 id="skjerm-tittel">${esc(overskrift)}</h1>
              <p class="ingress">${esc(deler.join(". ") + ".")}</p>
            </div>
            ${R.ui.poengliste(rader)}
            ${R.ui.dokk(
              sist ? R.ui.knapp("Se kåringen!", "slutt", { ikon: "🏆" }) : R.ui.knapp(`Neste: ${R.navn(neste)}`, "neste"),
              R.ui.lenkerad(R.ui.lenke("Angre", "angre"), sist ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "resultat";
          const r = sp.siste;
          if (r.lurt === 0) R.lyd.latter();
          else if (r.lurt === r.av) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--rosa", "--lampe"]);
          } else R.lyd.riktig();
          if (r.lurt) setTimeout(() => R.lyd.tone(260, 0, 0.55, "triangle", 0.12, 780), 300);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = Array.from({ length: sp.antall }, (_, i) => ({ i, poeng: sp.poeng[i] }));
          const vinner = topp(sp.poeng);
          const mester = topp(sp.lurt);
          const detektiv = topp(sp.treff);
          // The most honest face: fooled the fewest, and at most half of the listeners.
          const fortalte = sp.lurt.map((v, i) => (sp.fortalt[i] && v <= (sp.fortalt[i] * (sp.antall - 1)) / 2 ? v : null));
          const aerlig = topp(fortalte, true);
          const priser = [];
          priser.push(
            mester
              ? prisHtml("🤥", "Mesterløgner", navneliste(mester.hvem), `Lurte ${mester.verdi} ${mester.verdi === 1 ? "person" : "personer"} til sammen. Se på den nesen!`, "var(--aksent)")
              : prisHtml("🤥", "Mesterløgner", "Ingen!", "Ingen klarte å lure noen. For en ærlig gjeng!", "var(--aksent)"),
          );
          priser.push(
            detektiv
              ? prisHtml("🔍", "Løgndetektor", navneliste(detektiv.hvem), `Avslørte ${detektiv.verdi} ${detektiv.verdi === 1 ? "løgn" : "løgner"}. Ingenting slipper unna!`, "var(--himmel)")
              : prisHtml("🔍", "Løgndetektor", "Ingen!", "Ingen gjettet riktig. Dere er altfor godtroende!", "var(--himmel)"),
          );
          if (aerlig && mester && !aerlig.hvem.some((i) => mester.hvem.includes(i))) {
            priser.push(
              prisHtml("😇", "Ærligste fjes", navneliste(aerlig.hvem), aerlig.verdi ? `Lurte bare ${aerlig.verdi}. Et ærlig fjes er gull verdt.` : "Lurte ingen. Et ærlig fjes er gull verdt.", "var(--mynte)"),
            );
          }
          return `
            <div class="banner aksent">
              ${R.figur()}
              <h1 id="skjerm-tittel">${vinner ? `${esc(navneliste(vinner.hvem))} vinner!` : "Ingen poeng ennå"}</h1>
              <p class="ingress">${vinner ? `${vinner.verdi} poeng etter ${sp.k + 1} ${sp.k === 0 ? "tur" : "turer"}` : "Spill noen turer først – så blir det kåring!"}</p>
            </div>
            ${vinner ? R.ui.pall(rader) : ""}
            <ul class="lh-priser">${priser.join("")}</ul>
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          S.spill.skjerm = "slutt";
          if (topp(S.spill.poeng)) {
            R.lyd.fanfare();
            R.konfetti();
          }
        },
      },
    },

    felt: {
      utkast(S, el) {
        const sp = S.spill;
        if (!sp) return;
        sp.utkast[Number(el.dataset.i)] = el.value.slice(0, MAKS);
        const knapp = R.$("#lh-ferdig");
        if (knapp) knapp.disabled = sp.utkast.some((t) => !String(t || "").trim());
        R.lagre();
      },
    },

    handlinger: (H = {
      // A running game is never thrown away without asking.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!S.spill && !ferdigSpilt(S.spill))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        const sp = S.spill;
        R.gaTil(ferdigSpilt(sp) ? "slutt" : SKJERM_FOR[sp.fase] || "hjem");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "skriv" ? "skriv" : "hoyt";
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = R.klamp(S.oppsett.runder + Number(el.dataset.v), 1, 5);
        R.vis();
      },
      "vis-temaer": (el, e, S) => R.ark(temaArk(S)),
      temavalg(el, e, S) {
        const v = el.dataset.v;
        if (v === "*") S.oppsett.temaer = ALLE_TEMAER.slice();
        else if (S.oppsett.temaer.includes(v)) {
          if (S.oppsett.temaer.length === 1) return R.toast("Velg minst ett tema");
          S.oppsett.temaer = S.oppsett.temaer.filter((x) => x !== v);
        } else S.oppsett.temaer = [...S.oppsett.temaer, v];
        // Update the open sheet in place (keeping focus on the chip), then the screen behind it.
        const ark = R.$("#ark-innhold");
        if (ark && R.arkApent()) {
          ark.innerHTML = temaArk(S);
          const igjen = R.$(`#ark-innhold [data-h="temavalg"][data-v="${CSS.escape(v)}"]`);
          if (igjen) igjen.focus({ preventScroll: true });
        }
        R.vis();
      },
      start(el, e, S) {
        const n = R.klamp(S.antall, 3, 20);
        S.spill = {
          antall: n,
          modus: S.oppsett.modus,
          runder: S.oppsett.runder,
          temaer: S.oppsett.temaer.slice(),
          start: R.heltall(0, n - 1),
          k: 0,
          fase: "tema",
          skjerm: null,
          tema: 0,
          utkast: ["", "", ""],
          kort: null,
          logn: null,
          riktige: [],
          siste: null,
          poeng: Array(n).fill(0),
          lurt: Array(n).fill(0),
          treff: Array(n).fill(0),
          fortalt: Array(n).fill(0),
        };
        nyTur(S);
      },
      "nytt-tema"(el, e, S) {
        trekkTema(S.spill);
        R.lyd.snu();
        R.vis();
      },
      "jeg-er"(el, e, S) {
        S.spill.fase = "skriv";
        R.gaTil("skriv");
      },
      "ferdig-skrevet"(el, e, S) {
        const sp = S.spill;
        const tekster = sp.utkast.map((t) => String(t || "").trim().replace(/\s+/g, " "));
        if (tekster.some((t) => !t)) return R.toast("Skriv alle tre påstandene først");
        if (new Set(tekster.map((t) => R.normaliser(t))).size < 3) return R.toast("To av påstandene er like");
        const rekkefolge = R.stokk([0, 1, 2], R.rng(R.nyttFro()));
        sp.kort = rekkefolge.map((i) => tekster[i]);
        sp.logn = rekkefolge.indexOf(2);
        sp.utkast = ["", "", ""];
        sp.fase = "pek";
        R.lyd.sveip();
        R.gaTil("pek");
      },
      async pek(el, e, S) {
        if (opptatt) return;
        opptatt = true;
        el.disabled = true;
        const ferdig = await R.nedtelling(["3", "2", "1", "PEK!"], 750);
        opptatt = false;
        if (!ferdig || !S.spill) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        S.spill.fase = S.spill.modus === "skriv" ? "klar" : "velg";
        R.gaTil("avslor");
      },
      "velg-logn"(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "velg") return;
        sp.logn = R.klamp(Number(el.dataset.v), 0, 2);
        sp.riktige = [];
        sp.fase = "hvem";
        R.vis();
        R.lyd.bom();
        R.vibrer([80, 40, 140]);
        R.si(`Løgnen var nummer ${sp.logn + 1}.`);
        window.scrollTo(0, 0);
      },
      async "vis-logn"(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "klar" || opptatt) return;
        opptatt = true;
        el.disabled = true;
        R.lyd.trommevirvel(1.3);
        const fortsatt = R.vakt();
        await R.vent(R.rolig() ? 300 : 1300);
        opptatt = false;
        if (!fortsatt()) return;
        sp.riktige = [];
        sp.fase = "hvem";
        R.vis();
        R.vibrer([80, 40, 140]);
        R.si(`Løgnen var nummer ${sp.logn + 1}: ${sp.kort[sp.logn]}`);
        window.scrollTo(0, 0);
      },
      "angre-logn"(el, e, S) {
        const sp = S.spill;
        sp.logn = null;
        sp.riktige = [];
        sp.fase = "velg";
        R.vis();
      },
      riktig(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        sp.riktige = sp.riktige.includes(i) ? sp.riktige.filter((x) => x !== i) : [...sp.riktige, i];
        el.setAttribute("aria-pressed", String(sp.riktige.includes(i)));
        const knapp = R.$("#lh-ferdig-tur");
        if (knapp) knapp.textContent = ferdigTekst(sp);
        R.lagre();
      },
      ferdig(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "hvem") return;
        const t = tellerAv(sp);
        const kandidater = lyttere(sp);
        const riktige = sp.riktige.filter((i) => kandidater.includes(i)).sort((a, b) => a - b);
        riktige.forEach((i) => {
          sp.poeng[i] += 1;
          sp.treff[i] += 1;
        });
        const lurt = kandidater.length - riktige.length;
        sp.poeng[t] += lurt;
        sp.lurt[t] += lurt;
        sp.fortalt[t] += 1;
        sp.siste = { teller: t, lurt, riktige, av: kandidater.length };
        sp.fase = "resultat";
        R.gaTil("resultat");
      },
      // Take back the points of the last turn and go back to «who guessed right?».
      angre(el, e, S) {
        const sp = S.spill;
        const r = sp.siste;
        if (!r || sp.fase !== "resultat") return;
        r.riktige.forEach((i) => {
          sp.poeng[i] -= 1;
          sp.treff[i] -= 1;
        });
        sp.poeng[r.teller] -= r.lurt;
        sp.lurt[r.teller] -= r.lurt;
        sp.fortalt[r.teller] -= 1;
        sp.riktige = r.riktige.slice();
        sp.siste = null;
        sp.fase = "hvem";
        R.toast("Angret – poengene er tatt bort");
        R.gaTil("avslor");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (sp.k + 1 >= totalt(sp)) return R.gaTil("slutt");
        sp.k += 1;
        nyTur(S);
      },
      slutt: () => R.gaTil("slutt"),
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", "Dere får se kåringen med stillingen så langt.", "Avslutt", "Spill videre");
        if (ja && fortsatt()) R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
