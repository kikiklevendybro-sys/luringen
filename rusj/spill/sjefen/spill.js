/* Sjefen — «Drikkelek med navnene deres» (a task deck with the players' names, 18+).
   The phone deals a deck of cards that speak to the players by name: tasks, «everyone who …»,
   duels, categories, «drink or do», pointing votes, and rules that last a few cards until a card
   lifts them again. Every game is planned up front: the cards for this evening (fresh ones first),
   a water card after every tenth card, the end of each rule a few cards after it starts (at most
   two at a time), and a last card that thanks the group.
   Responsible by design: small sips only (never more than three on a card), alcohol-free counts
   the same, everyone may pass, and every «drink or do» card has a choice without drinking.
   The deck and the names at the top are pure functions; test/sjefen.test.mjs loads this file
   without the kit. */
(function () {
  "use strict";

  // ---------- The deck (no kit needed) ----------

  const PLASS = /\{([abc])\}/g;
  const BOKSTAVER = ["a", "b", "c"];
  const TYPER = ["oppgave", "alle", "duell", "kategori", "valg", "regel", "pek"];
  const VANN_HVERT = 10; // a water card after every tenth card
  const MAKS_REGLER = 2; // rules running at the same time
  const VARIGHET = [4, 7]; // a rule lasts this many cards (both included)

  // A card in the data is a text (a task) or { t, type, slutt }.
  const kortAv = (k) => (typeof k === "string" ? { t: k, type: "oppgave" } : Object.assign({ type: "oppgave" }, k));
  // How many players a text names: {a} → 1, {a} {b} → 2, {a} {b} {c} → 3.
  function trengs(tekst) {
    let n = 0;
    String(tekst).replace(PLASS, (_, x) => {
      n = Math.max(n, BOKSTAVER.indexOf(x) + 1);
      return _;
    });
    return n;
  }

  function bland(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // The n players named least so far (ties at random), in random order: everyone gets their turn.
  function velgSpillere(antall, n, telling, rng) {
    const rekke = Array.from({ length: antall }, (_, i) => [Number((telling || [])[i]) || 0, rng(), i]);
    rekke.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return bland(rekke.slice(0, Math.min(n, antall)).map((x) => x[2]), rng);
  }

  // A text split into pieces: strings and player indexes ({a} → hvem[0] …).
  function deler(tekst, hvem) {
    const ut = [];
    let fra = 0;
    String(tekst).replace(PLASS, (hele, x, pos) => {
      if (pos > fra) ut.push(tekst.slice(fra, pos));
      ut.push(hvem[BOKSTAVER.indexOf(x)]);
      fra = pos + hele.length;
      return hele;
    });
    if (fra < tekst.length) ut.push(tekst.slice(fra));
    return ut;
  }
  // The text with the names put in (navn: index → name).
  const fyll = (tekst, hvem, navn) => deler(tekst, hvem).map((d) => (typeof d === "number" ? navn(d) : d)).join("");

  // The evening's plan. kort: the chosen cards in order; erRegel(k): does card k start a rule.
  // Steps: { k } a card, { s: j } the end of the rule that step j started, { v: 1 } a water card,
  // { f: 1 } the last card. At most MAKS_REGLER rules at a time; a rule never starts so late that
  // it could not last; every rule ends before the last card.
  function planlegg(kort, o) {
    const erRegel = o.erRegel;
    const rng = o.rng;
    const vannHvert = o.vannHvert || VANN_HVERT;
    const maks = o.maksRegler || MAKS_REGLER;
    const [kortest, lengst] = o.varighet || VARIGHET;
    const ko = kort.slice();
    // A rule near the end could not last: move it to a random place among the earlier cards.
    const hale = Math.min(ko.length, lengst * 2);
    const forHale = ko.length - hale;
    for (let i = forHale; i < ko.length && forHale > 0; i++) {
      if (!erRegel(ko[i])) continue;
      for (let forsok = 0; forsok < 20; forsok++) {
        const j = Math.floor(rng() * forHale);
        if (erRegel(ko[j])) continue;
        [ko[i], ko[j]] = [ko[j], ko[i]];
        break;
      }
    }
    const plan = [];
    const aktive = []; // { j: the step that started it, slutt: the card count when it ends }
    let n = 0;
    while (ko.length) {
      const forfalt = aktive.findIndex((a) => a.slutt <= n);
      if (forfalt >= 0) {
        plan.push({ s: aktive.splice(forfalt, 1)[0].j });
        continue;
      }
      let i = 0;
      if (aktive.length >= maks) {
        i = ko.findIndex((k) => !erRegel(k));
        if (i < 0) {
          // only rules left: end the oldest one now, the next rule can take its place
          plan.push({ s: aktive.shift().j });
          continue;
        }
      }
      const k = ko.splice(i, 1)[0];
      if (erRegel(k) && ko.length < kortest) continue; // too late for a rule to last
      plan.push({ k });
      n += 1;
      if (erRegel(k)) aktive.push({ j: plan.length - 1, slutt: n + kortest + Math.floor(rng() * (lengst - kortest + 1)) });
      if (n % vannHvert === 0 && ko.length) plan.push({ v: 1 });
    }
    for (const a of aktive) plan.push({ s: a.j });
    plan.push({ f: 1 });
    return plan;
  }

  const R = window.Rusj;
  if (!R) {
    window.Sjefen = { trengs, velgSpillere, deler, fyll, planlegg, kortAv, bland, TYPER, VANN_HVERT, MAKS_REGLER, VARIGHET };
    return;
  }

  // ---------- The game ----------

  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const ALLE = [];
  PAKKER.forEach((p) => p.kort.forEach((k) => ALLE.push(Object.assign(kortAv(k), { p: p.id }))));
  const stokk = R.kortstokk("kort", ALLE.length);
  const LENGDER = [30, 50, 80];
  const MIN = 3;
  const MAKS = 16;
  const SIST = "sjefen.sist";
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "sjefen") + "/";

  const TYPE = {
    oppgave: { ikon: "👉", navn: R.t("Oppgave") },
    alle: { ikon: "🙌", navn: R.t("Alle") },
    duell: { ikon: "⚔️", navn: R.t("Duell") },
    kategori: { ikon: "📚", navn: R.t("Kategori") },
    valg: { ikon: "🎲", navn: R.t("Drikk eller gjør") },
    regel: { ikon: "📜", navn: R.t("Ny regel") },
    pek: { ikon: "☝️", navn: R.t("Pek!") },
  };

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const steg = (sp) => sp.plan[sp.pos] || { f: 1 };
  const antallKort = (sp) => sp.plan.filter((x) => x.k != null).length;

  let H; // the actions, so one action can reuse another

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS);
  }

  // Two glasses that clink and a water glass (drawn for the dark background).
  const GLASS =
    '<svg class="sj-glass" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
    '<g class="sj-glass-v"><path d="M10 14 L26 14 L24 40 Q23.5 44 20 44 L16 44 Q12.5 44 12 40 Z" fill="rgba(255,241,221,.12)" stroke="var(--papir)" stroke-width="2.6" stroke-linejoin="round"/><path d="M11.3 22 L24.7 22 L23.4 39.5 Q23 42 20 42 L16 42 Q13 42 12.6 39.5 Z" fill="var(--lampe)"/><path d="M18 44 V54 M12 55 H24" stroke="var(--papir)" stroke-width="2.6" stroke-linecap="round"/></g>' +
    '<g class="sj-glass-h"><path d="M38 14 L54 14 L52 40 Q51.5 44 48 44 L44 44 Q40.5 44 40 40 Z" fill="rgba(255,241,221,.12)" stroke="var(--papir)" stroke-width="2.6" stroke-linejoin="round"/><path d="M39.3 22 L52.7 22 L51.4 39.5 Q51 42 48 42 L44 42 Q41 42 40.6 39.5 Z" fill="var(--aksent)"/><path d="M46 44 V54 M40 55 H52" stroke="var(--papir)" stroke-width="2.6" stroke-linecap="round"/></g>' +
    "</svg>";
  const VANNGLASS = `
    <svg class="sj-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
      <defs><clipPath id="sj-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
      <g clip-path="url(#sj-glass-innside)">
        <path class="sj-vannflate" d="M0 70 Q15 62 30 70 T60 70 T90 70 T120 70 T150 70 V160 H0 Z" fill="var(--himmel)"/>
        <circle class="sj-boble" cx="50" cy="120" r="4" fill="#fff" opacity=".7"/>
        <circle class="sj-boble to" cx="70" cy="128" r="3" fill="#fff" opacity=".6"/>
      </g>
      <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
      <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
    </svg>`;

  function klirr() {
    R.lyd.tone(2637, 0, 0.32, "sine", 0.12);
    R.lyd.tone(3520, 0.015, 0.4, "sine", 0.07);
    R.lyd.tone(1760, 0.03, 0.25, "triangle", 0.05);
  }

  // ---------- Names on the cards ----------

  // The card's text with the names in bold (escaped piece by piece).
  const tekstHtml = (tekst, hvem) =>
    deler(tekst, hvem)
      .map((d) => (typeof d === "number" ? `<b class="sj-navn">${esc(R.navn(d))}</b>` : esc(d)))
      .join("");
  const tekstRen = (tekst, hvem) => fyll(tekst, hvem, (i) => R.navn(i));

  // Names for the card on the screen now (kept in the state, so a reload shows the same names).
  function delUtNavn(sp) {
    const x = steg(sp);
    let tekst = null;
    if (x.k != null) tekst = ALLE[x.k].t;
    else if (x.f) tekst = D.finale[sp.finale % D.finale.length];
    if (tekst == null) return;
    const hvem = velgSpillere(sp.antall, trengs(tekst), sp.telling, Math.random);
    hvem.forEach((i) => (sp.telling[i] = (sp.telling[i] || 0) + 1));
    sp.hvem = hvem;
    if (x.k != null && ALLE[x.k].type === "regel") sp.regelNavn[sp.pos] = hvem;
  }

  // The rules in force: started before this step and not ended yet (step index → card).
  function aktiveRegler(sp) {
    const slutt = new Set(sp.plan.slice(0, sp.pos + 1).filter((x) => x.s != null).map((x) => x.s));
    const ut = [];
    sp.plan.slice(0, sp.pos).forEach((x, j) => {
      if (x.k != null && ALLE[x.k].type === "regel" && !slutt.has(j)) ut.push(j);
    });
    return ut;
  }

  function nyttSpill(S) {
    const o = S.oppsett;
    const antall = R.klamp(S.antall || 4, MIN, MAKS);
    const valgt = new Set(o.pakker);
    const tatt = new Set();
    const kort = [];
    for (let n = 0; n < o.lengde; n++) {
      const k = stokk.neste((i) => valgt.has(ALLE[i].p) && trengs(ALLE[i].t) <= antall && !tatt.has(i));
      if (k < 0 || tatt.has(k)) break;
      tatt.add(k);
      kort.push(k);
    }
    const plan = planlegg(kort, { erRegel: (k) => ALLE[k].type === "regel", rng: Math.random });
    S.spill = {
      antall,
      pakker: o.pakker.slice(),
      lengde: o.lengde,
      plan,
      pos: 0,
      hvem: [],
      telling: Array(antall).fill(0),
      regelNavn: {},
      finale: R.heltall(0, D.finale.length - 1),
      ferdig: false,
    };
    delUtNavn(S.spill);
    R.statistikk("start", { spillere: antall, pakker: o.pakker.length, kort: kort.length });
  }

  // What the evening came to (also when it ends early).
  function telling(sp) {
    const vist = sp.plan.slice(0, sp.pos + 1);
    return {
      kort: vist.filter((x) => x.k != null).length,
      regler: vist.filter((x) => x.k != null && ALLE[x.k].type === "regel").length,
      vann: vist.filter((x) => x.v).length,
    };
  }

  function avslutt(S, helt) {
    const sp = S.spill;
    sp.ferdig = true;
    const t = telling(sp);
    R.skriv(SIST, t);
    R.statistikk("ferdig", { kort: t.kort, regler: t.regler, helt: !!helt });
    R.gaTil("slutt");
  }

  function sistLinje() {
    const s = R.les(SIST, null);
    if (!s || !Number.isInteger(s.kort) || s.kort < 1 || !Number.isInteger(s.regler) || s.regler < 0) return "";
    return R.t("Sist: {kort} og {regler}.", { kort: R.flertall(s.kort, "kort", "kort"), regler: R.flertall(s.regler, "regel", "regler") });
  }

  function delTekst(sp) {
    const t = telling(sp);
    return R.t("{spill}: {kort}, {regler} og {vann} i kveld. Skål for gjengen!", {
      spill: R.app.navn,
      kort: R.flertall(t.kort, "kort", "kort"),
      regler: R.flertall(t.regler, "regel", "regler"),
      vann: R.flertall(t.vann, "vannkort", "vannkort"),
    });
  }

  // ---------- Screens ----------

  function kortSkjerm(S) {
    const sp = S.spill;
    const x = steg(sp);
    const nr = sp.plan.slice(0, sp.pos + 1).filter((y) => y.k != null).length;
    const total = antallKort(sp);
    const regler = aktiveRegler(sp);
    const fot = `<p class="sj-fot-linje"><span aria-hidden="true">🥤</span> ${esc(R.t("Alkoholfritt teller like mye · alle kan stå over"))}</p>`;
    const avsluttLenke = R.ui.lenke(R.t("Avslutt"), "avslutt");

    if (x.v) {
      return `
        <div class="sj-vann">
          ${VANNGLASS}
          <p class="etikett">${esc(R.t("Vannkort · etter {n} kort", { n: nr }))}</p>
          <h1 id="skjerm-tittel">${esc(R.t("Alle tar en slurk vann!"))}</h1>
          <p class="ingress">${esc(R.t("Skål i vann – kroppen takker, og kvelden varer lenger."))}</p>
        </div>
        ${R.ui.dokk(R.ui.knapp(R.t("Skål i vann!"), "neste", { variant: "himmel", ikon: "💧" }), R.ui.lenkerad(avsluttLenke))}`;
    }

    let etikett;
    let tekst;
    let klasse;
    let hvem = sp.hvem;
    if (x.s != null) {
      const regel = ALLE[sp.plan[x.s].k];
      etikett = `✅ ${R.t("Regelen er over")}`;
      tekst = regel.slutt || "";
      hvem = sp.regelNavn[x.s] || [];
      klasse = "sj-slutt";
    } else if (x.f) {
      etikett = `🏁 ${R.t("Siste kort")}`;
      tekst = D.finale[sp.finale % D.finale.length];
      klasse = "sj-finale";
    } else {
      const k = ALLE[x.k];
      const ty = TYPE[k.type] || TYPE.oppgave;
      etikett = `${ty.ikon} ${ty.navn}`;
      tekst = k.t;
      klasse = `sj-${k.type}`;
    }
    const lengde = tekstRen(tekst, hvem).length;
    const storrelse = lengde > 120 ? "sj-lang" : lengde > 70 ? "sj-mid" : "sj-kort";
    const pakkeIkon = x.k != null ? pakke(ALLE[x.k].p).ikon : "";
    const reglerKnapp = regler.length
      ? `<button class="sj-regler" data-h="regler-na"><span aria-hidden="true">📜</span><span class="sj-regler-tekst">${esc(R.t("Gjelder nå: {n} regel|Gjelder nå: {n} regler", { n: regler.length }))}</span><span aria-hidden="true">›</span></button>`
      : "";
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(x.f ? R.t("Siste kort") : R.t("Kort {n} av {total}", { n: nr, total }))}</h1>
      ${reglerKnapp}
      ${R.ui.storkort({
        etikett,
        nr: x.k != null ? `${pakkeIkon} ${nr}/${total}` : "",
        tekstHtml: tekstHtml(tekst, hvem),
        lengde,
        klasse: `sj ${klasse} ${storrelse}`,
        sveip: "neste",
        id: "sj-kort",
      })}
      ${fot}
      ${R.ui.dokk(
        x.f ? R.ui.knapp(R.t("Til kåringen"), "neste", { variant: "stor", ikon: "🥂" }) : R.ui.knapp(R.t("Neste kort"), "neste", { variant: "stor" }),
        x.f ? "" : R.ui.lenkerad(avsluttLenke),
      )}`;
  }

  R.start({
    id: "sjefen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: { pakker: PAKKER.filter((p) => !p.av).map((p) => p.id), lengde: 50 },
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      const o = (S.oppsett = Object.assign({ pakker: [], lengde: 50 }, S.oppsett || {}));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = PAKKER.filter((p) => !p.av).map((p) => p.id);
      if (!LENGDER.includes(o.lengde)) o.lengde = 50;
      const sp = S.spill;
      if (sp) {
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < sp.antall;
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= MIN && sp.antall <= MAKS &&
          Array.isArray(sp.plan) && sp.plan.length > 0 &&
          sp.plan.every((x) => x && ((Number.isInteger(x.k) && !!ALLE[x.k]) || x.v === 1 || x.f === 1 || (Number.isInteger(x.s) && sp.plan[x.s] && ALLE[sp.plan[x.s].k]))) &&
          Number.isInteger(sp.pos) && sp.pos >= 0 && sp.pos < sp.plan.length &&
          Array.isArray(sp.hvem) && sp.hvem.every(spiller) &&
          Array.isArray(sp.telling) && sp.regelNavn && typeof sp.regelNavn === "object" &&
          Object.values(sp.regelNavn).every((l) => Array.isArray(l) && l.every(spiller));
        if (!ok) S.spill = null;
        else {
          sp.finale = Number.isInteger(sp.finale) && sp.finale >= 0 ? sp.finale : 0;
          sp.pakker = (Array.isArray(sp.pakker) ? sp.pakker : []).filter((id) => pakke(id));
          // A card whose names went missing (the text needs more players than were picked) gets new ones.
          const x = sp.plan[sp.pos];
          const tekst = x.k != null ? ALLE[x.k].t : x.f ? D.finale[sp.finale % D.finale.length] : "";
          if (sp.hvem.length < trengs(tekst)) delUtNavn(sp);
        }
      }
      if (S.skjerm === "kort" && !pagar(S)) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Mobilen deler ut kort med navnene deres på. Les kortet høyt og gjør som det sier. Bare små slurker – og alkoholfritt teller like mye."),
      steg: [
        [R.t("Skriv inn navnene"), R.t("Navnene dukker opp på kortene, og mobilen passer på at alle får sin tur.")],
        [R.t("Les høyt og gjør det"), R.t("Oppgaver, dueller, kategorier, «pek!» og «drikk eller gjør». Ingen kort gir mer enn tre små slurker.")],
        [R.t("Regler som varer"), R.t("Noen kort lager en regel. Den gjelder til et senere kort opphever den. Trykk på «Gjelder nå» for å se reglene.")],
      ],
      tips: [
        R.t("Alkoholfritt teller like mye, og alle kan stå over – uten å forklare seg."),
        R.t("«Drikk eller gjør»-kortene har alltid et valg uten drikke."),
        R.t("Hvert tiende kort er et vannkort. Da tar alle en slurk vann."),
        R.t("Sveip kortet til siden for å gå videre."),
        R.t("Spis og drikk vann underveis, og sørg for trygg vei hjem."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sist = !pagar(S) ? sistLinje() : "";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Kortene bestemmer – med navnene deres."))}<br><em>${esc(R.t("Del ut, skål og gjør utfordringer."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · kort {n}", { n: Math.max(1, telling(S.spill).kort) }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (sist ? `<p class="hjelp sj-sist">${esc(sist)}</p>` : ""),
            }),
            merker: [
              [`${MIN}–${MAKS}`, R.t("spillere")],
              [String(ALLE.length), R.t("kort")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const iPakkene = PAKKER.filter((p) => o.pakker.includes(p.id)).reduce((s, p) => s + p.kort.length, 0);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.flertall(iPakkene, "kort", "kort"))}</span></div>
              ${R.ui.fliser(
                "pakke",
                PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
                o.pakker,
              )}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor lenge?"))}</h2></div>
              ${R.ui.seg("lengde", LENGDER.map((n) => [String(n), R.flertall(n, "kort", "kort")]), String(o.lengde), { etikett: R.t("Hvor lenge?") })}
            </section>
            ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Navnene dukker opp på kortene.") })}
            <div class="papirboks sj-vett">
              <p class="etikett">${esc(R.t("Slik er slurkene"))}</p>
              <ul class="tips">
                <li>${esc(R.t("En slurk er en liten slurk – aldri mer."))}</li>
                <li>${esc(R.t("Alkoholfritt teller like mye, og alle kan stå over."))}</li>
                <li>${esc(R.t("«Drikk eller gjør» har alltid et valg uten drikke."))}</li>
                <li>${esc(R.t("Hvert tiende kort er et vannkort."))}</li>
              </ul>
            </div>
            ${R.ui.dokk(o.pakker.length ? "" : `<p class="hjelp">${esc(R.t("Velg minst én pakke."))}</p>`, R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel: (S) => {
          const sp = S.spill;
          if (steg(sp).v) return R.t("Vannkort");
          return R.t("Kort {n} av {total}", { n: Math.max(1, telling(sp).kort), total: antallKort(sp) });
        },
        tilbake: "hjem",
        vis: kortSkjerm,
        inn(S) {
          R.holdVaken();
          const x = steg(S.spill);
          if (x.v) {
            R.lyd.pop();
            R.vibrer(20);
          }
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = telling(sp);
          return `
            ${R.ui.banner({
              klasse: "aksent sj-banner",
              etikett: R.t("Takk for i kveld"),
              tittel: R.t("Skål for gjengen!"),
              tekst: t.kort >= antallKort(sp) ? R.t("Dere kom gjennom hele bunken.") : R.t("Dere stoppet etter {kort}.", { kort: R.flertall(t.kort, "kort", "kort") }),
            })}
            ${R.ui.merker([
              [String(t.kort), R.t("kort|kort", { n: t.kort })],
              [String(t.regler), R.t("regel|regler", { n: t.regler })],
              [String(t.vann), R.t("vannkort|vannkort", { n: t.vann })],
            ])}
            <div class="sj-del">${R.ui.knapp2(R.t("Del kvelden"), "del")}</div>
            <p class="hjelp sj-hjem">💧 ${esc(R.t("Husk vann, mat og trygg vei hjem."))}</p>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn() {
          klirr();
          R.vibrer([40, 30, 90]);
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
      endre(el, e, S) {
        S.spill = null;
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("kort");
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      lengde(el, e, S) {
        const n = Number(el.dataset.v);
        if (LENGDER.includes(n)) S.oppsett.lengde = n;
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        nyttSpill(S);
        R.gaTil("kort");
      },
      // Next card: from the button (the card flies out first) or a swipe (it has already flown).
      async neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const pos = sp.pos;
        if (!(el && el.classList && el.classList.contains("storkort")) && !steg(sp).v) await R.kastKort(-1);
        if (!fortsatt() || S.spill !== sp || sp.pos !== pos) return;
        if (steg(sp).f) {
          avslutt(S, true);
          return;
        }
        sp.pos += 1;
        delUtNavn(sp);
        const x = steg(sp);
        if (x.s != null) R.lyd.pling();
        else if (x.k != null && ALLE[x.k].type === "regel") {
          R.lyd.pop();
          R.vibrer(15);
        } else if (!x.v) R.lyd.snu();
        R.vis();
        window.scrollTo(0, 0);
        if (x.v) {
          R.lyd.pop();
          R.vibrer(20);
          R.si(R.t("Alle tar en slurk vann!"));
        } else {
          const tekst = x.s != null ? ALLE[sp.plan[x.s].k].slutt : x.f ? D.finale[sp.finale % D.finale.length] : ALLE[x.k].t;
          R.si(tekstRen(tekst || "", x.s != null ? sp.regelNavn[x.s] || [] : sp.hvem));
        }
      },
      "regler-na"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const rader = aktiveRegler(sp).map((j) => `<li><span aria-hidden="true">📜</span><span>${tekstHtml(ALLE[sp.plan[j].k].t, sp.regelNavn[j] || [])}</span></li>`);
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Gjelder nå"))}</h2>
          ${rader.length ? `<ul class="sj-regelliste">${rader.join("")}</ul>` : `<p class="ingress">${esc(R.t("Ingen regler akkurat nå."))}</p>`}
          <p class="hjelp">${esc(R.t("Et senere kort opphever regelen."))}</p>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Spill videre"))}</button>`);
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        if (telling(sp).kort <= 1) {
          if ((await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"))) && fortsatt() && S.spill === sp) {
            S.spill = null;
            R.gaTil("hjem");
          }
          return;
        }
        if (!(await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"))) || !fortsatt() || S.spill !== sp) return;
        avslutt(S, false);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const t = telling(sp);
        R.del(R.app.navn, delTekst(sp), ADRESSE, {
          kort: { tittel: R.app.navn, linjer: [R.flertall(t.kort, "kort", "kort"), R.flertall(t.regler, "regel", "regler"), R.flertall(t.vann, "vannkort", "vannkort")] },
        });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
