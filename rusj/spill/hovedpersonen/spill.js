/* Hovedpersonen — «Den varme stolen» (hot seat).
   One player at a time sits in the chair and answers the group's questions; the player after
   them reads the cards out loud. 3, 5 or 8 questions each, then the next one takes the chair.
   With stars on, the reader may give a star to an answer the group loved (a toggle under the
   card, so a wrong tap is undone with one more tap); the most stars win Kåringen when everyone
   has been in the chair. Swapping a question is always fine and never counts — saying no is OK.

   The turn rules are pure functions on window.RusjHovedperson, so test/hovedpersonen.test.mjs
   can load this file in node:vm without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const PER = [3, 5, 8]; // questions per player
  const FASER = ["stol", "sporsmal"];

  const M = {
    PER,
    FASER,
    // A new game: everyone once in the chair, starting with `forst` and going round.
    nyttSpill(o, antall, forst, kort) {
      return {
        antall,
        pakker: o.pakker.slice(),
        per: PER.includes(o.per) ? o.per : 5,
        stjerner: !!o.stjerner,
        rekke: Array.from({ length: antall }, (_, k) => (forst + k) % antall),
        na: 0, // index in rekke: who is in the chair
        nr: 1, // the question on the table (1 … per)
        kort,
        stjerne: false, // the star for the answer on the table (a toggle until «Neste»)
        poeng: Array(antall).fill(0), // stars per player
        tur: 0, // stars in this turn
        besvart: 0, // questions answered in the whole game
        satt: 0, // players who answered at least one question
        forrige: null, // { i, stjerner, besvart } the player who just left the chair
        fase: "stol",
        ferdig: false,
      };
    },
    // Who is in the chair, and who reads (the next one round the table).
    iStolen: (sp) => sp.rekke[Math.min(sp.na, sp.rekke.length - 1)],
    leser: (sp) => sp.rekke[(Math.min(sp.na, sp.rekke.length - 1) + 1) % sp.rekke.length],
    sisteSporsmal: (sp) => sp.nr >= sp.per,
    sisteSpiller: (sp) => sp.na >= sp.rekke.length - 1,
    // The star under the card: on, off, on … (only with stars on).
    veksleStjerne(sp) {
      if (!sp.stjerner || sp.fase !== "sporsmal") return false;
      sp.stjerne = !sp.stjerne;
      return true;
    },
    // The answer is done. Returns "neste" (another question), "bytt" (the next player's turn)
    // or "ferdig" (everyone has been in the chair). `kort`: the next card, when there is one.
    svart(sp, kort) {
      const i = M.iStolen(sp);
      sp.besvart += 1;
      if (sp.nr === 1) sp.satt += 1;
      if (sp.stjerner && sp.stjerne) {
        sp.poeng[i] += 1;
        sp.tur += 1;
      }
      sp.stjerne = false;
      if (!M.sisteSporsmal(sp)) {
        sp.nr += 1;
        sp.kort = kort;
        return "neste";
      }
      return M.byttStol(sp, kort, sp.per);
    },
    // The player in the chair leaves it (after the last question, or skipped with «Stå over»).
    byttStol(sp, kort, besvart) {
      sp.forrige = { i: M.iStolen(sp), stjerner: sp.tur, besvart };
      sp.tur = 0;
      sp.stjerne = false;
      if (M.sisteSpiller(sp)) {
        sp.ferdig = true;
        return "ferdig";
      }
      sp.na += 1;
      sp.nr = 1;
      sp.kort = kort;
      sp.fase = "stol";
      return "bytt";
    },
    // «Stå over»: the player skips the rest of the turn (stars already given stay).
    staOver(sp, kort) {
      if (sp.fase === "sporsmal" && sp.stjerner && sp.stjerne) sp.stjerne = false;
      return M.byttStol(sp, kort, sp.fase === "stol" ? 0 : sp.nr - 1);
    },
    rader: (sp) => sp.poeng.map((poeng, i) => ({ i, poeng })),
    // The players with the most stars (none when nobody got one).
    vinnere(sp) {
      const topp = Math.max(0, ...sp.poeng);
      return topp > 0 ? sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    },
  };
  window.RusjHovedperson = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  // ---------- The game ----------

  const D = window.RUSJ_DATA.sporsmal;
  const esc = R.esc;
  const ALLE = [];
  D.pakker.forEach((p) => p.kort.forEach((t) => ALLE.push({ p: p.id, t })));
  const pakke = (id) => D.pakker.find((p) => p.id === id);
  const STANDARD = ["familie", "venner"].filter((id) => pakke(id));
  const OPPSETT = () => ({ pakker: STANDARD.slice(), per: 5, stjerner: true });
  const stokken = R.kortstokk("sporsmal", ALLE.length);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const lagretAntall = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const navneliste = (indekser) => R.ramsOpp(indekser.map((i) => R.navn(i)));
  const vinnerTekst = (v) => (v.length > 3 ? R.t("{n} spillere vinner!", { n: v.length }) : R.t("{navn} vinner!|{navn} vinner!", { navn: navneliste(v), n: v.length }));
  const stjerneTekst = (n) => R.t("{n} stjernesvar", { n });
  const sum = (liste) => liste.reduce((a, b) => a + b, 0);
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
    return R.t("{n} av {av} i stolen", { n: Math.min(sp.na + 1, sp.antall), av: sp.antall });
  };

  // Screen readers don't hear a card that is redrawn in place.
  const siKort = (S) => R.si(`${R.t("Spørsmål {n} av {av}.", { n: S.spill.nr, av: S.spill.per })} ${ALLE[S.spill.kort].t}`);

  function tilSlutt(S, tidlig) {
    const sp = S.spill;
    sp.ferdig = true;
    feire = true;
    S.sist = { satt: sp.satt, besvart: sp.besvart, stjerner: sp.stjerner ? sum(sp.poeng) : null };
    R.statistikk("ferdig", { spillere: sp.antall, besvart: sp.besvart, per: sp.per, stjerner: sp.stjerner, tidlig: !!tidlig });
    if (sp.stjerner) R.kveld.registrer(M.rader(sp));
    if (!tidlig && sp.satt === sp.antall) R.merke("hovedpersonen-alle");
    R.slippVaken();
    R.gaTil("slutt");
  }

  function kortet(S) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    return R.ui.storkort({
      etikett: `${p.ikon} ${p.navn}`,
      nr: R.t("{n} av {av}", { n: sp.nr, av: sp.per }),
      tekst: k.t,
      klasse: "hp-kort",
      sveip: "bytt",
      fot: M.sisteSporsmal(sp) ? R.t("Siste spørsmål til {navn}", { navn: R.navn(M.iStolen(sp)) }) : null,
    });
  }

  // ---------- Start ----------

  R.start({
    id: "hovedpersonen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(lagretAntall() || 4, 2, 20),
      oppsett: OPPSETT(),
      spill: null,
      sist: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign(OPPSETT(), S.oppsett));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      if (!PER.includes(o.per)) o.per = 5;
      o.stjerner = !!o.stjerner;
      const sp = S.spill;
      const tall = (l) => Array.isArray(l) && l.length === sp.antall && l.every((n) => Number.isInteger(n) && n >= 0);
      const ok =
        !!sp &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 2 &&
        sp.antall <= 20 &&
        !!ALLE[sp.kort] &&
        PER.includes(sp.per) &&
        Array.isArray(sp.rekke) &&
        sp.rekke.length === sp.antall &&
        sp.rekke.every((i) => Number.isInteger(i) && i >= 0 && i < sp.antall) &&
        Number.isInteger(sp.na) &&
        sp.na >= 0 &&
        sp.na < sp.antall &&
        Number.isInteger(sp.nr) &&
        sp.nr >= 1 &&
        sp.nr <= sp.per &&
        FASER.includes(sp.fase) &&
        tall(sp.poeng) &&
        Array.isArray(sp.pakker);
      if (!ok) S.spill = null;
      else {
        sp.stjerner = !!sp.stjerner;
        sp.stjerne = !!sp.stjerne && sp.stjerner;
        for (const f of ["tur", "besvart", "satt"]) if (!Number.isInteger(sp[f]) || sp[f] < 0) sp[f] = 0;
        if (sp.forrige && !(Number.isInteger(sp.forrige.i) && sp.forrige.i >= 0 && sp.forrige.i < sp.antall)) sp.forrige = null;
      }
      if (!(S.sist && Number.isInteger(S.sist.besvart))) S.sist = null;
      if (!S.spill && ["stol", "sporsmal", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Én av dere sitter i den varme stolen og svarer på spørsmål fra gjengen. Så er det nestemann sin tur."),
      steg: [
        [R.t("Sett deg i stolen"), R.t("Mobilen velger hvem som begynner. Den som sitter ved siden av, leser spørsmålene høyt.")],
        [R.t("Svar ærlig"), R.t("Den i stolen svarer på 3, 5 eller 8 spørsmål. Gjengen får gjerne spørre litt mer.")],
        [R.t("Stjerne til gode svar"), R.t("Var svaret ekstra morsomt, ærlig eller overraskende? Trykk på stjerna før neste spørsmål. Flest stjerner vinner.")],
      ],
      tips: [
        R.t("Vil du ikke svare? Trykk «Bytt spørsmål» – det er alltid lov. Du kan også sveipe kortet til siden."),
        R.t("Trykket feil på stjerna? Trykk en gang til, så er den borte."),
        R.t("«Familie» passer for alle aldre. «Dypt» passer best når dere har god tid."),
        R.t("Skru av stjernene hvis dere bare vil prate."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const s = S.sist;
          const sist = s
            ? s.stjerner == null
              ? R.t("Sist: {spillere} i stolen, {sporsmal}", { spillere: s.satt, sporsmal: R.flertall(s.besvart, "spørsmål", "spørsmål") })
              : R.t("Sist: {spillere} i stolen, {sporsmal} og {stjerner}", { spillere: s.satt, sporsmal: R.flertall(s.besvart, "spørsmål", "spørsmål"), stjerner: R.flertall(s.stjerner, "stjerne", "stjerner") })
            : "";
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Én i stolen."))}<br><em>${esc(R.t("Alle andre spør."))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: pagar(S),
                fortsettTekst: pagar(S) ? R.t("Fortsett · {navn} i stolen", { navn: R.navn(M.iStolen(S.spill)) }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (sist ? `<p class="hp-sist">${esc(sist)}</p>` : ""),
              }),
              merker: [
                ["2–20", R.t("spillere")],
                [String(ALLE.length), R.t("spørsmål")],
                ["0", R.t("reklame")],
              ],
            })
          );
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
              D.pakker.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.kort.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Spørsmål til hver"))}</h2>
            ${R.ui.seg("per", PER.map((n) => [String(n), String(n)]), String(o.per), { etikett: R.t("Spørsmål til hver") })}
            <p class="hjelp">${esc(o.per === 3 ? R.t("Kjapt – fint når dere er mange.") : o.per === 8 ? R.t("Lenge i stolen. Her blir det avsløringer.") : R.t("Passe lenge i stolen."))}</p>
          </section>
          ${R.ui.bryter("stjerner", o.stjerner, R.t("Stjerner til gode svar"), R.t("Den som leser, deler ut stjerner. Flest stjerner vinner."))}
          ${R.ui.spillere({ min: 2, max: 20 })}
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      // Everyone: who takes the chair now, and who reads.
      stol: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = M.iStolen(sp);
          const f = sp.forrige;
          const forrige = f
            ? `<p class="papirboks hp-forrige">${
                sp.stjerner
                  ? `<span aria-hidden="true">⭐</span> ${esc(R.t("{navn} fikk {stjerner}.", { navn: R.navn(f.i), stjerner: stjerneTekst(f.stjerner) }))}`
                  : `<span aria-hidden="true">👏</span> ${esc(R.t("Takk til {navn}!", { navn: R.navn(f.i) }))}`
              }</p>`
            : "";
          return `
            ${R.ui.fremdrift(sp.antall, sp.na)}
            <div class="hp-stol">
              <span class="hp-stol-figur">${R.avatar(i, "gigant")}<span class="hp-stol-ikon" aria-hidden="true">🪑</span></span>
              <p class="etikett">${esc(sp.na === 0 ? R.t("Først i stolen") : R.t("Neste i stolen"))}</p>
              <h1 id="skjerm-tittel">${esc(R.navn(i))}</h1>
              <p class="hp-leser">${esc(sp.antall === 2 ? R.t("{navn} spør.", { navn: R.navn(M.leser(sp)) }) : R.t("{navn} leser spørsmålene.", { navn: R.navn(M.leser(sp)) }))}</p>
            </div>
            ${forrige}
            ${R.ui.dokk(
              R.ui.knapp(R.t("Første spørsmål"), "sett", { variant: "stor", ikon: "🔥" }),
              R.ui.lenkerad(R.ui.lenke(R.t("Stå over"), "sta-over"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          R.holdVaken();
          S.spill.fase = "stol";
        },
      },

      // Everyone: the question on the table.
      sporsmal: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = M.iStolen(sp);
          const stjerne = sp.stjerner
            ? `<button class="knapp-2 hp-stjerne" data-h="stjerne" aria-pressed="${sp.stjerne}"><span class="hp-stjerne-ikon" aria-hidden="true">${sp.stjerne ? "⭐" : "☆"}</span><span>${esc(sp.stjerne ? R.t("Stjerne!") : R.t("Gi stjerne"))}</span></button>`
            : "";
          // (The star sits beside the main button, so both stay under the thumb on the smallest phones.)
          const videre = R.ui.knapp(M.sisteSporsmal(sp) ? (M.sisteSpiller(sp) ? (sp.stjerner ? R.t("Til kåringen") : R.t("Ferdig")) : R.t("Neste i stolen")) : R.t("Neste spørsmål"), "neste");
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Spørsmål {n} til {navn}", { n: sp.nr, navn: R.navn(i) }))}</h1>
            <p class="hp-hvem">${R.avatar(i, "mid")}<span>${esc(R.t("{navn} i stolen", { navn: R.navn(i) }))}</span></p>
            ${kortet(S)}
            ${R.ui.dokk(
              stjerne ? `<div class="knapprad hp-knapper">${stjerne}${videre}</div>` : videre,
              R.ui.lenkerad(R.ui.lenke(R.t("Bytt spørsmål"), "bytt"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          R.holdVaken();
          S.spill.fase = "sporsmal";
        },
      },

      slutt: {
        tittel: (S) => (S.spill && S.spill.stjerner ? R.t("Kåringen") : null),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const dokk = R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`));
          const besvart = R.flertall(sp.besvart, "spørsmål", "spørsmål");
          if (!sp.stjerner) {
            return `
              ${R.ui.banner({
                etikett: R.t("{n} i stolen", { n: sp.satt }),
                tittel: R.t("Alle har vært hovedperson!"),
                tekst: R.t("{sporsmal} besvart. Nå vet dere litt mer om hverandre.", { sporsmal: besvart }),
              })}
              ${R.ui.flereSpill({ antall: sp.antall })}
              ${dokk}`;
          }
          const rader = M.rader(sp);
          const v = M.vinnere(sp);
          return `
            ${R.ui.banner({
              klasse: "aksent",
              etikett: v.length ? R.t("Flest stjernesvar") : R.t("Ingen stjerner"),
              tittel: v.length ? vinnerTekst(v) : R.t("Ingen stjerner denne gangen"),
              tekst: v.length ? R.t("Godt jobba! {sporsmal} besvart – og {stjerner} delt ut.", { sporsmal: besvart, stjerner: R.flertall(sum(sp.poeng), "stjerne", "stjerner") }) : R.t("{sporsmal} besvart. Neste gang: trykk på stjerna når et svar fortjener det.", { sporsmal: besvart }),
              stemning: v.length ? "jubel" : "",
            })}
            ${v.length ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${v.length ? `<div class="hp-del">${R.ui.knapp2(R.t("Del resultatet"), "del", { ikon: "📣" })}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${dokk}`;
        },
        inn(S) {
          if (!feire) return;
          feire = false;
          if (S.spill.stjerner && M.vinnere(S.spill).length) {
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
        R.gaTil(S.spill.fase === "sporsmal" ? "sporsmal" : "stol");
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        if (!pakke(id)) return;
        const valgt = S.oppsett.pakker;
        S.oppsett.pakker = valgt.includes(id) ? valgt.filter((x) => x !== id) : [...valgt, id];
        R.vis();
      },
      per(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.per = PER.includes(n) ? n : 5;
        R.vis();
      },
      stjerner(el, e, S) {
        S.oppsett.stjerner = !S.oppsett.stjerner;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.pakker.length) return;
        const antall = R.klamp(S.antall || 4, 2, 20);
        S.spill = M.nyttSpill(o, antall, R.heltall(0, antall - 1), trekk(o.pakker));
        feire = false;
        R.statistikk("start", { spillere: antall, per: S.spill.per, stjerner: S.spill.stjerner, pakker: o.pakker.length });
        R.gaTil("stol");
      },
      // From the chair screen: the first question.
      sett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "stol") return;
        sp.fase = "sporsmal";
        R.lyd.pop();
        R.gaTil("sporsmal");
        siKort(S);
      },
      stjerne(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !M.veksleStjerne(sp)) return;
        if (sp.stjerne) {
          R.lyd.pling();
          R.vibrer([20, 30, 40]);
        } else R.lyd.klikk();
        R.vis();
        R.si(sp.stjerne ? R.t("Stjerne til {navn}.", { navn: R.navn(M.iStolen(sp)) }) : R.t("Stjerna er tatt bort."));
      },
      async neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "sporsmal") return;
        const fortsatt = R.vakt();
        const svar = M.svart(sp, M.sisteSporsmal(sp) && M.sisteSpiller(sp) ? sp.kort : trekk(sp.pakker));
        if (svar === "ferdig") return tilSlutt(S);
        if (svar === "bytt") {
          R.lyd.takk();
          return R.gaTil("stol");
        }
        await R.kastKort(-1);
        if (!fortsatt()) return;
        R.vis();
        siKort(S);
      },
      // Swap the question (the link or a swipe): never counts.
      async bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "sporsmal") return;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        sp.kort = trekk(sp.pakker);
        sp.stjerne = false;
        R.vis();
        siKort(S);
      },
      // The one in the chair passes the rest of the turn. Always fine.
      "sta-over"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const navn = R.navn(M.iStolen(sp));
        const svar = M.staOver(sp, trekk(sp.pakker));
        if (svar === "ferdig") return tilSlutt(S);
        R.lyd.snu();
        R.gaTil("stol");
        R.toast(R.t("{navn} står over – helt greit!", { navn }));
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        const stjerner = sp && sp.stjerner;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), stjerner ? R.t("Dere går rett til kåringen. Den med flest stjerner vinner.") : R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !pagar(S)) return;
        if (stjerner) return tilSlutt(S, true);
        R.statistikk("ferdig", { spillere: sp.antall, besvart: sp.besvart, per: sp.per, stjerner: false, tidlig: true });
        S.sist = { satt: sp.satt, besvart: sp.besvart, stjerner: null };
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.stjerner) return;
        const v = M.vinnere(sp);
        if (!v.length) return;
        const topp = M.rader(sp)
          .filter((r) => r.poeng > 0)
          .sort((a, b) => b.poeng - a.poeng)
          .slice(0, 4)
          .map((r) => `${R.navn(r.i)}: ${R.flertall(r.poeng, "stjerne", "stjerner")}`);
        const linjer = [vinnerTekst(v), ...topp];
        const adresse = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "hovedpersonen") + "/";
        R.del(R.app.navn, [R.t("{spill} – hvem fikk flest stjernesvar? 🔥", { spill: R.app.navn }), ...linjer].join("\n"), adresse, { kort: { tittel: R.app.navn, linjer } });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
