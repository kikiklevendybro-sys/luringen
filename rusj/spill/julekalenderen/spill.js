/* Julekalenderen — an Advent calendar with 24 doors, one opening each day 1–24 December (Oslo date,
   R.dag()). Behind each door: a riddle, a quiz question, «Gjett julesangen», a word puzzle, a
   challenge in another rusj game or a cosy idea for the family — and a sticker. Opened doors and
   stickers are kept per season; today's finished door is reported to the front page's «I dag». */
(function () {
  "use strict";
  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const LUKER = D.luker;
  const DEL_URL = "https://rusj.no/julekalenderen/";
  // The fixed, shuffled order of the doors on the calendar (door 24 is the big one).
  const REKKEFOLGE = [9, 17, 3, 21, 12, 6, 1, 14, 23, 19, 11, 24, 4, 7, 15, 8, 20, 2, 13, 18, 5, 22, 10, 16];
  const TYPENAVN = { quiz: "Julequiz", nott: "Julenøtt", sang: "Gjett julesangen", ord: "Ordgåte", utfordring: "Dagens utfordring", kos: "Julekos" };
  let H;
  let apner = false; // a door is swinging open (short animation before its screen)

  // ---------- Dates ----------

  // Where we are in the season: «for» (before 1 December), «aktiv» (1–24 December) or «etter»
  // (25 December – 31 January: every door open). The season is the year of its December.
  function fase() {
    const { tekst, nr } = R.dag();
    const [a, m, d] = tekst.split("-").map(Number);
    if (m === 12 && d <= 24) return { fase: "aktiv", dag: d, sesong: a, nr };
    if (m === 12) return { fase: "etter", dag: 24, sesong: a, nr };
    if (m === 1) return { fase: "etter", dag: 24, sesong: a - 1, nr };
    return { fase: "for", dag: 0, sesong: a, nr, igjen: Math.floor(Date.UTC(a, 11, 1) / 86400000) - nr };
  }
  const kanApnes = (d, f = fase()) => f.fase !== "for" && d >= 1 && d <= f.dag;

  // ---------- State helpers ----------

  const antallApnet = (S) => Object.keys(S.luker).length;
  const erFerdig = (S, d) => !!(S.luker[d] && S.luker[d].ferdig);
  // Days in a row up to today with a finished door.
  function rekke(S, dag) {
    let n = 0;
    for (let d = dag; d >= 1 && erFerdig(S, d); d--) n++;
    return n;
  }
  function meldFerdig(S) {
    const f = fase();
    if (f.fase === "aktiv" && erFerdig(S, f.dag)) R.dagligFerdig({ vunnet: true, rekke: rekke(S, f.dag), res: `Luke ${f.dag}` });
  }
  // Marks a door's task as done (once) and reports today's door.
  function ferdig(S, d) {
    const l = S.luker[d];
    if (!l || l.ferdig) return;
    l.ferdig = true;
    R.statistikk("ferdig", { luke: d });
    meldFerdig(S);
  }
  const autoFerdig = (L) => L.type === "kos" || L.type === "utfordring";

  // ---------- Pieces of HTML ----------

  const merkeHtml = (d, klasse = "") => {
    const L = LUKER[d - 1];
    return `<span class="jk-merke ${klasse}" role="img" aria-label="Klistremerke: ${R.esc(L.merkeNavn)}"><span aria-hidden="true">${R.esc(L.merke)}</span></span>`;
  };

  function dorHtml(S, d, f) {
    const apen = !!S.luker[d];
    const kan = kanApnes(d, f);
    const idag = f.fase === "aktiv" && d === f.dag;
    const klasse = ["jk-luke", d === 24 ? "jk-stor" : "", apen ? "jk-apen" : kan ? "jk-klar" : "jk-last", idag ? "jk-idag" : ""].join(" ");
    const navn = `Luke ${d}, ${apen ? "åpnet" : kan ? (idag ? "dagens luke" : "klar til å åpnes") : "låst"}`;
    const inni = apen ? `<span class="jk-hull" aria-hidden="true">${R.esc(LUKER[d - 1].merke)}</span>` : "";
    return `<button class="${klasse}" data-h="luke" data-v="${d}" aria-label="${navn}">${inni}<span class="jk-dor" aria-hidden="true"><span class="jk-nr">${d}</span></span></button>`;
  }

  function statusHtml(S, f) {
    if (f.fase === "for")
      return `<p class="jk-status"><b>Kalenderen åpner 1. desember</b><span>${f.igjen === 1 ? "I morgen!" : `Om ${f.igjen} dager`}</span></p>`;
    if (f.fase === "etter") return `<p class="jk-status"><b>God jul!</b><span>Alle lukene er åpne.</span></p>`;
    const apen = !!S.luker[f.dag];
    return `<p class="jk-status"><b>${f.dag === 24 ? "Julaften!" : `${f.dag}. desember`}</b><span>${apen ? (f.dag === 24 ? "God jul!" : "Ny luke i morgen") : `Luke ${f.dag} er klar!`}</span></p>`;
  }

  // ---------- Opening a door ----------

  const vent = (ms) => new Promise((ok) => setTimeout(ok, ms));
  async function apne(S, d, el) {
    const f = fase();
    if (!kanApnes(d, f)) {
      if (el) {
        el.classList.remove("risting");
        void el.offsetWidth;
        el.classList.add("risting");
      }
      R.toast(`Luke ${d} åpner ${d}. desember`);
      return;
    }
    if (S.luker[d]) {
      S.aktiv = d;
      return R.gaTil("luke");
    }
    if (apner) return;
    const L = LUKER[d - 1];
    S.luker[d] = { ferdig: false };
    S.aktiv = d;
    S.nytt = d;
    R.statistikk("start", { luke: d });
    if (d === 1 || d === 12 || d === 24) R.merke("luke-" + d);
    if (d === 24 || antallApnet(S) === 24) R.lyd.fanfare();
    else R.lyd.pling();
    R.vibrer(15);
    if (el && !R.rolig()) {
      apner = true;
      const fortsatt = R.vakt();
      el.classList.add("jk-apner");
      await vent(620);
      apner = false;
      if (!fortsatt()) return;
    }
    if (autoFerdig(L)) ferdig(S, d);
    R.gaTil("luke");
    if (d === 24 || antallApnet(S) === 24) R.konfetti();
  }

  // ---------- Word puzzle ----------

  const bokstaver = (ord) => Array.from(ord);
  // The letters in a fixed, shuffled order per door (never the answer itself).
  function stokket(d) {
    const ord = LUKER[d - 1].ord;
    const rng = R.rng(1000 + d);
    let b = bokstaver(ord);
    for (let i = 0; i < 20; i++) {
      b = R.stokk(bokstaver(ord), rng);
      if (b.join("") !== ord) break;
    }
    return b;
  }

  function ordHtml(S, d, L) {
    const l = S.luker[d];
    const b = stokket(d);
    const valgt = Array.isArray(l.valgt) ? l.valgt : [];
    const losning = bokstaver(L.ord);
    const ruter = losning
      .map((bokstav, i) => {
        const vis = l.ferdig ? bokstav : valgt[i] != null ? b[valgt[i]] : "";
        return `<span class="jk-rute${vis ? " full" : ""}${l.ferdig ? " riktig" : ""}">${R.esc(vis)}</span>`;
      })
      .join("");
    const brikker = l.ferdig
      ? ""
      : `<div class="jk-brikker" role="group" aria-label="Bokstaver">${b
          .map((bokstav, i) => `<button class="jk-brikke" data-h="bokstav" data-v="${i}"${valgt.includes(i) ? " disabled" : ""} aria-label="${R.esc(bokstav)}">${R.esc(bokstav)}</button>`)
          .join("")}</div>`;
    return `
      <p class="jk-tekst">Sett bokstavene i riktig rekkefølge og finn juleordet.</p>
      <p class="jk-hint"><b>Hint:</b> ${R.esc(L.hint)}</p>
      <div class="jk-ruter${l.feil ? " risting" : ""}" aria-label="Ordet ditt: ${R.esc(valgt.map((i) => b[i]).join(""))}" role="img">${ruter}</div>
      ${brikker}
      ${l.ferdig ? `<p class="jk-resultat ${l.vist ? "" : "ja"}" role="status">${l.vist ? `Svaret er «${R.esc(L.ord)}».` : "Riktig! Godt jobba!"}</p>` : ""}`;
  }

  // ---------- Door content ----------

  function valgHtml(S, d, L) {
    const l = S.luker[d];
    const svart = Number.isInteger(l.svar);
    const knapper = L.valg
      .map((v, i) => {
        const kl = svart ? (i === L.riktig ? " riktig" : i === l.svar ? " feil" : " av") : "";
        const merke = svart && i === L.riktig ? '<span class="jk-hake" aria-hidden="true">✓</span>' : "";
        return `<button class="jk-valg${kl}" data-h="svar" data-v="${i}"${svart ? ' aria-disabled="true"' : ""}${svart && i === l.svar ? ' aria-pressed="true"' : ""}>${R.esc(v)}${merke}</button>`;
      })
      .join("");
    const res = svart
      ? `<p class="jk-resultat ${l.svar === L.riktig ? "ja" : ""}" role="status">${l.svar === L.riktig ? "Riktig! Godt jobba!" : `Nesten! Svaret er «${R.esc(L.valg[L.riktig])}».`}${L.fakta ? `<span>${R.esc(L.fakta)}</span>` : ""}</p>`
      : "";
    return `<div class="jk-valgliste">${knapper}</div>${res}`;
  }

  function innholdHtml(S, d) {
    const L = LUKER[d - 1];
    const l = S.luker[d];
    switch (L.type) {
      case "quiz":
        return `<p class="jk-sporsmal">${R.esc(L.tekst)}</p>${valgHtml(S, d, L)}`;
      case "sang":
        return `<p class="jk-hint"><b>Hint:</b> ${R.esc(L.tekst)}</p><p class="jk-tekst">Hvilken julesang er det?</p>${valgHtml(S, d, L)}`;
      case "nott":
        return `<p class="jk-sporsmal">${R.esc(L.tekst)}</p>${l.ferdig ? `<p class="jk-resultat ja" role="status">${R.esc(L.svar)}</p>` : '<p class="jk-tekst jk-tenk">Tenk deg om – og trykk når du vil se svaret.</p>'}`;
      case "ord":
        return ordHtml(S, d, L);
      default:
        return `<p class="jk-sporsmal jk-liten">${R.esc(L.tekst)}</p>${L.tips ? `<p class="jk-tekst">${R.esc(L.tips)}</p>` : ""}`;
    }
  }

  function dokkHtml(S, d) {
    const L = LUKER[d - 1];
    const l = S.luker[d];
    const til = R.ui.lenke("Til kalenderen", "hjem");
    if (L.type === "nott" && !l.ferdig) return R.ui.dokk(R.ui.knapp("Vis svaret", "vis-svar"), R.ui.lenkerad(til));
    if (L.type === "ord" && !l.ferdig)
      return R.ui.dokk(R.ui.lenkerad(R.ui.lenke("Visk ut", "visk"), R.ui.lenke("Vis svaret", "vis-svar"), til));
    if (L.type === "utfordring")
      return R.ui.dokk(`<a class="knapp" href="${R.esc(L.lenke)}">${R.esc(L.lenkeTekst)}</a>`, R.ui.lenkerad(til));
    if ((L.type === "quiz" || L.type === "sang") && !l.ferdig) return R.ui.dokk(R.ui.lenkerad(til));
    return R.ui.dokk(R.ui.knapp("Til kalenderen", "hjem"));
  }

  // ---------- The game ----------

  R.start({
    id: "julekalenderen",
    versjon: 1,
    pagar: () => false,

    tilstand: () => ({ sesong: 0, luker: {}, aktiv: 0, nytt: 0 }),

    lastet(S) {
      const f = fase();
      const ok = S.luker && typeof S.luker === "object" && !Array.isArray(S.luker);
      if (S.sesong !== f.sesong || !ok) {
        S.sesong = f.sesong;
        S.luker = {};
      }
      for (const k of Object.keys(S.luker)) {
        const d = Number(k);
        const l = S.luker[k];
        if (!Number.isInteger(d) || !kanApnes(d, f) || !l || typeof l !== "object") delete S.luker[k];
        else {
          l.ferdig = !!l.ferdig;
          if (!Number.isInteger(l.svar) || l.svar < 0 || l.svar > 2) delete l.svar;
          if (l.valgt && !Array.isArray(l.valgt)) delete l.valgt;
          delete l.feil;
        }
      }
      S.nytt = 0;
      if (!S.luker[S.aktiv]) S.aktiv = 0;
      if (S.skjerm === "luke" && !S.aktiv) S.skjerm = "hjem";
      meldFerdig(S);
    },

    regler: {
      intro: "En julekalender med 24 luker. Én ny luke åpner hver dag fra 1. til 24. desember.",
      steg: [
        ["Finn dagens luke", "Lukene står hulter til bulter, som i en ekte kalender. Dagens luke lyser."],
        ["Åpne den", "Bak luka er det en julenøtt, en quiz, en julesang, en ordgåte, en utfordring eller en kos-idé."],
        ["Samle klistremerker", "Hver luke du åpner, gir et klistremerke. Klarer du alle 24?"],
      ],
      tips: [
        "Har du glemt en dag? Gamle luker kan åpnes når som helst.",
        "Lukene kan ikke åpnes før sin dag – da får du bare vente litt.",
        "Fin å åpne sammen, for eksempel ved frokosten.",
        "Kalenderen husker lukene dine på denne mobilen.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const f = fase();
          const n = antallApnet(S);
          const dorer = REKKEFOLGE.map((d) => dorHtml(S, d, f)).join("");
          const merker = Object.keys(S.luker)
            .map(Number)
            .sort((a, b) => a - b)
            .map((d) => merkeHtml(d))
            .join("");
          const idagApen = f.fase === "aktiv" && S.luker[f.dag];
          const hoved =
            f.fase === "aktiv"
              ? R.ui.knapp(idagApen ? `Se luke ${f.dag}` : `Åpne luke ${f.dag}`, "dagens", { variant: idagApen ? "" : "lampe" })
              : R.ui.knapp("Del kalenderen", "del", { variant: "papir" });
          const lenker = f.fase === "aktiv" ? R.ui.lenkerad(R.ui.lenke("Del kalenderen", "del")) : "";
          return `
            <div class="jk-hode">
              ${R.figur(null, "jk-figur")}
              <div class="jk-tittel">
                <h1>Julekalenderen</h1>
                ${statusHtml(S, f)}
              </div>
            </div>
            <div class="jk-kalender${f.fase === "for" ? " jk-stengt" : ""}" role="group" aria-label="Kalenderen med 24 luker">
              <span class="jk-sno" aria-hidden="true"></span>
              <div class="jk-rutenett">${dorer}</div>
            </div>
            <div class="jk-samling">
              <p class="jk-telling"><b>${n} av 24</b> luker åpnet</p>
              <div class="jk-linje" aria-hidden="true"><span style="width:${Math.round((n / 24) * 100)}%"></span></div>
              ${n ? `<div class="jk-merker" aria-label="Klistremerkene dine">${merker}</div>` : `<p class="hjelp">${f.fase === "for" ? "Her samler du klistremerkene fra lukene." : "Åpne en luke og få ditt første klistremerke."}</p>`}
            </div>
            ${R.ui.dokk(hoved, lenker)}`;
        },
      },

      luke: {
        tittel: (S) => `Luke ${S.aktiv}`,
        tilbake: "hjem",
        vis(S) {
          const d = S.aktiv;
          const L = LUKER[d - 1];
          const ny = S.nytt === d;
          const overskrift = L.type === "kos" || L.type === "utfordring" ? L.tittel : TYPENAVN[L.type];
          return `
            <div class="jk-side jk-type-${L.type}">
              <div class="jk-topp">
                ${merkeHtml(d, `jk-stort${ny ? " jk-nytt" : ""}`)}
                <div>
                  ${overskrift !== TYPENAVN[L.type] ? `<span class="etikett">${R.esc(TYPENAVN[L.type])}</span>` : ""}
                  <h1>${R.esc(overskrift)}</h1>
                  ${ny ? `<p class="jk-fikk">Du fikk et klistremerke!</p>` : ""}
                </div>
              </div>
              <div class="jk-kort">${innholdHtml(S, d)}</div>
            </div>
            ${dokkHtml(S, d)}`;
        },
        ut(S) {
          S.nytt = 0;
        },
      },
    },

    // rusj.no/julekalenderen/#dagens (the front page's «I dag»): opens today's door in December.
    vedHash(S, hash) {
      if (String(hash).trim().toLowerCase() !== "dagens") return null;
      const f = fase();
      if (f.fase !== "aktiv") return "hjem";
      const d = f.dag;
      if (!S.luker[d]) {
        S.luker[d] = { ferdig: false };
        S.nytt = d;
        if (autoFerdig(LUKER[d - 1])) ferdig(S, d);
      }
      S.aktiv = d;
      return "luke";
    },

    handlinger: (H = {
      luke(el, e, S) {
        return apne(S, Number(el.dataset.v), el);
      },
      dagens(el, e, S) {
        const f = fase();
        if (f.fase !== "aktiv") return;
        const dor = document.querySelector(`.jk-luke[data-v="${f.dag}"]`);
        return apne(S, f.dag, S.luker[f.dag] ? null : dor);
      },
      hjem() {
        R.gaTil("hjem");
      },
      svar(el, e, S) {
        const d = S.aktiv;
        const L = LUKER[d - 1];
        const l = S.luker[d];
        if (!l || Number.isInteger(l.svar) || !L.valg) return;
        l.svar = Number(el.dataset.v);
        if (l.svar === L.riktig) {
          R.lyd.riktig();
          R.vibrer(20);
        } else R.lyd.pling();
        ferdig(S, d);
        R.vis();
      },
      "vis-svar"(el, e, S) {
        const d = S.aktiv;
        const L = LUKER[d - 1];
        const l = S.luker[d];
        if (!l || l.ferdig) return;
        if (L.type === "ord") l.vist = true;
        R.lyd.snu();
        ferdig(S, d);
        R.vis();
      },
      bokstav(el, e, S) {
        const d = S.aktiv;
        const L = LUKER[d - 1];
        const l = S.luker[d];
        if (!l || l.ferdig || L.type !== "ord") return;
        const i = Number(el.dataset.v);
        const valgt = (l.valgt = Array.isArray(l.valgt) ? l.valgt : []);
        if (valgt.includes(i) || valgt.length >= bokstaver(L.ord).length) return;
        valgt.push(i);
        delete l.feil;
        if (valgt.length === bokstaver(L.ord).length) {
          const b = stokket(d);
          if (valgt.map((k) => b[k]).join("") === L.ord) {
            delete l.valgt;
            R.lyd.riktig();
            R.vibrer(30);
            ferdig(S, d);
          } else {
            l.valgt = [];
            l.feil = true;
            R.lyd.feil();
            R.toast("Ikke helt – prøv en gang til!");
          }
        }
        R.vis();
      },
      visk(el, e, S) {
        const l = S.luker[S.aktiv];
        if (!l || l.ferdig || !Array.isArray(l.valgt) || !l.valgt.length) return;
        l.valgt.pop();
        delete l.feil;
        R.vis();
      },
      del(el, e, S) {
        const n = antallApnet(S);
        return R.del("Julekalenderen", `Jeg har åpnet ${n} av 24 luker i rusj-julekalenderen`, DEL_URL);
      },
    }),
  });
})();
