/* Brevduen — «Hvem skrev det?». The pigeon brings a question; the phone goes round and everyone
   writes a short answer in secret. Then the phone shows the answers one at a time in a shuffled
   order: someone reads it out, everyone points at once at who they think wrote it, and the phone
   reveals the author. Everyone who pointed right gets 1 point; the author gets 1 point for every
   player fooled. Kåringen after the last round.
   Privacy: the answers only live on this phone, in the saved state of the round that is being
   played (so a reload mid-round keeps them). Each answer is wiped as soon as the next one is
   shown, and the whole round is wiped when it ends. Answers are never counted or sent anywhere.
   The rules at the top are pure; test/brevduen.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- The rules (no kit needed) ----------

  const RUNDER = [3, 5, 7];
  const MAKS = 80; // characters in an answer
  const POENG_RIKTIG = 1; // to each player who pointed at the author
  const POENG_LURT = 1; // to the author, for each player fooled
  const FASER = ["sporsmal", "gi", "skriv", "les", "hvem", "fasit"];

  const range = (n) => Array.from({ length: n }, (_, i) => i);
  // An answer as it is kept: one line, no spaces at the ends, at most MAKS characters (never half
  // of an emoji). An answer with nothing left is empty ("").
  function rens(tekst) {
    const t = String(tekst == null ? "" : tekst).replace(/\s+/g, " ").trim();
    return Array.from(t).slice(0, MAKS).join("").trim();
  }
  // Fisher–Yates with the given random source.
  function stokk(liste, rng) {
    const l = liste.slice();
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  }

  // A fresh round: question k, writing starts with the player after last round's first.
  function nyRunde(runde, antall, k) {
    return { k, start: runde % antall, na: 0, svar: Array(antall).fill(null), rekke: [], vis: 0, pekt: [], siste: null };
  }
  function ny(antall, runder, k) {
    return {
      antall,
      runder,
      runde: 0, // rounds finished
      fase: "sporsmal",
      poeng: Array(antall).fill(0),
      lurt: Array(antall).fill(0), // players each one fooled, in all
      vist: 0, // answers scored, in all
      r: nyRunde(0, antall, k),
      ferdig: false,
    };
  }
  // Whose turn it is to write.
  const skriver = (sp) => (sp.r.start + sp.r.na) % sp.antall;
  // The author of the answer on the screen.
  const forfatter = (sp) => sp.r.rekke[sp.r.vis];

  // Another question, only before anyone has written.
  function byttSporsmal(sp, k) {
    if (!["sporsmal", "gi"].includes(sp.fase) || sp.r.na > 0) return false;
    sp.r.k = k;
    return true;
  }
  // The question has been read out: the phone goes round.
  function begynn(sp) {
    if (sp.fase !== "sporsmal") return false;
    sp.fase = "gi";
    return true;
  }
  // «Jeg er X»: the writer has the phone.
  function jegEr(sp) {
    if (sp.fase !== "gi") return false;
    sp.fase = "skriv";
    return true;
  }
  // The writer is done. "tom" for an empty answer; then "gi" (next writer) or "les" (all done:
  // the answers in a shuffled order).
  function skriv(sp, tekst, rng) {
    if (sp.fase !== "skriv") return null;
    const t = rens(tekst);
    if (!t) return "tom";
    const r = sp.r;
    r.svar[skriver(sp)] = t;
    r.na += 1;
    if (r.na < sp.antall) {
      sp.fase = "gi";
      return "gi";
    }
    r.rekke = stokk(range(sp.antall), rng);
    r.vis = 0;
    r.pekt = [];
    sp.fase = "les";
    return "les";
  }
  // Everyone has pointed: the phone shows who wrote it.
  function avslor(sp) {
    if (sp.fase !== "les") return false;
    sp.fase = "hvem";
    sp.r.pekt = [];
    return true;
  }
  // riktige = the players who pointed at the author (the author is never one of them).
  function avgjor(sp, riktige) {
    if (sp.fase !== "hvem") return null;
    const a = forfatter(sp);
    const liste = [...new Set((riktige || []).filter((i) => Number.isInteger(i) && i >= 0 && i < sp.antall && i !== a))].sort((x, y) => x - y);
    const lurte = sp.antall - 1 - liste.length;
    const pluss = Array(sp.antall).fill(0);
    for (const i of liste) pluss[i] = POENG_RIKTIG;
    pluss[a] = lurte * POENG_LURT;
    pluss.forEach((p, i) => (sp.poeng[i] += p));
    sp.lurt[a] += lurte;
    sp.vist += 1;
    sp.r.pekt = liste;
    sp.r.siste = { forfatter: a, riktige: liste, lurte, pluss };
    sp.fase = "fasit";
    return sp.r.siste;
  }
  // Take the last result back and choose who pointed right again.
  function angre(sp) {
    const s = sp.r && sp.r.siste;
    if (sp.fase !== "fasit" || !s) return false;
    s.pluss.forEach((p, i) => (sp.poeng[i] -= p));
    sp.lurt[s.forfatter] -= s.lurte;
    sp.vist -= 1;
    sp.r.siste = null;
    sp.fase = "hvem";
    return true;
  }
  // On to the next answer (the one just shown is wiped), a new round (all answers wiped) or the end.
  // nyK gives the next round's question.
  function neste(sp, nyK) {
    if (sp.fase !== "fasit") return null;
    const r = sp.r;
    r.svar[forfatter(sp)] = null;
    r.siste = null;
    r.pekt = [];
    if (r.vis + 1 < r.rekke.length) {
      r.vis += 1;
      sp.fase = "les";
      return "les";
    }
    sp.runde += 1;
    if (sp.runde >= sp.runder) {
      sp.r = null;
      sp.ferdig = true;
      return "slutt";
    }
    sp.r = nyRunde(sp.runde, sp.antall, nyK());
    sp.fase = "sporsmal";
    return "sporsmal";
  }
  // The answers still on this phone (for tests: wiped answers are null).
  const igjen = (sp) => (sp.r ? sp.r.svar.filter((t) => t != null).length : 0);

  const R = window.Rusj;
  if (!R) {
    window.Brevduen = { RUNDER, MAKS, POENG_RIKTIG, POENG_LURT, FASER, rens, stokk, ny, nyRunde, skriver, forfatter, byttSporsmal, begynn, jegEr, skriv, avslor, avgjor, angre, neste, igjen };
    return;
  }

  // ---------- The game ----------

  const D = window.RUSJ_DATA;
  const FAMILIE = D.familie;
  const VOKSEN = D.voksen || [];
  const ALLE = FAMILIE.concat(VOKSEN);
  const esc = R.esc;
  const deck = R.kortstokk("sporsmal", ALLE.length);
  const MIN = 3;
  const MAKS_SPILLERE = 12;

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  let H; // the actions, so one action can reuse another
  let teller = false; // the 3-2-1 countdown is running
  let feire = false; // Kåringen was just reached (not a reload)

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS_SPILLERE);
  }
  // The next question from the deck (no repeats until the deck is used up).
  function trekk(voksen, unntatt) {
    const ok = (i) => (voksen || i < FAMILIE.length) && i !== unntatt;
    let k = deck.neste(ok);
    if (k < 0 || !ALLE[k]) k = R.heltall(0, FAMILIE.length - 1);
    return k;
  }

  const rader = (sp, medPluss) => sp.poeng.map((poeng, i) => ({ i, poeng, ...(medPluss && sp.r && sp.r.siste && sp.r.siste.pluss[i] ? { pluss: sp.r.siste.pluss[i] } : {}) }));
  const toppen = (sp) => {
    const best = Math.max(...sp.poeng);
    return best > 0 ? range(sp.antall).filter((i) => sp.poeng[i] === best) : [];
  };
  const tittel = (S) => (S.spill ? R.t("Runde {n} av {m}", { n: Math.min(S.spill.runde + 1, S.spill.runder), m: S.spill.runder }) : "");

  // Once per game, when it is over: the answers are wiped, statistics (numbers only) and the
  // evening's scoreboard.
  function fullfor(S) {
    const sp = S.spill;
    if (!sp || sp.feiret) return;
    sp.r = null;
    sp.ferdig = true;
    sp.feiret = true;
    feire = true;
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.runde, avbrutt: sp.runde < sp.runder });
    if (sp.vist > 0) R.kveld.registrer(rader(sp));
  }

  // The letter the pigeon brings: the question on paper.
  const brev = (k, kompakt) => `
    <div class="bd-brev${kompakt ? " kompakt" : ""}">
      <span class="bd-stempel" aria-hidden="true">✉️</span>
      <p class="bd-brev-tekst">${esc(ALLE[k])}</p>
    </div>`;

  const avslutt = () => R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt"));

  R.start({
    id: "brevduen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      runder: 3,
      voksen: false,
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS_SPILLERE);
      if (!RUNDER.includes(S.runder)) S.runder = 3;
      S.voksen = S.voksen === true;
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const tall = (l) => Array.isArray(l) && l.length === n && l.every((x) => Number.isInteger(x));
        let ok =
          Number.isInteger(n) && n >= MIN && n <= MAKS_SPILLERE &&
          RUNDER.includes(sp.runder) && Number.isInteger(sp.runde) && sp.runde >= 0 && sp.runde <= sp.runder &&
          FASER.includes(sp.fase) && tall(sp.poeng) && tall(sp.lurt) && Number.isInteger(sp.vist);
        if (ok && sp.ferdig) sp.r = null;
        else if (ok) {
          const r = sp.r;
          const tekst = (t) => t === null || (typeof t === "string" && t.length > 0 && Array.from(t).length <= MAKS);
          ok =
            !!r && !!ALLE[r.k] && spiller(r.start) && Number.isInteger(r.na) && r.na >= 0 && r.na <= n &&
            Array.isArray(r.svar) && r.svar.length === n && r.svar.every(tekst) &&
            Array.isArray(r.pekt) && r.pekt.every(spiller) && Number.isInteger(r.vis);
          if (ok && ["sporsmal", "gi", "skriv"].includes(sp.fase)) ok = r.na < n && r.svar.filter((t) => t != null).length === r.na;
          if (ok && ["les", "hvem", "fasit"].includes(sp.fase))
            ok = r.na === n && Array.isArray(r.rekke) && r.rekke.length === n && new Set(r.rekke).size === n && r.rekke.every(spiller) && r.vis >= 0 && r.vis < n && typeof r.svar[r.rekke[r.vis]] === "string";
          if (ok && sp.fase === "fasit") ok = !!r.siste && Array.isArray(r.siste.pluss) && r.siste.pluss.length === n && r.siste.forfatter === r.rekke[r.vis];
        }
        if (!ok) S.spill = null;
      }
      // Never back on the writing screen after a reload: give the phone to the same player again.
      if (pagar(S) && S.spill.fase === "skriv") S.spill.fase = "gi";
      if (FASER.includes(S.skjerm)) S.skjerm = pagar(S) ? S.spill.fase : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Brevduen kommer med et spørsmål. Alle svarer i hemmelighet – så gjelder det å gjette hvem som skrev hva."),
      steg: [
        [R.t("Les spørsmålet"), R.t("Én leser spørsmålet høyt. Så går mobilen rundt, og hver av dere skriver et kort svar mens de andre ser bort.")],
        [R.t("Pek samtidig"), R.t("Mobilen viser svarene ett for ett i tilfeldig rekkefølge. Én leser svaret høyt, dere teller ned, og alle peker på den de tror skrev det.")],
        [R.t("Poeng"), R.t("Mobilen viser hvem som skrev svaret. Pekte du riktig, får du 1 poeng. Den som skrev svaret, får 1 poeng for hver hen lurte.")],
      ],
      tips: [
        R.t("Skriv som deg selv – eller som noen andre. Det er lov å lure!"),
        R.t("Den som skrev svaret, peker også – gjerne på noen andre."),
        R.t("Svarene blir bare på denne mobilen. De sendes ingen steder og slettes når dere går videre."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Alle svarer i hemmelighet."))}<br><em>${esc(R.t("Hvem skrev det?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              [`${MIN}–${MAKS_SPILLERE}`, R.t("spillere")],
              [String(ALLE.length), R.t("spørsmål")],
              ["1", R.t("mobil")],
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
            ${R.ui.spillere({ min: MIN, max: MAKS_SPILLERE, hjelp: R.t("Mobilen går rundt i samme rekkefølge som lista.") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Runder"))}</h2></div>
              ${R.ui.seg("runder", RUNDER.map((n) => [String(n), String(n)]), String(S.runder))}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Spørsmål"))}</h2></div>
              ${R.ui.bryter("voksen", S.voksen, R.t("Voksen 🍷"), R.t("Også spørsmål for julebord og vors (18+)"))}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      // Everyone: the pigeon brings the question.
      sporsmal: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="bd-due">
              ${R.figur()}
              <div>
                <p class="etikett">${esc(R.t("Brevduen har med seg et spørsmål"))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Les det høyt!"))}</h1>
              </div>
            </div>
            ${brev(sp.r.k)}
            <p class="hjelp bd-hjelp">${esc(R.t("Så går mobilen rundt, og alle skriver et svar i hemmelighet."))}</p>
            ${R.ui.dokk(
              R.ui.knapp2(R.t("Nytt spørsmål"), "bytt", { ikon: "🕊️" }),
              R.ui.knapp(R.t("Send mobilen rundt"), "begynn"),
              avslutt(),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      // «Gi mobilen til …»
      gi: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return R.ui.giTil({
            i: skriver(sp),
            h: "jeg-er",
            advarsel: R.t("De andre ser bort mens du skriver"),
            prikker: [sp.antall, sp.r.na],
          });
        },
        inn: () => R.holdVaken(),
      },

      // Private: the player writes an answer.
      skriv: {
        tittel: R.t("Hemmelig"),
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const i = skriver(sp);
          const navn = R.navn(i);
          const sist = sp.r.na + 1 >= sp.antall;
          return `
            <form class="bd-skriv" data-skjema="svar" data-hemmelig autocomplete="off" novalidate>
              <div class="bd-topp">
                ${R.avatar(i, "mid")}
                <div><p class="etikett">🤫 ${esc(R.t("Bare {navn} ser dette", { navn }))}</p><h1 id="skjerm-tittel">${esc(R.t("Skriv svaret ditt"))}</h1></div>
              </div>
              ${brev(sp.r.k, true)}
              <label class="bd-felt" for="bd-felt">
                <span class="vh">${esc(R.t("Svaret til {navn}", { navn }))}</span>
                <textarea id="bd-felt" class="tekstfelt" name="svar-${sp.runde}-${sp.r.na}" rows="2" maxlength="${MAKS}" placeholder="${esc(R.t("Skriv et kort svar …"))}" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" aria-describedby="bd-feil bd-igjen"></textarea>
              </label>
              <p class="bd-teller" id="bd-igjen" aria-hidden="true">0/${MAKS}</p>
              <p class="feil" id="bd-feil" aria-live="assertive"></p>
              ${R.ui.dokk(`<button class="knapp" type="submit" id="bd-ferdig">${esc(sist ? R.t("Ferdig – alle har svart") : R.t("Ferdig – gi mobilen videre"))}</button>`)}
            </form>`;
        },
        inn() {
          const f = R.$("#bd-felt");
          if (!f) return;
          try {
            f.focus({ preventScroll: true });
          } catch (e) {
            f.focus();
          }
        },
        etter(S, rot) {
          const f = rot.querySelector("#bd-felt");
          if (!f || f.dataset.koblet) return;
          f.dataset.koblet = "1";
          f.addEventListener("input", () => {
            const t = R.$("#bd-igjen");
            if (t) t.textContent = `${Array.from(f.value).length}/${MAKS}`;
            f.removeAttribute("aria-invalid");
            const feil = R.$("#bd-feil");
            if (feil && feil.textContent) feil.textContent = "";
          });
          // Enter sends the answer (an answer is one line).
          f.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              const form = f.form;
              if (form && form.requestSubmit) form.requestSubmit();
            }
          });
        },
      },

      // Everyone: one answer, then point.
      les: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          return `
            <h1 id="skjerm-tittel" class="bd-h1">${esc(R.t("Hvem skrev det?"))}</h1>
            <p class="bd-sporsmal">${esc(ALLE[r.k])}</p>
            <div class="bd-kort">${R.ui.storkort({ tekst: r.svar[forfatter(sp)], etikett: R.t("Svar {n} av {m}", { n: r.vis + 1, m: sp.antall }), klasse: "bd-svar", kompakt: true })}</div>
            <p class="hjelp bd-hjelp">${esc(r.vis === 0 ? R.t("Legg mobilen midt på bordet. Én leser svaret høyt – så peker alle samtidig.") : R.t("Les svaret høyt. Så peker alle samtidig – også den som skrev det."))}</p>
            ${R.ui.dokk(R.ui.knapp2(R.t("3 · 2 · 1 – Pek!"), "pek", { ikon: "👉" }), R.ui.knapp(R.t("Vis hvem som skrev det"), "avslor", { variant: "rosa" }), avslutt())}`;
        },
        inn: () => R.holdVaken(),
      },

      // Everyone: the author is revealed; who pointed right?
      hvem: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const a = forfatter(sp);
          const navn = R.navn(a);
          const andre = range(sp.antall).filter((i) => i !== a);
          return `
            ${R.ui.banner({ etikett: R.t("Skrevet av"), tittel: navn, tekst: R.t("«{svar}»", { svar: sp.r.svar[a] }), klasse: "aksent bd-banner", stemning: "jubel" })}
            <section class="seksjon">
              <h2>${esc(R.t("Hvem pekte på {navn}?", { navn }))}</h2>
              ${R.ui.velgere("pekt", andre, sp.r.pekt)}
              <p class="hjelp">${esc(R.t("Trykk på alle som pekte riktig."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(sp.r.pekt.length ? R.t("Gi poeng") : R.t("Ingen pekte riktig"), "gi-poeng", { variant: "rosa" }))}`;
        },
      },

      // Everyone: the points for this answer.
      fasit: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const s = sp.r.siste;
          const navn = R.navn(s.forfatter);
          const sisteSvar = sp.r.vis + 1 >= sp.r.rekke.length;
          const sisteRunde = sp.runde + 1 >= sp.runder;
          const poeng = R.flertall(s.pluss[s.forfatter], "poeng", "poeng");
          const banner = !s.riktige.length
            ? R.ui.banner({ etikett: R.t("Ingen gjettet {navn}!", { navn }), tittel: R.t("{navn} lurte alle!", { navn }), tekst: R.t("{poeng} til {navn}.", { poeng, navn }), klasse: "aksent", stemning: "jubel" })
            : !s.lurte
              ? R.ui.banner({ etikett: R.t("Avslørt!"), tittel: R.t("Alle gjettet {navn}!", { navn }), tekst: R.t("1 poeng til alle som pekte riktig."), klasse: "aksent", stemning: "lei" })
              : R.ui.banner({ etikett: R.t("Det var {navn}", { navn }), tittel: R.t("{navn} lurte {n} av {m}", { navn, n: s.lurte, m: sp.antall - 1 }), tekst: R.t("{poeng} til {navn}, og 1 poeng til hver som pekte riktig.", { poeng, navn }), klasse: "aksent", stemning: "" });
          const knapp = !sisteSvar ? R.t("Neste svar") : sisteRunde ? R.t("Til kåringen") : R.t("Neste runde");
          return `
            ${banner}
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${R.ui.dokk(R.ui.knapp(knapp, "neste"), R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          const s = S.spill.r && S.spill.r.siste;
          if (s && !s.riktige.length) R.konfetti(["--rosa", "--lampe", "--aksent"]);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = toppen(sp);
          const banner = topp.length
            ? R.ui.banner({ tittel: R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(topp.map(R.navn)), n: topp.length }), tekst: R.t("{poeng} etter {svar}", { poeng: R.flertall(sp.poeng[topp[0]], "poeng", "poeng"), svar: R.flertall(sp.vist, "svar", "svar") }), klasse: "aksent" })
            : R.ui.banner({ tittel: R.t("Ingen poeng ennå"), tekst: R.t("Spill en runde, så blir det kåring!"), klasse: "aksent", stemning: "" });
          const mest = Math.max(...sp.lurt);
          const lurere = mest > 0 ? range(sp.antall).filter((i) => sp.lurt[i] === mest) : [];
          const ganger = R.flertall(mest, "gang", "ganger");
          const linje = !lurere.length
            ? R.t("Ingen klarte å lure de andre i kveld. Dere kjenner hverandre godt!")
            : lurere.length === 1
              ? R.t("Kveldens luring: {navn}, som lurte de andre {ganger}.", { navn: R.navn(lurere[0]), ganger })
              : R.t("Kveldens luringer: {navn}, som lurte de andre {ganger} hver.", { navn: R.ramsOpp(lurere.map(R.navn)), ganger });
          return `
            ${banner}
            ${topp.length ? R.ui.pall(rader(sp)) : ""}
            ${sp.vist ? R.ui.poengliste(rader(sp)) : ""}
            ${sp.vist ? `<p class="papirboks bd-luring">${esc(linje)}</p>` : ""}
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

    skjema: {
      svar(S, form) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "skriv" || S.skjerm !== "skriv") return;
        const felt = form.querySelector("textarea");
        const hvor = skriv(sp, felt.value, Math.random);
        if (hvor === "tom") {
          R.$("#bd-feil").textContent = R.t("Skriv et svar først.");
          felt.classList.remove("risting");
          void felt.offsetWidth;
          felt.classList.add("risting");
          felt.setAttribute("aria-invalid", "true");
          felt.focus();
          R.lyd.feil();
          R.vibrer(60);
          return;
        }
        if (!hvor) return;
        felt.value = ""; // nothing of this answer is left on the page
        R.lyd.pop();
        R.vibrer(15);
        if (hvor === "les") {
          R.lyd.pling();
          R.gaTil("les");
          R.si(R.t("Alle har svart."));
          return;
        }
        R.gaTil("gi");
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
        if (S.spill.fase === "skriv") S.spill.fase = "gi";
        R.gaTil(S.spill.fase);
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if (RUNDER.includes(n)) S.runder = n;
        R.vis();
      },
      voksen(el, e, S) {
        S.voksen = !S.voksen;
        R.vis();
      },
      start(el, e, S) {
        const antall = R.klamp(S.antall || 4, MIN, MAKS_SPILLERE);
        S.spill = ny(antall, S.runder, trekk(S.voksen));
        S.spill.voksen = S.voksen;
        R.statistikk("start", { spillere: antall, runder: S.runder, voksen: S.voksen });
        R.gaTil("sporsmal");
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !byttSporsmal(sp, trekk(sp.voksen, sp.r.k))) return;
        R.lyd.sveip();
        R.vis();
        R.si(ALLE[sp.r.k]);
      },
      begynn(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !begynn(sp)) return;
        R.gaTil("gi");
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !jegEr(sp)) return;
        R.gaTil("skriv");
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
      async avslor(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "les") return;
        const fortsatt = R.vakt();
        R.lyd.trommevirvel(1);
        await R.vent(R.rolig() ? 200 : 800);
        if (!fortsatt() || S.spill !== sp || !avslor(sp)) return;
        R.lyd.fanfare();
        R.vibrer([40, 30, 90]);
        R.gaTil("hvem");
      },
      pekt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "hvem") return;
        const i = Number(el.dataset.v);
        if (!Number.isInteger(i) || i === forfatter(sp)) return;
        sp.r.pekt = sp.r.pekt.includes(i) ? sp.r.pekt.filter((x) => x !== i) : [...sp.r.pekt, i];
        R.vis();
      },
      "gi-poeng"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const s = avgjor(sp, sp.r.pekt);
        if (!s) return;
        if (!s.riktige.length) R.lyd.fanfare();
        else if (!s.lurte) R.lyd.buu();
        else R.lyd.pling();
        R.gaTil("fasit");
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !angre(sp)) return;
        R.toast(R.t("Angret – poengene er tatt bort"));
        R.gaTil("hvem");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const hvor = neste(sp, () => trekk(sp.voksen));
        if (!hvor) return;
        if (hvor === "slutt") {
          fullfor(S);
          R.gaTil("slutt");
          return;
        }
        if (hvor === "sporsmal") R.lyd.pling();
        R.gaTil(hvor);
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = sp.vist === 0;
        const ja = await R.bekreft(
          R.t("Avslutte spillet?"),
          ingenting ? R.t("Svarene som er skrevet, slettes. Dere kan alltid starte et nytt.") : R.t("Svarene som er skrevet, slettes, og dere går rett til kåringen."),
          R.t("Avslutt"),
          R.t("Spill videre"),
        );
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (sp.fase === "fasit" && sp.r.vis + 1 >= sp.r.rekke.length) sp.runde += 1; // the round was played to the end
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
