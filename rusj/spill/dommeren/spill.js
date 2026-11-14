/* Dommeren — «Fyll inn det som mangler».
   A question card with a gap is read out by the round's judge. The phone goes round: everyone
   else, alone behind a hand screen, picks the funniest answer card from their own five. The judge
   reads every filled-in sentence out loud – without knowing who wrote what – and crowns the best
   one: a point to its owner. Then everyone fills up to five cards again and the next one round
   the table is the judge. First to 3, 5 or 7 points wins Kåringen.

   Two packs of our own: «Familie» (for all ages) and «Fest» (a bit cheekier, id «voksen»). The adult pack
   sits behind the same 18+ question as the drinking games (R.felles.over18).

   The rules (deck, hands, the round, undo) are pure functions on window.RusjDommer with a seeded
   random function, so test/dommeren.test.mjs is deterministic. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const HAND = 5;
  const MAAL = [3, 5, 7];
  const HULL = "___";
  const FASER = ["kort", "velg", "dom", "resultat"];

  function stokk(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // A small seeded random function (mulberry32), for the tests and for R.rng-less loading.
  function rngFra(fro) {
    let a = fro >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const M = {
    HAND,
    MAAL,
    HULL,
    FASER,
    stokk,
    rngFra,
    // The sentence with the answer in the gap: [before, answer, after]. An answer that starts a
    // sentence gets a capital letter; a full stop at the end of the answer is never doubled.
    fyll(sporsmal, svar) {
      const i = sporsmal.indexOf(HULL);
      const for_ = sporsmal.slice(0, i);
      let etter = sporsmal.slice(i + HULL.length);
      let s = String(svar);
      if (!for_.trim() || /[.!?]\s+$/.test(for_)) s = s.charAt(0).toLocaleUpperCase() + s.slice(1);
      if (/[.!?]$/.test(s) && /^[.!?]/.test(etter)) etter = etter.slice(1);
      return [for_, s, etter];
    },
    // A new game. svarIder: the answer cards of the chosen packs; forste: the first question.
    nyttSpill(o, antall, rng, svarIder, forste) {
      const sp = {
        antall,
        pakker: o.pakker.slice(),
        maal: MAAL.includes(o.maal) ? o.maal : 5,
        poeng: Array(antall).fill(0),
        dommer: Math.floor(rng() * antall),
        runde: 1,
        sporsmal: forste,
        bunke: stokk(svarIder, rng),
        kast: [],
        hender: [],
        fase: "kort",
        rekke: [],
        na: 0,
        lagt: Array(antall).fill(-1),
        valg: [],
        valgt: -1, // on the hand screen: the card marked; on the judge's screen: the option marked
        vinner: -1,
        beste: [], // [{ s: question, a: answer, i: player }] the winning sentences
        ferdig: false,
      };
      for (let i = 0; i < antall; i++) sp.hender.push([]);
      M.fyllOpp(sp, rng);
      return sp;
    },
    // Take the top card; an empty pile is the discards, shuffled.
    trekk(sp, rng) {
      if (!sp.bunke.length) {
        sp.bunke = stokk(sp.kast, rng);
        sp.kast = [];
      }
      return sp.bunke.length ? sp.bunke.pop() : -1;
    },
    fyllOpp(sp, rng) {
      for (const h of sp.hender)
        while (h.length < HAND) {
          const k = M.trekk(sp, rng);
          if (k < 0) break;
          h.push(k);
        }
    },
    // Everyone but the judge, starting with the one after the judge.
    spillere: (sp) => Array.from({ length: sp.antall - 1 }, (_, k) => (sp.dommer + 1 + k) % sp.antall),
    // The phone goes round.
    startVelg(sp) {
      if (sp.fase !== "kort") return false;
      sp.fase = "velg";
      sp.rekke = M.spillere(sp);
      sp.na = 0;
      sp.valgt = -1;
      sp.lagt = Array(sp.antall).fill(-1);
      return true;
    },
    paTur: (sp) => (sp.fase === "velg" ? sp.rekke[sp.na] : sp.dommer),
    // The player on the hand screen plays card number k of the hand. Returns "neste" or "dom".
    legg(sp, k, rng) {
      if (sp.fase !== "velg") return null;
      const i = sp.rekke[sp.na];
      const h = sp.hender[i];
      if (!(Number.isInteger(k) && k >= 0 && k < h.length)) return null;
      sp.lagt[i] = h.splice(k, 1)[0];
      sp.na += 1;
      sp.valgt = -1;
      if (sp.na < sp.rekke.length) return "neste";
      sp.fase = "dom";
      sp.valg = stokk(sp.rekke, rng);
      return "dom";
    },
    // Take back the last card played (before the judge has seen anything).
    angreLegg(sp) {
      if (sp.fase !== "velg" || sp.na <= 0) return false;
      sp.na -= 1;
      const i = sp.rekke[sp.na];
      sp.hender[i].push(sp.lagt[i]);
      sp.lagt[i] = -1;
      sp.valgt = -1;
      return true;
    },
    // The judge crowns option v (an index into sp.valg).
    kar(sp, v) {
      if (sp.fase !== "dom" || !(Number.isInteger(v) && v >= 0 && v < sp.valg.length)) return false;
      const i = sp.valg[v];
      sp.vinner = i;
      sp.poeng[i] += 1;
      sp.beste.push({ s: sp.sporsmal, a: sp.lagt[i], i });
      sp.fase = "resultat";
      sp.valgt = -1;
      return true;
    },
    angreKar(sp) {
      if (sp.fase !== "resultat" || sp.vinner < 0) return false;
      sp.poeng[sp.vinner] = Math.max(0, sp.poeng[sp.vinner] - 1);
      sp.beste.pop();
      sp.vinner = -1;
      sp.fase = "dom";
      return true;
    },
    erFerdig: (sp) => sp.poeng.some((p) => p >= sp.maal),
    // Cards played go to the discards, hands are filled up, the next one judges.
    nesteRunde(sp, rng, sporsmal) {
      sp.lagt.forEach((k) => {
        if (k >= 0) sp.kast.push(k);
      });
      sp.lagt = Array(sp.antall).fill(-1);
      M.fyllOpp(sp, rng);
      sp.dommer = (sp.dommer + 1) % sp.antall;
      sp.runde += 1;
      sp.sporsmal = sporsmal;
      sp.fase = "kort";
      sp.valg = [];
      sp.vinner = -1;
      sp.valgt = -1;
      sp.rekke = [];
      sp.na = 0;
    },
    rader: (sp) => sp.poeng.map((poeng, i) => ({ i, poeng })),
    vinnere(sp) {
      const topp = Math.max(0, ...sp.poeng);
      return topp > 0 ? sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    },
  };
  window.RusjDommer = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;
  const SP = []; // questions { p, t }
  const SV = []; // answers { p, t }
  D.pakker.forEach((p) => {
    p.sporsmal.forEach((t) => SP.push({ p: p.id, t }));
    p.svar.forEach((t) => SV.push({ p: p.id, t }));
  });
  const pakke = (id) => D.pakker.find((p) => p.id === id);
  const voksen = (id) => !!(pakke(id) && pakke(id).voksen);
  const STANDARD = D.pakker.filter((p) => !p.voksen).map((p) => p.id);
  const OPPSETT = () => ({ pakker: STANDARD.slice(), maal: 5 });
  const sporsmalene = R.kortstokk("sporsmal", SP.length);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const navneliste = (indekser) => R.ramsOpp(indekser.map((i) => R.navn(i)));
  const vinnerTekst = (v) => (v.length > 3 ? R.t("{n} spillere vinner!", { n: v.length }) : R.t("{navn} vinner!|{navn} vinner!", { navn: navneliste(v), n: v.length }));
  // Which screen shows each phase; the private hand is never resumed directly.
  const SKJERM_FOR = { kort: "kort", velg: "gi", dom: "gi", resultat: "resultat" };
  const rng = () => Math.random();
  let H;
  let feire = false;

  function nyttSporsmal(pakker) {
    const valgt = new Set(pakker);
    let i = sporsmalene.neste((n) => valgt.has(SP[n].p));
    if (i < 0) i = sporsmalene.neste();
    return i;
  }
  const svarIder = (pakker) => SV.map((s, i) => (pakker.includes(s.p) ? i : -1)).filter((i) => i >= 0);
  const tittel = (S) => (S.spill ? R.t("Runde {n}", { n: S.spill.runde }) : null);

  // A question with a gap, or with an answer in it.
  function setning(sp, svar, o = {}) {
    const t = SP[sp.sporsmal].t;
    if (svar == null) {
      const i = t.indexOf(M.HULL);
      return `${esc(t.slice(0, i))}<span class="dom-hull"><span class="vh">${esc(R.t("tomt felt"))}</span></span>${esc(t.slice(i + M.HULL.length))}`;
    }
    const [a, b, c] = M.fyll(t, svar);
    return `${esc(a)}<b class="dom-svar${o.klasse ? " " + o.klasse : ""}">${esc(b)}</b>${esc(c)}`;
  }
  const ren = (sp, svar) => M.fyll(SP[sp.sporsmal].t, svar).join("");

  function sporsmalKort(sp, kompakt) {
    const p = pakke(SP[sp.sporsmal].p);
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: R.t("Runde {n}", { n: sp.runde }),
      tekstHtml: setning(sp, null),
      lengde: SP[sp.sporsmal].t.length,
      klasse: "dom-kort",
      sveip: kompakt ? null : "bytt",
      kompakt,
    });
  }

  // «Avslutt» under the kit's own button on a hand-over screen (the dock is the last element).
  function medLenker(html, ...lenker) {
    const slutt = html.lastIndexOf("</div>");
    return html.slice(0, slutt) + R.ui.lenkerad(...lenker) + html.slice(slutt);
  }

  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    sp.ferdig = true;
    feire = true;
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.runde, maal: sp.maal, voksen: sp.pakker.some(voksen), tidlig: !!tidlig });
    R.kveld.registrer(M.rader(sp));
    if (!tidlig && M.vinnere(sp).length) R.merke("dommeren-seier");
    R.slippVaken();
    R.gaTil("slutt");
  }

  // ---------- Start ----------

  R.start({
    id: "dommeren",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 4, 3, 10),
      oppsett: OPPSETT(),
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(OPPSETT(), S.oppsett));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id) && (!voksen(id) || R.felles.over18));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      if (!MAAL.includes(o.maal)) o.maal = 5;
      const sp = S.spill;
      const kortOk = (k) => Number.isInteger(k) && k >= 0 && k < SV.length;
      const ok =
        !!sp &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 3 &&
        sp.antall <= 10 &&
        !!SP[sp.sporsmal] &&
        MAAL.includes(sp.maal) &&
        FASER.includes(sp.fase) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === sp.antall &&
        sp.poeng.every((n) => Number.isInteger(n) && n >= 0) &&
        Number.isInteger(sp.dommer) &&
        sp.dommer >= 0 &&
        sp.dommer < sp.antall &&
        Array.isArray(sp.hender) &&
        sp.hender.length === sp.antall &&
        sp.hender.every((h) => Array.isArray(h) && h.every(kortOk)) &&
        Array.isArray(sp.bunke) &&
        sp.bunke.every(kortOk) &&
        Array.isArray(sp.kast) &&
        Array.isArray(sp.lagt) &&
        sp.lagt.length === sp.antall &&
        sp.lagt.every((k) => k === -1 || kortOk(k)) &&
        Array.isArray(sp.beste) &&
        (sp.fase !== "velg" || (Array.isArray(sp.rekke) && sp.rekke.length === sp.antall - 1 && Number.isInteger(sp.na) && sp.na >= 0 && sp.na < sp.rekke.length)) &&
        (!["dom", "resultat"].includes(sp.fase) || (Array.isArray(sp.valg) && sp.valg.length === sp.antall - 1 && sp.valg.every((i) => sp.lagt[i] >= 0))) &&
        (sp.fase !== "resultat" || (Number.isInteger(sp.vinner) && sp.vinner >= 0 && sp.vinner < sp.antall));
      if (!ok) S.spill = null;
      else {
        if (!Number.isInteger(sp.valgt)) sp.valgt = -1;
        if (!Number.isInteger(sp.runde) || sp.runde < 1) sp.runde = 1;
        sp.beste = sp.beste.filter((b) => b && SP[b.s] && SV[b.a] && Number.isInteger(b.i) && b.i < sp.antall);
      }
      if (!S.spill && ["kort", "gi", "hand", "dom", "resultat", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Et kort har et tomt felt. Alle velger i hemmelighet det morsomste svaret fra sin egen hånd – og dommeren kårer det beste."),
      steg: [
        [R.t("Les kortet"), R.t("Dommeren leser kortet med det tomme feltet høyt. Dommeren går på rundgang, så alle får prøve.")],
        [R.t("Velg i hemmelighet"), R.t("Mobilen går rundt. Hver av dere ser bare sine egne fem svarkort og velger det som passer best – eller verst.")],
        [R.t("Dommeren kårer"), R.t("Dommeren leser alle setningene høyt og velger den beste. Den som la kortet, får poenget. Først til målet vinner.")],
      ],
      tips: [
        R.t("Dommeren vet ikke hvem som la hvilket kort. Ikke avslør deg selv!"),
        R.t("Etter hver runde fyller alle opp til fem kort igjen."),
        R.t("«Fest» har litt drøyere humor og er bare for voksne (18+)."),
        R.t("Trykket feil kort? «Angre» gir det tilbake før dommeren har sett noe."),
        R.t("Kjenner noen kortet fra før? Trykk «Bytt kort» før mobilen går rundt."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Fyll inn det som mangler."))}<br><em>${esc(R.t("Dommeren kårer det beste."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n}", { n: S.spill.runde }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["3–10", R.t("spillere")],
              [String(SP.filter((s) => !voksen(s.p)).length + SV.filter((s) => !voksen(s.p)).length), R.t("kort")],
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
          const o = S.oppsett;
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.t("{n} valgt", { n: o.pakker.length }))}</span></div>
            ${R.ui.fliser(
              "pakke",
              D.pakker.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.sporsmal.length + p.svar.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Spill til"))}</h2>
            ${R.ui.seg("maal", MAAL.map((n) => [String(n), R.flertall(n, "poeng", "poeng")]), String(o.maal), { etikett: R.t("Spill til") })}
            <p class="hjelp">${esc(o.maal === 3 ? R.t("Kjapt – en god start på kvelden.") : o.maal === 7 ? R.t("Lang kamp. Her blir det mange dommere.") : R.t("Passe lenge."))}</p>
          </section>
          ${R.ui.spillere({ min: 3, max: 10 })}
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      // Everyone: the judge reads the card.
      kort: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Runde {n}: {navn} er dommer", { n: sp.runde, navn: R.navn(sp.dommer) }))}</h1>
            <p class="dom-dommer">${R.avatar(sp.dommer, "mid")}<span>${esc(R.t("Dommer: {navn}", { navn: R.navn(sp.dommer) }))}</span><span class="dom-klubbe" aria-hidden="true">⚖️</span></p>
            ${sporsmalKort(sp, false)}
            <p class="hjelp dom-hjelp">${esc(R.t("{navn} leser kortet høyt. Så går mobilen rundt, og alle andre velger et svar i hemmelighet.", { navn: R.navn(sp.dommer) }))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Send mobilen rundt"), "rundt", { variant: "stor", ikon: "🤫" }), R.ui.lenkerad(R.ui.lenke(R.t("Bytt kort"), "bytt"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      // Hand the phone over: to each player for the secret choice, then to the judge.
      gi: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          if (sp.fase === "dom") {
            return medLenker(
              R.ui.giTil({
                i: sp.dommer,
                h: "jeg-er",
                tekst: R.t("Alle har valgt! Gi mobilen til dommeren"),
                knapp: R.t("Jeg er {navn}", { navn: R.navn(sp.dommer) }),
                advarsel: R.t("Dommeren leser alle svarene høyt"),
                ikon: "📣",
              }),
              R.ui.lenke(R.t("↶ Angre siste kort"), "angre-legg"),
            );
          }
          const i = M.paTur(sp);
          return medLenker(
            R.ui.giTil({ i, h: "jeg-er", tekst: R.t("Gi mobilen til"), knapp: R.t("Jeg er {navn}", { navn: R.navn(i) }), advarsel: R.t("De andre ser bort mens du velger"), prikker: [sp.rekke.length, sp.na] }),
            sp.na > 0 ? R.ui.lenke(R.t("↶ Angre siste kort"), "angre-legg") : "",
            R.ui.lenke(R.t("Avslutt"), "avslutt"),
          );
        },
        inn() {
          R.holdVaken();
        },
      },

      // Private: the player's own five cards.
      hand: {
        tittel: R.t("Hemmelig"),
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const i = M.paTur(sp);
          const h = sp.hender[i];
          const valgt = sp.valgt >= 0 && sp.valgt < h.length ? sp.valgt : -1;
          return `
            <div class="dom-topp">
              ${R.avatar(i, "mid")}
              <div><p class="etikett">🤫 ${esc(R.t("Bare {navn} ser dette", { navn: R.navn(i) }))}</p><h1 id="skjerm-tittel">${esc(R.t("Velg ditt beste svar"))}</h1></div>
            </div>
            <p class="papirboks dom-forhand" aria-live="polite"><span>${valgt >= 0 ? setning(sp, SV[h[valgt]].t) : setning(sp, null)}</span></p>
            <div class="dom-hand" data-hemmelig role="group" aria-label="${esc(R.t("Svarkortene dine"))}">
              ${h.map((k, n) => `<button class="dom-svarkort${n === valgt ? " valgt" : ""}" data-h="merk" data-v="${n}" aria-pressed="${n === valgt}">${esc(SV[k].t)}</button>`).join("")}
            </div>
            ${R.ui.dokk(R.ui.knapp(valgt >= 0 ? R.t("Legg kortet") : R.t("Velg et kort"), "legg", { id: "dom-legg", av: valgt < 0 }))}`;
        },
      },

      // The judge: every sentence, read out loud, then the best one.
      dom: {
        tittel: R.t("Dommeren"),
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const v = sp.valgt;
          const valg = sp.valg.map((i, n) => `<button class="dom-alternativ${n === v ? " valgt" : ""}" data-h="velg" data-v="${n}" aria-pressed="${n === v}">${setning(sp, SV[sp.lagt[i]].t)}</button>`); // sprak-ok
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Les alle høyt – og velg den beste"))}</h1>
            <div class="dom-valg" role="group" aria-label="${esc(R.t("Svarene"))}">${valg.join("")}</div>
            ${R.ui.dokk(R.ui.knapp(v >= 0 ? R.t("Kår vinneren") : R.t("Velg det beste svaret"), "kar", { id: "dom-kar", av: v < 0 }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
      },

      // Everyone: the winner of the round, and who wrote what.
      resultat: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = M.erFerdig(sp);
          const vinner = sp.vinner;
          const rader = M.rader(sp).map((r) => Object.assign(r, r.i === vinner ? { pluss: 1 } : {}));
          return `
            <div class="banner aksent dom-banner">
              ${R.avatar(vinner, "gigant")}
              <p class="etikett">${esc(R.t("Dommeren har talt"))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("{navn} vinner runden!", { navn: R.navn(vinner) }))}</h1>
            </div>
            <p class="papirboks dom-vinnersetning"><span>${setning(sp, SV[sp.lagt[vinner]].t)}</span></p>
            ${R.ui.poengliste(rader)}
            <details class="dom-alle">
              <summary>${esc(R.t("Alle svarene"))}</summary>
              <ul>${sp.valg.map((i) => `<li${i === vinner ? ' class="vant"' : ""}><span>${esc(ren(sp, SV[sp.lagt[i]].t))}</span><small>${esc(R.navn(i))}</small></li>`).join("")}</ul>
            </details>
            ${R.ui.dokk(R.ui.knapp(ferdig ? R.t("Til kåringen") : R.t("Neste runde"), "videre"), R.ui.lenkerad(R.ui.lenke(R.t("↶ Angre"), "angre-kar", { id: "angre" }), ferdig ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn() {
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
          const beste = sp.beste.slice(-6).reverse();
          return `
            ${R.ui.banner({
              klasse: "aksent",
              etikett: R.flertall(sp.runde, "runde", "runder"),
              tittel: v.length ? vinnerTekst(v) : R.t("Ingen poeng denne gangen"),
              tekst: v.length ? R.t("Godt jobba! Dommerne har talt.") : R.t("Ingen runder ble kåret. Neste gang går det bedre!"),
              stemning: v.length ? "jubel" : "",
            })}
            ${v.length ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${
              beste.length
                ? `<section class="seksjon dom-beste" aria-labelledby="beste-tittel">
                    <h2 id="beste-tittel">${esc(R.t("Kveldens beste"))}</h2>
                    <ul>${beste.map((b) => `<li class="papirboks"><span>${esc(M.fyll(SP[b.s].t, SV[b.a].t).join(""))}</span><small>${esc(R.navn(b.i))}</small></li>`).join("")}</ul>
                  </section>`
                : ""
            }
            ${v.length ? `<div class="dom-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          if (!feire) return;
          feire = false;
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
        if (pagar(S)) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (!pagar(S)) return R.gaTil("oppsett");
        R.gaTil(SKJERM_FOR[S.spill.fase] || "kort");
      },
      async pakke(el, e, S) {
        const id = el.dataset.v;
        if (!pakke(id)) return;
        const valgt = S.oppsett.pakker;
        if (valgt.includes(id)) {
          S.oppsett.pakker = valgt.filter((x) => x !== id);
          return R.vis();
        }
        // The adult pack: the same 18+ question as the drinking games, once per phone.
        if (voksen(id) && !R.felles.over18) {
          const fortsatt = R.vakt();
          const ja = await R.bekreft(R.t("Er du 18 år eller eldre?"), R.t("«{pakke}» har litt drøyere humor og er bare for voksne.", { pakke: pakke(id).navn }), R.t("Ja, jeg er 18 eller eldre"), R.t("Nei"));
          if (!ja || !fortsatt()) return;
          R.lagreFelles({ over18: true });
          R.statistikk("alder18");
        }
        S.oppsett.pakker = [...S.oppsett.pakker.filter((x) => x !== id), id];
        R.vis();
      },
      maal(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.maal = MAAL.includes(n) ? n : 5;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        const antall = R.klamp(S.antall || 4, 3, 10);
        S.spill = M.nyttSpill(o, antall, rng, svarIder(o.pakker), nyttSporsmal(o.pakker));
        feire = false;
        R.statistikk("start", { spillere: antall, maal: S.spill.maal, voksen: o.pakker.some(voksen) });
        R.gaTil("kort");
      },
      async bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kort") return;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        sp.sporsmal = nyttSporsmal(sp.pakker);
        R.vis();
        R.si(`${R.t("Nytt kort.")} ${SP[sp.sporsmal].t.replace(M.HULL, "…")}`);
      },
      rundt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.startVelg(sp)) return;
        R.gaTil("gi");
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        sp.valgt = -1;
        if (sp.fase === "velg") R.gaTil("hand");
        else if (sp.fase === "dom") R.gaTil("dom");
      },
      merk(el, e, S) {
        const sp = S.spill;
        const n = Number(el.dataset.v);
        if (!pagar(S) || sp.fase !== "velg" || S.skjerm !== "hand") return;
        if (!(n >= 0 && n < sp.hender[M.paTur(sp)].length)) return;
        sp.valgt = n;
        R.lyd.klikk();
        R.vis();
        R.si(ren(sp, SV[sp.hender[M.paTur(sp)][n]].t));
      },
      legg(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "velg" || S.skjerm !== "hand" || sp.valgt < 0) return;
        const svar = M.legg(sp, sp.valgt, rng);
        if (!svar) return;
        R.lyd.pop();
        R.vibrer(15);
        if (svar === "dom") R.lyd.pling();
        R.gaTil("gi"); // a new screen: nothing of this hand is left on the page
      },
      "angre-legg"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        if (sp.fase === "dom") {
          // Back from «everyone has chosen» to the last player's hand.
          sp.fase = "velg";
          sp.valg = [];
        }
        if (!M.angreLegg(sp)) return;
        R.lyd.snu();
        R.vis();
        R.toast(R.t("{navn} velger på nytt", { navn: R.navn(M.paTur(sp)) }));
      },
      velg(el, e, S) {
        const sp = S.spill;
        const n = Number(el.dataset.v);
        if (!pagar(S) || sp.fase !== "dom" || S.skjerm !== "dom" || !(n >= 0 && n < sp.valg.length)) return;
        sp.valgt = n;
        R.lyd.klikk();
        R.vis();
      },
      kar(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || S.skjerm !== "dom" || !M.kar(sp, sp.valgt)) return;
        R.lyd.trommevirvel(0.45);
        R.vibrer([30, 40, 30, 40, 120]);
        R.gaTil("resultat");
        R.si(`${R.t("{navn} vinner runden!", { navn: R.navn(sp.vinner) })} ${ren(sp, SV[sp.lagt[sp.vinner]].t)}`);
        if (M.erFerdig(sp)) R.konfetti(["--lampe", "--papir", "--rosa"]);
      },
      "angre-kar"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const navn = R.navn(sp.vinner);
        if (!M.angreKar(sp)) return;
        R.lyd.snu();
        R.gaTil("dom");
        R.toast(R.t("Angret – poenget til {navn} er tatt tilbake", { navn }));
      },
      videre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "resultat") return;
        if (M.erFerdig(sp)) return tilSlutt(S);
        M.nesteRunde(sp, rng, nyttSporsmal(sp.pakker));
        R.gaTil("kort");
      },
      async avslutt(el, e, S) {
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
          .slice(0, 4)
          .map((r) => `${R.navn(r.i)}: ${R.flertall(r.poeng, "poeng", "poeng")}`);
        const linjer = [vinnerTekst(v), ...topp];
        const adresse = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "dommeren") + "/";
        R.del(R.app.navn, [R.t("{spill} – dommeren har talt ⚖️", { spill: R.app.navn }), ...linjer].join("\n"), adresse, { kort: { tittel: R.app.navn, linjer } });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
