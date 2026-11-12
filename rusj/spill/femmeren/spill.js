/* Femmeren — «Nevn tre …» on five seconds.
   One phone on the table (or in the reader's hand). The player whose turn it is reads the card,
   taps «Start», and a fuse and a ring burn down five (or ten) seconds. Then the group judges:
   «Klarte det?» Ja gives a point and grows the player's streak. With «Utfordre» on, someone who
   thought it was easy may name three MORE in the same time: right → a bonus point for them,
   wrong → the bonus goes to the player whose turn it was. Rounds or first to N points, then
   Kåringen with podium, the longest streak and a shareable result.

   The rules are pure functions on window.RusjFemmeren, so test/femmeren.test.mjs can load this
   file in node:vm without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const FASER = ["gi", "klar", "tikker", "dom", "resultat", "utfordrer", "uklar", "utikker", "udom"];
  const TIDER = [5, 10];
  const RUNDER = [1, 10]; // min, max rounds
  const POENG = [3, 30]; // min, max points to win

  const M = {
    FASER,
    TIDER,
    RUNDER,
    POENG,
    // A new game from the setup. `kort`: the first card's number.
    nyttSpill(o, antall, kort) {
      return {
        antall,
        pakker: o.pakker.slice(),
        maal: o.maal === "poeng" ? "poeng" : "runder",
        runder: o.runder,
        poengMaal: o.poengMaal,
        tid: TIDER.includes(o.tid) ? o.tid : 5,
        utfordre: !!o.utfordre,
        giVidere: !!o.giVidere,
        tur: 0, // the turn being played (0, 1, 2 …); the player is tur % antall
        kort,
        fase: o.giVidere ? "gi" : "klar",
        poeng: Array(antall).fill(0),
        rekke: Array(antall).fill(0), // successes in a row, per player (own turns only)
        best: Array(antall).fill(0), // each player's longest streak this game
        forsok: 0,
        klart: 0,
        utfordrer: null, // who took up the challenge on this turn
        siste: null, // what the result screen shows: { i, ja, u, uja }
        angre: null, // a copy of the game before the last judgement
        ferdig: false,
      };
    },
    spiller: (sp) => sp.tur % sp.antall,
    neste: (sp) => (sp.tur + 1) % sp.antall,
    runde: (sp) => Math.floor(sp.tur / sp.antall) + 1,
    // Keep a copy of the game (without the previous copy) so the next judgement can be undone.
    husk(sp) {
      const kopi = JSON.parse(JSON.stringify(Object.assign({}, sp, { angre: null })));
      sp.angre = kopi;
    },
    // Undo: the game goes back to how it was before the judgement. Returns false if nothing to undo.
    angre(sp) {
      const a = sp.angre;
      if (!a) return false;
      for (const k of Object.keys(sp)) delete sp[k];
      Object.assign(sp, a, { angre: null });
      return true;
    },
    // The group's verdict on the player whose turn it is.
    dom(sp, ja) {
      const i = M.spiller(sp);
      M.husk(sp);
      sp.forsok += 1;
      if (ja) {
        sp.poeng[i] += 1;
        sp.rekke[i] += 1;
        sp.best[i] = Math.max(sp.best[i], sp.rekke[i]);
        sp.klart += 1;
      } else sp.rekke[i] = 0;
      sp.siste = { i, ja: !!ja, u: null, uja: null };
      sp.fase = "resultat";
    },
    // A challenge is possible right after a success, once per turn, when someone else plays.
    kanUtfordre: (sp) => !!(sp.utfordre && sp.siste && sp.siste.ja && sp.siste.u == null && sp.antall >= 2 && sp.fase === "resultat"),
    // The challenger named three more (ja) or not: the bonus goes to them or to the player.
    utfordringDom(sp, ja) {
      const u = sp.utfordrer;
      M.husk(sp);
      if (ja) sp.poeng[u] += 1;
      else sp.poeng[sp.siste.i] += 1;
      sp.siste = Object.assign({}, sp.siste, { u, uja: !!ja });
      sp.fase = "resultat";
    },
    // Who gets the bonus of the challenge on the result screen (or null).
    bonusTil: (s) => (!s || s.u == null ? null : s.uja ? s.u : s.i),
    // Is the game over after the turn on the table?
    erFerdig(sp) {
      if (sp.maal === "poeng") return sp.poeng.some((p) => p >= sp.poengMaal);
      return sp.tur + 1 >= sp.antall * sp.runder;
    },
    // On to the next player's turn (the caller draws the new card).
    nesteTur(sp, kort) {
      sp.tur += 1;
      sp.kort = kort;
      sp.fase = sp.giVidere ? "gi" : "klar";
      sp.utfordrer = null;
      sp.siste = null;
    },
    // Ranking rows as R.ui.poengliste takes them.
    rader: (sp) => sp.poeng.map((poeng, i) => ({ i, poeng })),
    vinnere(sp) {
      const topp = Math.max(0, ...sp.poeng);
      return topp > 0 ? sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    },
    // The longest streak of the game: { n, hvem: [players] } (n = 0 when nobody succeeded).
    lengsteRekke(sp) {
      const n = Math.max(0, ...sp.best);
      return { n, hvem: n > 0 ? sp.best.map((b, i) => (b === n ? i : -1)).filter((i) => i >= 0) : [] };
    },
  };
  window.RusjFemmeren = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;
  // All cards in one list so the deck can remember what has been shown. The order follows the
  // data file (new packs are added last there), so the remembered numbers stay valid.
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
  const STANDARD = ["familie", "norge"];
  const OPPSETT = () => ({ pakker: STANDARD.slice(), maal: "runder", runder: 3, poengMaal: 10, tid: 5, utfordre: true, giVidere: false });
  const stokk = R.kortstokk("kort", ALLE.length);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const KLOKKE = "femmer-klokke";
  // The address of this game in the edition (the share text links to it).
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "femmeren") + "/";
  let H;

  // ---------- Record (this phone): the longest streak of successes ----------

  const lesRekord = () => {
    const n = Number(R.les("femmeren.rekord", 0));
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  function lagreRekord(sp) {
    const n = M.lengsteRekke(sp).n;
    if (n > lesRekord()) R.skriv("femmeren.rekord", n);
  }

  function trekk(sp) {
    const valgt = new Set(sp.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    return i;
  }

  const kortTekst = (k) => `${D.prefiks} ${ALLE[k].t}`;
  const siTur = (S) => {
    const sp = S.spill;
    R.si(R.t("{navn} sin tur. {kort}.", { navn: R.navn(M.spiller(sp)), kort: kortTekst(sp.kort) }));
  };
  const lengdeTekst = (sp) =>
    sp.maal === "poeng" ? R.t("Først til {n}", { n: sp.poengMaal }) : R.t("Runde {n} av {av}", { n: Math.min(M.runde(sp), sp.runder), av: sp.runder });

  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    R.stoppTimere();
    sp.angre = null;
    sp.ferdig = true;
    lagreRekord(sp);
    R.statistikk("ferdig", { spillere: sp.antall, turer: sp.forsok, klart: sp.klart, maal: sp.maal, tid: sp.tid, tidlig: !!tidlig });
    R.kveld.registrer(M.rader(sp));
    R.slippVaken();
    R.gaTil("slutt");
  }

  // ---------- Pieces of the turn screen ----------

  // Whose turn (or who took the challenge), above the card.
  function hvem(S, i, etikett) {
    return `<div class="femmer-hvem">${R.avatar(i, "stor")}<div><p class="etikett">${esc(etikett)}</p><h1 id="skjerm-tittel">${esc(R.navn(i))}</h1></div></div>`;
  }

  function kortet(S, o = {}) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: R.t("{n} s", { n: sp.tid }),
      tekstHtml: `<span class="prefiks">${esc(D.prefiks)} …</span>${esc(k.t)}`,
      klasse: "femmer-kort" + (o.klasse ? " " + o.klasse : ""),
      sveip: o.sveip || null,
      fot: o.fot || null,
      kompakt: !!o.kompakt,
    });
  }

  // The burning fuse under the ring (decoration: the ring and the number carry the time).
  const lunte = (sek) =>
    `<div class="femmer-lunte" style="--sek: ${sek}s" aria-hidden="true"><span class="femmer-snor"><i class="femmer-gnist"></i></span></div>`;

  function resultatSkjerm(S) {
    const sp = S.spill;
    const s = sp.siste;
    const ferdig = M.erFerdig(sp);
    const bonus = M.bonusTil(s);
    const rekke = sp.rekke[s.i];
    const gml = lesRekord();
    const nyRekord = s.ja && rekke >= 2 && rekke > gml;
    let linje = "";
    if (s.ja) linje = nyRekord ? R.t("Ny rekord: {n} på rad!", { n: rekke }) : rekke >= 2 ? `🔥 ${R.t("{n} på rad!", { n: rekke })}` : R.t("Godt jobba!");
    else linje = R.t("Neste gang sitter de!");
    const ufLinje =
      s.u == null
        ? ""
        : `<p class="femmer-bonus">${
            s.uja
              ? `${esc(R.t("{navn} klarte tre til:", { navn: R.navn(s.u) }))} <b>${esc(R.t("+1 bonus til {navn}", { navn: R.navn(s.u) }))}</b>`
              : `${esc(R.t("Utfordringen slo tilbake:"))} <b>${esc(R.t("+1 bonus til {navn}", { navn: R.navn(s.i) }))}</b>`
          }</p>`;
    const rader = M.rader(sp).map((r) => {
      let pluss = 0;
      if (s.ja && r.i === s.i) pluss += 1;
      if (bonus === r.i) pluss += 1;
      return Object.assign(r, pluss ? { pluss } : {});
    });
    const angre = sp.angre ? R.ui.lenke(`↶ ${R.t("Angre")}`, "angre", { id: "angre" }) : "";
    return `
      <div class="banner ${s.ja ? "aksent" : ""} femmer-resultat${s.ja ? " ja" : " nei"}">
        <div class="femmer-resultat-figur">${R.avatar(s.i, "gigant")}</div>
        <p class="etikett">${esc(s.ja ? R.t("Klarte det!") : R.t("Ikke denne gangen"))}</p>
        <h1 id="skjerm-tittel">${s.ja ? esc(R.t("+1 til {navn}", { navn: R.navn(s.i) })) : esc(R.navn(s.i))}</h1>
        <p class="femmer-linje${nyRekord ? " rekord" : ""}">${esc(linje)}</p>
        ${ufLinje}
      </div>
      ${R.ui.poengliste(rader)}
      ${R.ui.dokk(
        R.ui.knapp(ferdig ? R.t("Til kåringen") : R.t("Neste tur"), "videre"),
        M.kanUtfordre(sp) ? R.ui.knapp2(R.t("For lett? Utfordre!"), "utfordre", { ikon: "⚔️" }) : "",
        R.ui.lenkerad(angre, ferdig ? "" : R.ui.lenke(R.t("Avslutt"), "slutt")),
      )}`;
  }

  // ---------- Start ----------

  R.start({
    id: "femmeren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 4, 2, 20),
      oppsett: OPPSETT(),
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(OPPSETT(), S.oppsett));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      if (!["runder", "poeng"].includes(o.maal)) o.maal = "runder";
      o.runder = R.klamp(Math.round(Number(o.runder)) || 3, RUNDER[0], RUNDER[1]);
      o.poengMaal = R.klamp(Math.round(Number(o.poengMaal)) || 10, POENG[0], POENG[1]);
      if (!TIDER.includes(o.tid)) o.tid = 5;
      o.utfordre = !!o.utfordre;
      o.giVidere = !!o.giVidere;
      const sp = S.spill;
      const iSpill = (i) => Number.isInteger(i) && i >= 0 && sp && i < sp.antall;
      const ok =
        sp &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 2 &&
        sp.antall <= 20 &&
        ALLE[sp.kort] &&
        Number.isInteger(sp.tur) &&
        sp.tur >= 0 &&
        ["poeng", "rekke", "best"].every((k) => Array.isArray(sp[k]) && sp[k].length === sp.antall && sp[k].every((n) => Number.isInteger(n) && n >= 0)) &&
        FASER.includes(sp.fase) &&
        Array.isArray(sp.pakker) &&
        TIDER.includes(sp.tid);
      if (!ok) S.spill = null;
      else {
        if (!(sp.siste && iSpill(sp.siste.i))) sp.siste = null;
        if (sp.utfordrer != null && !iSpill(sp.utfordrer)) sp.utfordrer = null;
        if (sp.fase === "resultat" && !sp.siste) sp.fase = "klar";
        if (["uklar", "utikker", "udom"].includes(sp.fase) && (sp.utfordrer == null || !sp.siste)) sp.fase = sp.siste ? "resultat" : "klar";
        if (sp.fase === "utfordrer" && !sp.siste) sp.fase = "klar";
        // A countdown interrupted by a reload starts the card again.
        if (sp.fase === "tikker") sp.fase = "klar";
        if (sp.fase === "utikker") sp.fase = "uklar";
        if (sp.angre && typeof sp.angre !== "object") sp.angre = null;
      }
      if (!S.spill && ["tur", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Et kort ber deg nevne tre ting – og du har fem sekunder på deg."),
      steg: [
        [R.t("Les kortet"), R.t("Den som har tur, leser kortet høyt: «Nevn tre ting du finner i et kjøleskap.»")],
        [R.t("Trykk Start"), R.t("Klar, ferdig, gå! Lunta brenner, og du roper tre ting før tiden er ute.")],
        [R.t("Gjengen dømmer"), R.t("Klarte det? Trykk Ja eller Nei. Ja gir ett poeng – og flere på rad gir en rekke.")],
      ],
      tips: [
        R.t("Synes noen det var lett? Med «Utfordre» må de nevne tre nye på samme tid. Klarer de det, får de et bonuspoeng – hvis ikke, går bonusen til den som hadde tur."),
        R.t("Velg 10 sekunder når de yngste er med."),
        R.t("Ikke likt kortet? Sveip det bort eller trykk «Bytt kort»."),
        R.t("Trykket feil? «Angre» tar dommen tilbake."),
        R.t("Gjengen bestemmer hva som godtas. Er dere i tvil, er det et ja."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const rek = lesRekord();
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Nevn tre ting."))}<br><em>${esc(R.t("Du har fem sekunder."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · {lengde}", { lengde: lengdeTekst(S.spill).toLocaleLowerCase(R.lokale) }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [["2–20", R.t("spillere")], [String(ALLE.length), R.t("kort")], rek ? [String(rek), R.t("på rad (rekord)")] : ["0", R.t("reklame")]],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const poeng = o.maal === "poeng";
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.t("{n} valgt", { n: o.pakker.length }))}</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Hvor lenge?"))}</h2>
            ${R.ui.seg("maal", [["runder", R.t("Runder")], ["poeng", R.t("Først til")]], o.maal, { etikett: R.t("Hvor lenge?") })}
            <div class="femmer-teller">
              ${
                poeng
                  ? R.ui.teller("poengmaal", o.poengMaal, POENG[0], POENG[1], { vis: (v) => R.flertall(v, "poeng", "poeng"), minus: R.t("Færre poeng"), pluss: R.t("Flere poeng") })
                  : R.ui.teller("runder", o.runder, RUNDER[0], RUNDER[1], { vis: (v) => R.flertall(v, "runde", "runder"), minus: R.t("Færre runder"), pluss: R.t("Flere runder") })
              }
            </div>
            <p class="hjelp">${esc(poeng ? R.t("Den første som når {n} poeng, vinner.", { n: o.poengMaal }) : R.t("Alle har tur én gang i hver runde."))}</p>
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Tid"))}</h2>
            ${R.ui.seg("tid", TIDER.map((t) => [String(t), R.t("{n} s", { n: t })]), String(o.tid), { etikett: R.t("Tid") })}
            <p class="hjelp">${esc(o.tid === 10 ? R.t("Ti sekunder gir de yngste god tid.") : R.t("Fem sekunder er klassisk. Velg 10 s når de yngste er med."))}</p>
          </section>
          ${R.ui.bryter("utfordre-pa", o.utfordre, R.t("Utfordre"), R.t("Var det lett? Da må den som sier det, nevne tre til – for et bonuspoeng."))}
          ${R.ui.bryter("gividere", o.giVidere, R.t("Gi mobilen videre"), R.t("En egen skjerm mellom turene. Skru av hvis én holder mobilen."))}
          ${R.ui.spillere({ min: 2, max: 20 })}
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      tur: {
        tittel: (S) => (S.spill ? lengdeTekst(S.spill) : null),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = M.spiller(sp);
          const angre = sp.angre ? R.ui.lenke(`↶ ${R.t("Angre")}`, "angre", { id: "angre" }) : "";
          switch (sp.fase) {
            case "gi":
              return `
                <div class="femmer-gi">${R.ui.giTil({ i, h: "klar", tekst: R.t("Gi mobilen til"), knapp: R.t("Jeg er klar"), advarsel: R.t("Alle kan se kortet"), ikon: "👀" })}</div>`;
            case "klar":
              return `
                ${hvem(S, i, R.t("Din tur"))}
                ${kortet(S, { sveip: "bytt" })}
                <p class="sveip-hint" aria-hidden="true">← ${esc(R.t("Sveip for å bytte kort"))} →</p>
                ${R.ui.dokk(
                  R.ui.knapp(R.t("Start"), "tid-start", { variant: "stor", ikon: "⏱️" }),
                  R.ui.lenkerad(angre, R.ui.lenke(R.t("Bytt kort"), "bytt"), R.ui.lenke(R.t("Avslutt"), "slutt")),
                )}`;
            case "uklar":
              return `
                ${hvem(S, sp.utfordrer, R.t("Utfordring!"))}
                ${kortet(S, { klasse: "lampe", fot: R.t("Tre nye – ikke de samme som {navn} sa.", { navn: R.navn(sp.siste.i) }) })}
                ${R.ui.dokk(
                  R.ui.knapp(R.t("Start"), "tid-start", { variant: "stor", ikon: "⏱️" }),
                  R.ui.lenkerad(R.ui.lenke(R.t("Avbryt utfordringen"), "avbryt-utfordring")),
                )}`;
            case "tikker":
            case "utikker": {
              const u = sp.fase === "utikker";
              return `
                ${hvem(S, u ? sp.utfordrer : i, u ? R.t("Tre nye!") : R.t("Nevn tre!"))}
                ${kortet(S, { kompakt: true, klasse: u ? "lampe" : "" })}
                <div class="femmer-klokke">
                  ${R.ui.timer({ id: KLOKKE, sekunder: sp.tid, visning: "sek", alene: true })}
                  ${lunte(sp.tid)}
                </div>
                ${R.ui.dokk(R.ui.knapp(R.t("Ferdig!"), "tid-ferdig", { variant: "mynte" }))}`;
            }
            case "dom":
            case "udom": {
              const u = sp.fase === "udom";
              const hvemSom = u ? sp.utfordrer : i;
              return `
                <div class="femmer-dom">
                  <p class="etikett">${esc(u ? R.t("{navn} · utfordringen", { navn: R.navn(hvemSom) }) : R.navn(hvemSom))}</p>
                  <h1 id="skjerm-tittel">${esc(R.t("Klarte det?"))}</h1>
                </div>
                ${kortet(S, { kompakt: true, klasse: u ? "lampe" : "" })}
                <p class="femmer-dom-hjelp">${esc(u ? R.t("Tre nye ting – før tiden var ute?") : R.t("Tre ting – før tiden var ute?"))}</p>
                ${R.ui.dokk(
                  `<div class="knapprad femmer-janei">${R.ui.knapp(R.t("Ja"), "dom", { v: "ja", variant: "mynte", ikon: "👍" })}${R.ui.knapp(R.t("Nei"), "dom", { v: "nei", variant: "rod", ikon: "👎" })}</div>`,
                  R.ui.lenkerad(u ? "" : R.ui.lenke(R.t("Avslutt"), "slutt")),
                )}`;
            }
            case "utfordrer": {
              const andre = Array.from({ length: sp.antall }, (_, n) => n).filter((n) => n !== sp.siste.i);
              return `
                <section class="seksjon">
                  <h1 id="skjerm-tittel">${esc(R.t("Hvem utfordrer?"))}</h1>
                  <p class="hjelp">${esc(R.t("Den som synes det var lett, må nevne tre nye på {n} sekunder.", { n: sp.tid }))}</p>
                  ${R.ui.velgere("utfordrer", andre, null)}
                </section>
                ${R.ui.dokk(R.ui.lenkerad(R.ui.lenke(R.t("Avbryt utfordringen"), "avbryt-utfordring")))}`;
            }
            default:
              return resultatSkjerm(S);
          }
        },
        // Back from the home screen (or a reload) in the middle of a countdown: the card starts again.
        inn(S) {
          const sp = S.spill;
          if (sp && (sp.fase === "tikker" || sp.fase === "utikker")) {
            sp.fase = sp.fase === "tikker" ? "klar" : "uklar";
            R.vis();
          }
          R.holdVaken();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = M.rader(sp);
          const v = M.vinnere(sp);
          const lr = M.lengsteRekke(sp);
          const rek = lesRekord();
          const tittel = !v.length ? R.t("Ingen poeng denne gangen") : vinnerTekst(v);
          const tekst = !v.length
            ? R.t("Ingen klarte tre på tiden. Prøv 10 s neste gang!")
            : R.t("{turer} klart av {n}.", { turer: R.flertall(sp.klart, "tur", "turer"), n: sp.forsok });
          return `
            ${R.ui.banner({ klasse: "aksent", etikett: sp.maal === "poeng" ? R.t("Først til {n}", { n: sp.poengMaal }) : R.flertall(sp.runder, "runde", "runder"), tittel, tekst, stemning: v.length ? "jubel" : "" })}
            ${v.length ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${
              lr.n > 0
                ? `<div class="papirboks femmer-rekke">
                    <p class="etikett">${esc(R.t("Lengste rekke"))}</p>
                    <p class="femmer-rekke-tall"><b>${esc(lr.n)}</b> ${esc(R.t("på rad"))}</p>
                    <p>${esc(lr.hvem.length > 3 ? R.t("{n} spillere", { n: lr.hvem.length }) : R.ramsOpp(lr.hvem.map((i) => R.navn(i))))}${lr.n >= rek ? esc(R.t(" · rekord på denne mobilen")) : ""}</p>
                  </div>`
                : ""
            }
            ${v.length ? `<div class="femmer-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          if (M.vinnere(S.spill).length) {
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
        if (pagar(S)) R.gaTil("tur");
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const valgt = S.oppsett.pakker;
        S.oppsett.pakker = valgt.includes(id) ? valgt.filter((x) => x !== id) : [...valgt, id];
        R.vis();
      },
      maal(el, e, S) {
        S.oppsett.maal = el.dataset.v === "poeng" ? "poeng" : "runder";
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = R.klamp(S.oppsett.runder + Number(el.dataset.v), RUNDER[0], RUNDER[1]);
        R.vis();
      },
      poengmaal(el, e, S) {
        S.oppsett.poengMaal = R.klamp(S.oppsett.poengMaal + Number(el.dataset.v), POENG[0], POENG[1]);
        R.vis();
      },
      tid(el, e, S) {
        const t = Number(el.dataset.v);
        S.oppsett.tid = TIDER.includes(t) ? t : 5;
        R.vis();
      },
      "utfordre-pa"(el, e, S) {
        S.oppsett.utfordre = !S.oppsett.utfordre;
        R.vis();
      },
      gividere(el, e, S) {
        S.oppsett.giVidere = !S.oppsett.giVidere;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        const antall = R.klamp(S.antall || 4, 2, 20);
        S.spill = M.nyttSpill(o, antall, null);
        S.spill.kort = trekk(S.spill);
        R.statistikk("start", { spillere: antall, maal: o.maal, tid: o.tid, utfordre: o.utfordre, pakker: o.pakker.length, jul: o.pakker.includes("jul") });
        R.gaTil("tur");
        siTur(S);
      },
      // «Jeg er klar» on the pass-the-phone screen.
      klar(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "gi") return;
        S.spill.fase = "klar";
        R.gaTil("tur");
        siTur(S);
      },
      // Swap the card on the table (the link, or a swipe).
      async bytt(el, e, S) {
        if (!pagar(S) || S.spill.fase !== "klar") return;
        S.spill.angre = null;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        S.spill.kort = trekk(S.spill);
        R.vis();
        R.si(R.t("Nytt kort. {kort}.", { kort: kortTekst(S.spill.kort) }));
      },
      // «Start»: klar, ferdig, gå — then the fuse burns.
      async "tid-start"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !["klar", "uklar"].includes(sp.fase)) return;
        const u = sp.fase === "uklar";
        sp.angre = null;
        if (!(await R.nedtelling([R.t("Klar"), R.t("ferdig"), R.t("GÅ!")], 650))) return;
        if (!pagar(S) || sp.fase !== (u ? "uklar" : "klar")) return;
        sp.fase = u ? "utikker" : "tikker";
        R.vis();
        const fortsatt = R.vakt();
        new R.Timer({
          id: KLOKKE,
          sekunder: sp.tid,
          visning: "sek",
          vedSlutt: () => {
            if (fortsatt() && S.spill === sp && sp.fase === (u ? "utikker" : "tikker")) tilDom(S, false);
          },
        }).start();
      },
      // Done before the time ran out.
      "tid-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !["tikker", "utikker"].includes(sp.fase)) return;
        const t = R.timer(KLOKKE);
        if (t) t.stopp();
        R.lyd.pling();
        tilDom(S, true);
      },
      dom(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !["dom", "udom"].includes(sp.fase)) return;
        const ja = el.dataset.v === "ja";
        if (sp.fase === "udom") M.utfordringDom(sp, ja);
        else M.dom(sp, ja);
        if (ja) {
          R.lyd.riktig();
          R.vibrer([30, 40, 80]);
        } else R.lyd.feil();
        R.gaTil("tur");
        const s = sp.siste;
        if (s.u != null) R.si(R.t("+1 bonus til {navn}.", { navn: R.navn(M.bonusTil(s)) }));
        else R.si(ja ? R.t("+1 til {navn}.", { navn: R.navn(s.i) }) : R.t("Ingen poeng til {navn}.", { navn: R.navn(s.i) }));
      },
      utfordre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.kanUtfordre(sp)) return;
        sp.angre = null;
        if (sp.antall === 2) {
          sp.utfordrer = (sp.siste.i + 1) % 2;
          sp.fase = "uklar";
        } else sp.fase = "utfordrer";
        R.lyd.trommevirvel(0.4);
        R.gaTil("tur");
      },
      utfordrer(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!pagar(S) || sp.fase !== "utfordrer" || !(i >= 0 && i < sp.antall) || i === sp.siste.i) return;
        sp.utfordrer = i;
        sp.fase = "uklar";
        R.gaTil("tur");
        R.si(R.t("{navn} utfordrer. Tre nye ting: {kort}.", { navn: R.navn(i), kort: ALLE[sp.kort].t }));
      },
      "avbryt-utfordring"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !["utfordrer", "uklar"].includes(sp.fase)) return;
        sp.utfordrer = null;
        sp.fase = "resultat";
        R.gaTil("tur");
      },
      // From the result: the next turn, or Kåringen.
      videre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "resultat") return;
        lagreRekord(sp);
        if (M.erFerdig(sp)) return tilSlutt(S);
        M.nesteTur(sp, trekk(sp));
        R.gaTil("tur");
        if (sp.fase === "klar") siTur(S);
      },
      // Take back the last judgement (from the result, or the next turn before «Start»).
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.angre || !["resultat", "klar", "gi"].includes(sp.fase)) return;
        const navn = R.navn(sp.siste ? sp.siste.i : M.spiller(sp.angre));
        M.angre(sp);
        R.lyd.snu();
        R.gaTil("tur");
        R.toast(R.t("Angret dommen over {navn}", { navn }));
      },
      async slutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere går rett til kåringen. Den med flest poeng vinner."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !pagar(S)) return;
        tilSlutt(S, true);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const v = M.vinnere(sp);
        if (!v.length) return;
        const topp = M.rader(sp)
          .filter((r) => r.poeng > 0)
          .sort((a, b) => b.poeng - a.poeng)
          .slice(0, 3)
          .map((r) => `${R.navn(r.i)}: ${R.flertall(r.poeng, "poeng", "poeng")}`);
        const lr = M.lengsteRekke(sp);
        const vinner = vinnerTekst(v);
        const linjer = [vinner, ...topp, ...(lr.n >= 2 ? [R.t("Lengste rekke: {n} på rad", { n: lr.n })] : [])];
        R.del(R.app.navn, [R.t("{navn} – tre ting på fem sekunder ⏱️", { navn: R.app.navn }), ...linjer].join("\n"), ADRESSE, {
          kort: { tittel: R.app.navn, linjer },
        });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });

  // «A wins!», «A and B win!» (English verbs agree), «5 players win!»
  function vinnerTekst(v) {
    if (v.length > 3) return R.t("{n} spillere vinner!", { n: v.length });
    return R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(v.map((i) => R.navn(i))), n: v.length });
  }

  // Time is up (or the player said «Ferdig!»): the group judges.
  function tilDom(S, tidlig) {
    const sp = S.spill;
    const u = sp.fase === "utikker";
    sp.fase = u ? "udom" : "dom";
    R.gaTil("tur");
    const navn = R.navn(u ? sp.utfordrer : M.spiller(sp));
    R.si(tidlig ? R.t("Ferdig! Klarte {navn} det?", { navn }) : R.t("Tiden er ute! Klarte {navn} det?", { navn }));
  }
})();
