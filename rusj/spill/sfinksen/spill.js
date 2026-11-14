/* Sfinksen — trick riddles («gåter med en vri»).
   A card asks a riddle with a twist: a thing that describes itself, a trick question that is
   about the words, or a small puzzle that needs thinking outside the box. Two ways to play:
   - «Gjengen»: one shows the phone, everyone shouts. Tap who got it first (+1), or «Ingen».
   - «Alene»: guess, look at the answer, and say honestly whether you had it. A record per length.
   Hints never cost anything: first the answer's word and letter count as boxes, then the first
   letters. The answer comes with a short line on why. Every point can be taken back («Angre»)
   until the next card is answered. Our own riddles, written for each language.

   The rules are pure functions on window.RusjSfinks (test/sfinksen.test.mjs). */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const LENGDER = [10, 20, 0]; // cards in a game; 0 = «Fritt» (until «Avslutt»)
  const MODUSER = ["gjengen", "alene"];
  const BOKSTAV = /[\p{L}\p{N}]/u;

  const M = {
    LENGDER,
    MODUSER,
    // The answer as boxes: [[{ b: "B", vis: false }, …], [", "] …]. niva 1: the boxes, niva 2: the
    // first letter of every word filled in. Anything that is not a letter or digit shows as itself.
    monster(svar, niva) {
      return String(svar)
        .split(/\s+/)
        .filter(Boolean)
        .map((ord) => {
          let forste = true;
          return Array.from(ord).map((c) => {
            if (!BOKSTAV.test(c)) return { b: c, tegn: true };
            const vis = niva >= 2 && forste;
            forste = false;
            return { b: c, vis };
          });
        });
    },
    // { ord, bokstaver } for the hint line.
    telling(svar) {
      const ord = M.monster(svar, 1);
      return { ord: ord.length, bokstaver: ord.reduce((n, o) => n + o.filter((x) => !x.tegn).length, 0) };
    },
    forbokstaver: (svar) => M.monster(svar, 2).map((o) => (o.find((x) => !x.tegn) || { b: "" }).b).filter(Boolean),
    nyttSpill(o, antall, kort) {
      const modus = MODUSER.includes(o.modus) ? o.modus : "gjengen";
      return {
        modus,
        antall: modus === "alene" ? 1 : antall,
        pakker: o.pakker.slice(),
        lengde: LENGDER.includes(o.lengde) ? o.lengde : 10,
        nr: 1, // the card on the table (a swapped card keeps its number)
        kort,
        fase: "gjett", // gjett → svar
        hint: 0,
        poeng: Array(modus === "alene" ? 1 : antall).fill(0),
        riktig: 0, // alone: cards you had
        spilt: 0, // cards answered
        angre: null,
        ferdig: false,
      };
    },
    sisteKort: (sp) => sp.lengde > 0 && sp.nr >= sp.lengde,
    // More help on the card on the table (at most two steps).
    merHint(sp) {
      if (sp.fase !== "gjett" || sp.hint >= 2) return false;
      sp.hint += 1;
      return true;
    },
    vis(sp) {
      if (sp.fase !== "gjett") return false;
      sp.fase = "svar";
      return true;
    },
    // The card is answered. hvem: a player (gjengen), true/false (alene) or -1 (nobody).
    // Returns "neste" or "ferdig". `nyttKort`: the next card.
    gjettet(sp, hvem, nyttKort) {
      if (sp.fase !== "svar") return null;
      const fikk = sp.modus === "alene" ? (hvem === true ? 0 : -1) : Number.isInteger(hvem) && hvem >= 0 && hvem < sp.antall ? hvem : -1;
      sp.angre = { kort: sp.kort, nr: sp.nr, hint: sp.hint, fikk };
      if (fikk >= 0) sp.poeng[fikk] += 1;
      if (sp.modus === "alene" && fikk === 0) sp.riktig += 1;
      sp.spilt += 1;
      if (M.sisteKort(sp)) {
        sp.ferdig = true;
        return "ferdig";
      }
      sp.nr += 1;
      sp.kort = nyttKort;
      sp.fase = "gjett";
      sp.hint = 0;
      return "neste";
    },
    // Take the last answer back: the card returns to its reveal, the point goes away.
    angre(sp) {
      const a = sp.angre;
      if (!a) return false;
      if (a.fikk >= 0) sp.poeng[a.fikk] = Math.max(0, sp.poeng[a.fikk] - 1);
      if (sp.modus === "alene" && a.fikk === 0) sp.riktig = Math.max(0, sp.riktig - 1);
      sp.spilt = Math.max(0, sp.spilt - 1);
      sp.kort = a.kort;
      sp.nr = a.nr;
      sp.hint = a.hint;
      sp.fase = "svar";
      sp.ferdig = false;
      sp.angre = null;
      return true;
    },
    rader: (sp) => sp.poeng.map((poeng, i) => ({ i, poeng })),
    vinnere(sp) {
      const topp = Math.max(0, ...sp.poeng);
      return topp > 0 ? sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    },
  };
  window.RusjSfinks = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const D = window.RUSJ_DATA.gater;
  const esc = R.esc;
  const ALLE = [];
  D.pakker.forEach((p) => p.kort.forEach((k) => ALLE.push({ p: p.id, s: k.s, a: k.a, f: k.f || "" })));
  const pakke = (id) => D.pakker.find((p) => p.id === id);
  const STANDARD = D.pakker.map((p) => p.id);
  const OPPSETT = () => ({ modus: "gjengen", pakker: STANDARD.slice(), lengde: 10 });
  const stokken = R.kortstokk("gater", ALLE.length);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const navneliste = (indekser) => R.ramsOpp(indekser.map((i) => R.navn(i)));
  const vinnerTekst = (v) => (v.length > 3 ? R.t("{n} spillere vinner!", { n: v.length }) : R.t("{navn} vinner!|{navn} vinner!", { navn: navneliste(v), n: v.length }));
  const alene = (sp) => sp.modus === "alene";
  let H;
  let feire = false;

  function trekk(pakker) {
    const valgt = new Set(pakker);
    let i = stokken.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokken.neste();
    return i;
  }

  const tittel = (S) => {
    const sp = S.spill;
    if (!sp) return null;
    return sp.lengde ? R.t("Gåte {n} av {av}", { n: sp.nr, av: sp.lengde }) : R.t("Gåte {n}", { n: sp.nr });
  };

  // Screen readers don't hear a card that is redrawn in place.
  const siKort = (S) => R.si(`${tittel(S)}. ${ALLE[S.spill.kort].s}`);

  function hintHtml(k, niva) {
    if (!niva) return "";
    const t = M.telling(k.a);
    const ord = M.monster(k.a, niva)
      .map((o) => `<span class="sx-ord">${o.map((x) => (x.tegn ? `<span class="sx-tegn">${esc(x.b)}</span>` : `<i class="sx-boks${x.vis ? " vis" : ""}">${x.vis ? esc(x.b) : ""}</i>`)).join("")}</span>`)
      .join("");
    const linje = niva >= 2 ? R.t("Begynner med {bokstaver}", { bokstaver: M.forbokstaver(k.a).join(" ") }) : R.t("{ord} · {bokstaver}", { ord: R.flertall(t.ord, "ord", "ord"), bokstaver: R.flertall(t.bokstaver, "bokstav", "bokstaver") });
    return `<span class="sx-hint"><span class="sx-monster" aria-hidden="true">${ord}</span><span class="sx-hintlinje">${esc(linje)}</span></span>`;
  }

  function kortet(S, kompakt) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    const svar = sp.fase === "svar";
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: sp.lengde ? R.t("{n} av {av}", { n: sp.nr, av: sp.lengde }) : `#${sp.nr}`,
      tekstHtml: `<span class="sx-gate">${esc(k.s)}</span>${
        svar ? `<span class="sx-svar"><span class="vh">${esc(R.t("Svaret:"))} </span>${esc(k.a)}</span>${k.f ? `<span class="sx-hvorfor">${esc(k.f)}</span>` : ""}` : hintHtml(k, sp.hint)
      }`,
      lengde: k.s.length + (svar ? k.a.length + k.f.length : 0),
      klasse: "sx-kort" + (svar ? " sx-vist" : ""),
      sveip: svar ? null : "bytt",
      kompakt,
      fot: !svar && M.sisteKort(sp) ? R.t("Siste gåte!") : null,
    });
  }

  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    sp.ferdig = true;
    feire = true;
    if (alene(sp)) {
      S.sist = { modus: "alene", riktig: sp.riktig, av: sp.spilt };
      if (sp.lengde && !tidlig) {
        const f = S.rekord[sp.lengde];
        sp.nyRekord = f == null || sp.riktig > f;
        if (sp.nyRekord) S.rekord[sp.lengde] = sp.riktig;
        if (sp.riktig === sp.lengde) R.merke("sfinksen-alle");
      }
    } else {
      S.sist = { modus: "gjengen", av: sp.spilt, spillere: sp.antall };
      R.kveld.registrer(M.rader(sp));
    }
    R.statistikk("ferdig", { modus: sp.modus, spilt: sp.spilt, riktig: alene(sp) ? sp.riktig : 0, lengde: sp.lengde, spillere: sp.antall, tidlig: !!tidlig });
    R.slippVaken();
    R.gaTil("slutt");
  }

  // ---------- Start ----------

  R.start({
    id: "sfinksen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 4, 2, 20),
      oppsett: OPPSETT(),
      spill: null,
      sist: null,
      rekord: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(OPPSETT(), S.oppsett));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      if (!LENGDER.includes(o.lengde)) o.lengde = 10;
      if (!MODUSER.includes(o.modus)) o.modus = "gjengen";
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      for (const k of Object.keys(S.rekord)) if (!Number.isInteger(S.rekord[k])) delete S.rekord[k];
      const sp = S.spill;
      const ok =
        !!sp &&
        MODUSER.includes(sp.modus) &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 1 &&
        sp.antall <= 20 &&
        !!ALLE[sp.kort] &&
        LENGDER.includes(sp.lengde) &&
        Number.isInteger(sp.nr) &&
        sp.nr >= 1 &&
        (!sp.lengde || sp.nr <= sp.lengde) &&
        ["gjett", "svar"].includes(sp.fase) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === sp.antall &&
        sp.poeng.every((n) => Number.isInteger(n) && n >= 0) &&
        Array.isArray(sp.pakker);
      if (!ok) S.spill = null;
      else {
        sp.hint = R.klamp(Number(sp.hint) || 0, 0, 2);
        for (const f of ["riktig", "spilt"]) if (!Number.isInteger(sp[f]) || sp[f] < 0) sp[f] = 0;
        if (sp.angre && !(ALLE[sp.angre.kort] && Number.isInteger(sp.angre.fikk) && sp.angre.fikk < sp.antall)) sp.angre = null;
      }
      if (!(S.sist && MODUSER.includes(S.sist.modus) && Number.isInteger(S.sist.av))) S.sist = null;
      if (!S.spill && ["kort", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Gåter med en vri: Les nøye, tenk deg om – svaret er ofte enklere enn du tror."),
      steg: [
        [R.t("Les gåten høyt"), R.t("Én leser kortet for gjengen. Les det to ganger – knepet ligger ofte i ordene.")],
        [R.t("Rop det ut"), R.t("Den første som sier riktig svar, får poenget. Står dere fast? Trykk «Hint» – først kommer antall bokstaver, så forbokstavene.")],
        [R.t("Vis svaret"), R.t("Trykk «Vis svaret» og så på den som klarte det først. Etter 10 eller 20 gåter kommer kåringen.")],
      ],
      tips: [
        R.t("Alene? Velg «Alene» og si ærlig om du klarte det. Mobilen husker rekorden din."),
        R.t("Hint koster ingenting. «Barn» passer fra 7 år, «Hjernetrim» krever mest."),
        R.t("Et svar som betyr det samme, teller. Det er tanken som gjelder."),
        R.t("Trykket feil? «Angre» tar poenget tilbake."),
        R.t("Sveip kortet til siden for å bytte gåte."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const s = S.sist;
          const sist = s ? (s.modus === "alene" ? R.t("Sist: {riktig} av {av} alene", { riktig: s.riktig, av: s.av }) : R.t("Sist: {gater} med gjengen", { gater: R.flertall(s.av, "gåte", "gåter") })) : "";
          const rekord = [10, 20].filter((n) => S.rekord[n] != null).map((n) => R.t("{riktig} av {av}", { riktig: S.rekord[n], av: n }));
          const linjer = [sist, rekord.length ? R.t("Rekord alene: {rekorder}", { rekorder: rekord.join(" · ") }) : ""].filter(Boolean);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Gåter med en vri."))}<br><em>${esc(R.t("Tenk deg godt om!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · {kort}", { kort: tittel(S).toLocaleLowerCase(R.lokale) }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (linjer.length ? `<p class="sx-sist">${linjer.map((l) => esc(l)).join("<br>")}</p>` : ""),
            }),
            merker: [
              ["1–20", R.t("spillere")],
              [String(ALLE.length), R.t("gåter")],
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
          const lengdeHjelp = !o.lengde ? R.t("Dere spiller til noen trykker «Avslutt».") : o.modus === "alene" ? R.t("Etter {n} gåter ser du hvor mange du klarte.", { n: o.lengde }) : R.t("Etter {n} gåter kommer kåringen av seg selv.", { n: o.lengde });
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvordan vil dere spille?"))}</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "gjengen", tittel: R.t("Gjengen"), tekst: R.t("Alle gjetter – først riktig får poenget"), ikon: "🎉" },
                { v: "alene", tittel: R.t("Alene"), tekst: R.t("Gjett selv og slå rekorden din"), ikon: "🧠" },
              ],
              o.modus,
            )}
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.t("{n} valgt", { n: o.pakker.length }))}</span></div>
            ${R.ui.fliser(
              "pakke",
              D.pakker.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Hvor mange gåter?"))}</h2>
            ${R.ui.seg("lengde", LENGDER.map((n) => [String(n), n ? String(n) : R.t("Fritt")]), String(o.lengde), { etikett: R.t("Hvor mange gåter?") })}
            <p class="hjelp">${esc(lengdeHjelp)}</p>
          </section>
          ${o.modus === "gjengen" ? R.ui.spillere({ min: 2, max: 20 }) : ""}
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const angre = sp.angre ? R.ui.lenke(R.t("↶ Angre"), "angre", { id: "angre" }) : "";
          if (sp.fase === "gjett") {
            return `
              <h1 class="vh" id="skjerm-tittel">${esc(tittel(S))}</h1>
              ${kortet(S, false)}
              ${R.ui.dokk(
                `<div class="knapprad sx-knapper">${R.ui.knapp2(sp.hint === 1 ? R.t("Mer hint") : R.t("Hint"), "hint", { ikon: "💡", av: sp.hint >= 2 })}${R.ui.knapp(R.t("Vis svaret"), "vis")}</div>`,
                R.ui.lenkerad(angre, R.ui.lenke(R.t("Bytt gåte"), "bytt"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
              )}`;
          }
          if (alene(sp)) {
            return `
              <h1 class="vh" id="skjerm-tittel">${esc(R.t("{kort}: klarte du den?", { kort: tittel(S) }))}</h1>
              ${kortet(S, false)}
              ${R.ui.dokk(
                `<div class="knapprad sx-knapper">${R.ui.knapp2(R.t("Ikke denne"), "bom")}${R.ui.knapp(R.t("Jeg klarte det!"), "klarte")}</div>`,
                R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
              )}`;
          }
          return `
            <h1 class="vh">${esc(R.t("{kort}: hvem gjettet først?", { kort: tittel(S) }))}</h1>
            ${kortet(S, true)}
            <section class="seksjon sx-hvem">
              <h2 id="skjerm-tittel">${esc(R.t("Hvem gjettet først?"))}</h2>
              ${R.ui.velgere("fikk", Array.from({ length: sp.antall }, (_, i) => i), null)}
            </section>
            ${R.ui.dokk(R.ui.knapp2(R.t("Ingen klarte det"), "ingen"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.spill && !alene(S.spill) ? R.t("Kåringen") : null),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const dokk = R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`));
          if (alene(sp)) {
            const andel = sp.spilt ? sp.riktig / sp.spilt : 0;
            const bra = sp.spilt > 0 && andel >= 0.7;
            return `
              ${R.ui.banner({
                klasse: "aksent",
                etikett: sp.nyRekord ? R.t("Ny rekord!") : R.t("Alene"),
                tittel: R.t("{riktig} av {av}", { riktig: sp.riktig, av: sp.spilt }),
                tekst: !sp.spilt ? R.t("Ingen gåter denne gangen.") : sp.riktig === sp.spilt ? R.t("Alle sammen! Sfinksen bukker for deg.") : bra ? R.t("Godt jobba! Du så rett gjennom knepene.") : R.t("Noen satt langt inne. Prøv igjen – de blir lettere når du kjenner knepene."),
                stemning: bra ? "jubel" : "",
              })}
              ${sp.spilt ? `<div class="sx-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
              ${R.ui.flereSpill({ antall: 1 })}
              ${dokk}`;
          }
          const rader = M.rader(sp);
          const v = M.vinnere(sp);
          return `
            ${R.ui.banner({
              klasse: "aksent",
              etikett: R.flertall(sp.spilt, "gåte", "gåter"),
              tittel: v.length ? vinnerTekst(v) : R.t("Ingen poeng denne gangen"),
              tekst: v.length ? R.t("Godt jobba! Lurest av alle.") : R.t("Gåtene vant denne gangen. Prøv med hint!"),
              stemning: v.length ? "jubel" : "",
            })}
            ${v.length ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${v.length ? `<div class="sx-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${dokk}`;
        },
        inn(S) {
          if (!feire) return;
          feire = false;
          const sp = S.spill;
          const godt = alene(sp) ? sp.spilt > 0 && sp.riktig / sp.spilt >= 0.7 : M.vinnere(sp).length > 0;
          if (godt) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), pagar(S) && alene(S.spill))) || !fortsatt()) return;
        if (pagar(S)) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (!pagar(S)) return R.gaTil("oppsett");
        R.gaTil("kort");
      },
      modus(el, e, S) {
        if (!MODUSER.includes(el.dataset.v)) return;
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        if (!pakke(id)) return;
        const valgt = S.oppsett.pakker;
        S.oppsett.pakker = valgt.includes(id) ? valgt.filter((x) => x !== id) : [...valgt, id];
        R.vis();
      },
      lengde(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.lengde = LENGDER.includes(n) ? n : 10;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        const antall = R.klamp(S.antall || 4, 2, 20);
        S.spill = M.nyttSpill(o, antall, trekk(o.pakker));
        feire = false;
        R.statistikk("start", { modus: S.spill.modus, spillere: S.spill.antall, lengde: S.spill.lengde, pakker: o.pakker.length });
        R.gaTil("kort");
        siKort(S);
      },
      hint(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.merHint(sp)) return;
        const k = ALLE[sp.kort];
        R.lyd.pop();
        R.vis();
        const t = M.telling(k.a);
        R.si(sp.hint >= 2 ? R.t("Begynner med {bokstaver}", { bokstaver: M.forbokstaver(k.a).join(" ") }) : R.t("{ord} · {bokstaver}", { ord: R.flertall(t.ord, "ord", "ord"), bokstaver: R.flertall(t.bokstaver, "bokstav", "bokstaver") }));
      },
      vis(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.vis(sp)) return;
        sp.angre = null;
        R.lyd.snu();
        R.vibrer(30);
        R.vis();
        R.si(`${R.t("Svaret: {svar}", { svar: ALLE[sp.kort].a })} ${ALLE[sp.kort].f}`);
        if (!alene(sp)) {
          const h = R.$("#skjerm-tittel");
          if (h) h.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
        }
      },
      async bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "gjett") return;
        sp.angre = null;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        sp.kort = trekk(sp.pakker);
        sp.hint = 0;
        R.vis();
        siKort(S);
      },
      fikk(el, e, S) {
        const i = Number(el.dataset.v);
        if (!pagar(S) || alene(S.spill) || !(i >= 0 && i < S.spill.antall)) return;
        H._svar(S, i);
      },
      ingen(el, e, S) {
        if (pagar(S) && !alene(S.spill)) H._svar(S, -1);
      },
      klarte(el, e, S) {
        if (pagar(S) && alene(S.spill)) H._svar(S, true);
      },
      bom(el, e, S) {
        if (pagar(S) && alene(S.spill)) H._svar(S, false);
      },
      _svar(S, hvem) {
        const sp = S.spill;
        const svar = M.gjettet(sp, hvem, trekk(sp.pakker));
        if (!svar) return;
        const fikk = sp.angre.fikk;
        if (fikk >= 0) {
          R.lyd.riktig();
          R.vibrer([20, 30, 60]);
        } else R.lyd.klikk();
        if (svar === "ferdig") return tilSlutt(S);
        R.vis();
        window.scrollTo(0, 0);
        if (!alene(sp) && fikk >= 0) R.toast(R.t("+1 til {navn}", { navn: R.navn(fikk) }));
        siKort(S);
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.angre) return;
        const fikk = sp.angre.fikk;
        if (!M.angre(sp)) return;
        R.lyd.snu();
        R.vis();
        R.toast(alene(sp) ? R.t("Angret") : fikk >= 0 ? R.t("Angret +1 til {navn}", { navn: R.navn(fikk) }) : R.t("Angret «ingen»"));
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), alene(sp) ? R.t("Du ser hvor mange du klarte så langt.") : R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !pagar(S)) return;
        tilSlutt(S, true);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const adresse = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "sfinksen") + "/";
        if (alene(sp)) {
          const linjer = [`${sp.riktig}/${sp.spilt}`, R.t("gåter alene"), ...(sp.nyRekord ? [R.t("Ny rekord!")] : [])];
          R.del(R.app.navn, R.t("Jeg klarte {riktig} av {av} gåter i {spill}. Klarer du flere? 🦁", { riktig: sp.riktig, av: sp.spilt, spill: R.app.navn }), adresse, { kort: { tittel: R.app.navn, linjer } });
          return;
        }
        const v = M.vinnere(sp);
        if (!v.length) return;
        const topp = M.rader(sp)
          .filter((r) => r.poeng > 0)
          .sort((a, b) => b.poeng - a.poeng)
          .slice(0, 4)
          .map((r) => `${R.navn(r.i)}: ${R.flertall(r.poeng, "poeng", "poeng")}`);
        const linjer = [vinnerTekst(v), ...topp];
        R.del(R.app.navn, [R.t("{spill} – gåter med en vri 🦁", { spill: R.app.navn }), ...linjer].join("\n"), adresse, { kort: { tittel: R.app.navn, linjer } });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
