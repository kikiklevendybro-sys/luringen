/* Steinfjeset — «Ikke le!».
   Two players a turn sit face to face. The clown (klovn) holds the phone, peeks at a secret silly
   task on the hold-card and performs it; the stone face (steinfjes) must keep a straight face for
   the whole clock. «Hen lo!» gives the clown a point; lasting the clock gives the stone face one.
   The pairs turn like Kassetten's: in every round each player is the clown once and the stone face
   once, and the distance between the two seats grows by one each round, so new pairs meet.
   «Dobbel trøbbel»: both try to make the other laugh at the same time; whoever laughs first gives
   the other a point, and if nobody laughs, both get one.

   The rules are pure functions on window.RusjSteinfjeset, so test/steinfjeset.test.mjs can load
   this file in node:vm without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit, no DOM) ----------

  const TIDER = [20, 30, 45];
  const RUNDER = [1, 2, 3];
  const MODUSER = ["klassisk", "dobbel"];

  const M = {
    TIDER,
    RUNDER,
    MODUSER,
    // Who plays turn `tur`: [clown, stone face]. Round r (0-based) pairs each seat with the seat
    // 1 + r (mod n − 1) places on, so every player has both roles exactly once per round.
    par(antall, start, tur) {
      const runde = Math.floor(tur / antall);
      const avstand = 1 + (runde % Math.max(1, antall - 1));
      const klovn = (start + (tur % antall)) % antall;
      return [klovn, (klovn + avstand) % antall];
    },
    nyttSpill(o, antall, start) {
      return {
        antall,
        modus: MODUSER.includes(o.modus) ? o.modus : "klassisk",
        tid: TIDER.includes(o.tid) ? o.tid : 30,
        runder: RUNDER.includes(o.runder) ? o.runder : 1,
        start: ((start % antall) + antall) % antall,
        tur: 0,
        turer: antall * (RUNDER.includes(o.runder) ? o.runder : 1),
        poeng: Array(antall).fill(0),
        logg: [],
        na: null,
        skjerm: "par",
        ferdig: false,
      };
    },
    // A fresh turn with task number q.
    nyTur(sp, q) {
      const [klovn, stein] = M.par(sp.antall, sp.start, sp.tur);
      sp.na = { klovn, stein, q, sett: false, igjen: sp.tid, pause: false, ferdig: false };
      return sp.na;
    },
    // Who gets the point when `lo` laughed (a player's index, or −1: nobody laughed).
    poengTil(sp, lo) {
      const { klovn, stein } = sp.na;
      if (sp.modus === "dobbel") return lo === klovn ? [stein] : lo === stein ? [klovn] : [klovn, stein];
      return lo === stein ? [klovn] : [stein];
    },
    // The verdict on the turn. igjen: seconds left on the clock (for «Angre»).
    dom(sp, lo, igjen = 0) {
      const na = sp.na;
      if (!na || na.ferdig) return null;
      const lov = sp.modus === "dobbel" ? [-1, na.klovn, na.stein] : [-1, na.stein];
      if (!lov.includes(lo)) return null;
      const til = M.poengTil(sp, lo);
      til.forEach((i) => (sp.poeng[i] += 1));
      const l = { tur: sp.tur, klovn: na.klovn, stein: na.stein, lo, til, q: na.q, igjen: Math.max(0, igjen) };
      sp.logg.push(l);
      na.ferdig = true;
      na.igjen = l.igjen;
      return l;
    },
    // The pair stands over: no points, the turn goes on to the next pair.
    staOver(sp) {
      const na = sp.na;
      if (!na || na.ferdig) return null;
      const l = { tur: sp.tur, klovn: na.klovn, stein: na.stein, lo: -1, til: [], q: na.q, igjen: sp.tid, hoppet: true };
      sp.logg.push(l);
      na.ferdig = true;
      return l;
    },
    kanAngre(sp) {
      const l = sp && sp.logg[sp.logg.length - 1];
      return !!(l && !l.hoppet && sp.na && sp.na.ferdig && l.tur === sp.tur && !sp.ferdig);
    },
    // Undo the last verdict: the points go back and the turn is open again (paused).
    angre(sp) {
      if (!M.kanAngre(sp)) return null;
      const l = sp.logg.pop();
      l.til.forEach((i) => (sp.poeng[i] = Math.max(0, sp.poeng[i] - 1)));
      sp.na.ferdig = false;
      sp.na.igjen = l.igjen;
      sp.na.pause = true;
      return l;
    },
    // On to the next pair; false when that was the last turn (the game is over).
    neste(sp) {
      if (sp.tur + 1 >= sp.turer) {
        sp.ferdig = true;
        return false;
      }
      sp.tur += 1;
      return true;
    },
    vinnere(sp) {
      const maks = Math.max(0, ...sp.poeng);
      return maks > 0 ? sp.poeng.map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0) : [];
    },
    // Laughs caused as clown (classic) and turns held as stone face, per player.
    tellinger(sp) {
      const latter = Array(sp.antall).fill(0);
      const holdt = Array(sp.antall).fill(0);
      for (const l of sp.logg) {
        if (l.hoppet) continue;
        if (l.lo === -1) {
          if (sp.modus === "dobbel") {
            holdt[l.klovn] += 1;
            holdt[l.stein] += 1;
          } else holdt[l.stein] += 1;
        } else {
          const vinner = l.lo === l.stein ? l.klovn : l.stein;
          latter[vinner] += 1;
        }
      }
      return { latter, holdt };
    },
  };
  window.RusjSteinfjeset = M;

  const R = window.Rusj;
  if (!R) return; // loaded by the unit tests

  const esc = R.esc;
  const D = window.RUSJ_DATA.oppgaver;
  const IKON = { si: "🗣️", fjes: "😝", lat: "🎭" };
  // Every task in one list, so the deck remembers what this device has already shown.
  const ALLE = [];
  for (const k of ["si", "fjes", "lat"]) (D[k] || []).forEach((t) => ALLE.push({ k, t }));
  const stokk = R.kortstokk("oppgaver", ALLE.length);
  const STD = { modus: "klassisk", tid: 30, runder: 1 };

  let H; // the actions, so one can call another
  let startetNa = false; // the turn was entered from the countdown: start the clock
  let opptatt = false; // the countdown runs: ignore extra taps

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const dobbel = (sp) => sp.modus === "dobbel";
  const rundeNr = (sp) => Math.floor(sp.tur / sp.antall) + 1;
  const tittel = (S) => (S.spill && S.spill.runder > 1 ? R.t("Runde {nr} av {alle}", { nr: rundeNr(S.spill), alle: S.spill.runder }) : R.app.navn);
  const oppgave = (q) => ALLE[q] || ALLE[0];
  const sekunder = (n) => R.flertall(n, "sekund", "sekunder");
  const LATTER = [R.t("Hahaha!"), R.t("Knakk!"), R.t("Sprakk!"), R.t("Fnis!"), R.t("Hihihi!")];

  function nyOppgave(forrige) {
    let q = stokk.neste((n) => n !== forrige);
    if (q < 0) q = 0;
    return q;
  }
  function nyTur(sp) {
    M.nyTur(sp, nyOppgave(sp.na ? sp.na.q : -1));
  }

  // ---------- Sound: stone cracking, and a giggle ----------

  function knekk() {
    R.lyd.stoy(0, 0.12, 0.3, 900);
    R.lyd.tone(180, 0, 0.18, "square", 0.12, 90);
    R.lyd.tone(660, 0.16, 0.09, "triangle", 0.14, 900);
    R.lyd.tone(720, 0.27, 0.09, "triangle", 0.14, 980);
    R.lyd.tone(800, 0.38, 0.12, "triangle", 0.14, 1100);
  }

  // ---------- The clock ----------

  const klokke = () => R.timer("sf-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const na = sp.na;
    const tur = sp.tur;
    let sist = 0;
    const t = new R.Timer({
      id: "sf-tid",
      sekunder: Math.max(0.5, na.igjen),
      visning: "sek",
      vedTikk: (sek) => {
        if (S.spill !== sp || sp.tur !== tur || na.ferdig) return;
        // Lasting the whole time: the stone face held (finish before the kit's alarm).
        if (sek <= 0) {
          ferdig(S, -1, 0);
          return;
        }
        na.igjen = t.igjen;
        if (Date.now() - sist > 900) {
          sist = Date.now();
          R.lagre();
        }
      },
      vedSlutt: () => {
        if (S.spill === sp && sp.tur === tur && !na.ferdig) ferdig(S, -1, 0);
      },
    });
    t.total = sp.tid; // the ring shows the whole turn, also after a pause or a reload
    return t;
  }
  function pause(S) {
    const na = S.spill && S.spill.na;
    if (!na || na.ferdig || na.pause || na.igjen <= 0) return;
    const t = klokke();
    if (t) {
      t.pause();
      na.igjen = Math.max(0.5, t.igjen);
    }
    na.pause = true;
    if (S.skjerm === "spill") R.vis();
  }
  function fortsett(S) {
    const na = S.spill && S.spill.na;
    if (!na || na.ferdig || na.igjen <= 0) return;
    na.pause = false;
    const t = klokke() || lagKlokke(S);
    R.vis();
    t.start();
    R.holdVaken();
  }
  // A phone that is locked or switches app in the middle of a turn pauses it.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "spill") pause(S);
  });

  // The verdict: lo = who laughed (−1: nobody).
  function ferdig(S, lo, igjen) {
    const sp = S.spill;
    if (!sp || !sp.na || sp.na.ferdig) return;
    const t = klokke();
    const rest = igjen != null ? igjen : t ? t.igjen : sp.na.igjen;
    if (t) t.stopp();
    const l = M.dom(sp, lo, rest);
    if (!l) return;
    if (lo === -1) {
      R.lyd.fanfare();
      R.vibrer([30, 40, 60]);
    } else {
      knekk();
      R.vibrer([60, 40, 140]);
    }
    R.gaTil("ute");
  }

  // ---------- Pieces ----------

  // Progress dots for this round, in turn order and in each clown's own colour.
  function prikker(sp) {
    const forste = sp.tur - (sp.tur % sp.antall);
    const na = sp.tur % sp.antall;
    return `<div class="fremdrift" aria-hidden="true">${Array.from({ length: sp.antall }, (_, k) => {
      const i = M.par(sp.antall, sp.start, forste + k)[0];
      return `<span class="prikk ${k === na ? "na" : k < na ? "ferdig" : ""}" style="--pf: var(--p${(i % 20) + 1})"></span>`;
    }).join("")}</div>`;
  }

  // The two players face to face: clown on the left, stone face on the right.
  function duell(sp, o = {}) {
    const { klovn, stein } = sp.na;
    const rolle = (i, merke, navn) => `<div class="sf-spiller">
        <span class="sf-avatar">${R.avatar(i, o.liten ? "mid" : "stor")}<span class="sf-merke" aria-hidden="true">${merke}</span></span>
        <b>${esc(R.navn(i))}</b><small>${esc(navn)}</small>
      </div>`;
    return `<div class="sf-duell${o.liten ? " liten" : ""}">
      ${dobbel(sp) ? rolle(klovn, "🤪", R.t("Ikke le!")) : rolle(klovn, "🤡", R.t("Klovnen"))}
      ${o.midtHtml || `<span class="sf-mot" aria-hidden="true">${dobbel(sp) ? "⚡" : "vs"}</span>`}
      ${dobbel(sp) ? rolle(stein, "🤪", R.t("Ikke le!")) : rolle(stein, "🗿", R.t("Steinfjeset"))}
    </div>`;
  }

  function oppgaveKort(q, kompakt) {
    const o = oppgave(q);
    return R.ui.storkort({ tekst: o.t, etikett: R.t("Oppgaven"), nr: IKON[o.k] || "", kompakt, klasse: "sf-kort" });
  }

  const rader = (sp, pluss) => sp.poeng.map((poeng, i) => ({ i, poeng, pluss: pluss && pluss.includes(i) ? "1" : null }));
  function stilling(sp, pluss) {
    const alle = rader(sp, pluss);
    if (alle.length <= 6) return R.ui.poengliste(alle);
    const topp = alle.slice().sort((a, b) => b.poeng - a.poeng).slice(0, 5);
    return `${R.ui.poengliste(topp)}<p class="hjelp">${esc(R.t("Topp fem av {n}. Hele lista kommer på slutten.", { n: alle.length }))}</p>`;
  }

  // ---------- The game ----------

  R.start({
    id: "steinfjeset",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 2, 2, 12),
      oppsett: Object.assign({}, STD),
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({}, STD, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      if (!MODUSER.includes(o.modus)) o.modus = "klassisk";
      if (!TIDER.includes(o.tid)) o.tid = 30;
      if (!RUNDER.includes(o.runder)) o.runder = 1;
      S.antall = R.klamp(Number(S.antall) || 2, 2, 12);
      const sp = S.spill;
      const ok =
        sp &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 2 &&
        sp.antall <= 12 &&
        MODUSER.includes(sp.modus) &&
        TIDER.includes(sp.tid) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === sp.antall &&
        Array.isArray(sp.logg) &&
        Number.isInteger(sp.tur) &&
        sp.tur < sp.turer &&
        sp.na &&
        ALLE[sp.na.q] &&
        Number.isInteger(sp.na.klovn) &&
        Number.isInteger(sp.na.stein);
      if (sp && !ok) S.spill = null;
      if (!S.spill && !["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "spill" && S.spill.na.ferdig) S.skjerm = "ute";
    },

    regler: {
      intro: R.t("To og to sitter ansikt til ansikt. Klovnen gjør en tullete oppgave fra mobilen – steinfjeset må holde maska. Ikke le!"),
      steg: [
        [R.t("Klovnen ser oppgaven"), R.t("Klovnen holder mobilen og holder fingeren på kortet for å se oppgaven. Steinfjeset vet ikke hva som kommer.")],
        [R.t("Tull i vei!"), R.t("Klokka går. Klovnen gjør alt for å få steinfjeset til å le – men ingen kiling og ingen dytting.")],
        [R.t("Lo hen?"), R.t("Ler steinfjeset, trykker dere «Hen lo!» og klovnen får et poeng. Holder steinfjeset maska til tiden er ute, får steinfjeset poenget.")],
      ],
      tips: [
        R.t("Et smil teller ikke – det må være et ordentlig fnis eller en latter. Dere bestemmer selv hvor strengt det er."),
        R.t("I hver runde er alle klovn én gang og steinfjes én gang, og det blir nye par hver runde."),
        R.t("Dobbel trøbbel: Begge gjør oppgaven samtidig og prøver å få den andre til å le. Den som ler først, gir den andre poenget. Ler ingen, får begge et poeng."),
        R.t("Trykket noen feil? «Angre» tar poenget tilbake."),
        R.t("Det er alltid lov å bytte oppgave eller stå over en tur."),
      ],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp || !sp.na) return { html: "" };
        const o = oppgave(sp.na.q);
        return { html: `<span class="sf-bak"><small>${esc(R.t("Din oppgave"))}</small><b class="kort-ord">${esc(o.t)}</b></span>`, klasse: "sf-bakside", si: o.t };
      },
      sett(S) {
        const sp = S.spill;
        if (sp && sp.na && !sp.na.sett) {
          sp.na.sett = true;
          if (S.skjerm === "par") R.vis();
        }
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Klovnen tuller – steinfjeset må holde maska."))}<br><em>${esc(R.t("Den som ler, taper!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · {a} mot {b}", { a: R.navn(S.spill.na.klovn), b: R.navn(S.spill.na.stein) }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["2–12", R.t("spillere")],
              [String(ALLE.length), R.t("oppgaver")],
              ["30 s", R.t("per duell")],
            ],
          }),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan vil dere spille?"))}</h2>
              ${R.ui.fliser("modus", [
                { v: "klassisk", ikon: "🗿", tittel: R.t("Klovn mot steinfjes"), tekst: R.t("Én tuller, én holder maska.") },
                { v: "dobbel", ikon: "🤪", tittel: R.t("Dobbel trøbbel"), tekst: R.t("Begge tuller – den som ler først, taper.") },
              ], o.modus)}
            </section>
            ${R.ui.spillere({ min: 2, max: 12, hjelp: o.modus === "dobbel" ? R.t("To og to møtes. Alle får to dueller per runde.") : R.t("Alle blir klovn og steinfjes, med nye par hver runde.") })}
            <div class="sf-to">
              <section class="seksjon"><h2>${esc(R.t("Tid"))}</h2>${R.ui.seg("tid", TIDER.map((t) => [t, R.t("{n} s", { n: t })]), o.tid, { etikett: R.t("Tid per duell") })}</section>
              <section class="seksjon"><h2>${esc(R.t("Runder"))}</h2>${R.ui.seg("runder", RUNDER.map((r) => [r, String(r)]), o.runder, { etikett: R.t("Antall runder") })}</section>
            </div>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { ikon: "🗿" }))}`;
        },
      },

      // Who meets whom, and the secret task for the clown.
      par: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const na = sp.na;
          const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
          if (dobbel(sp)) {
            return `
              ${prikker(sp)}
              <h1 class="vh" id="skjerm-tittel">${esc(R.t("{a} mot {b}", { a: R.navn(na.klovn), b: R.navn(na.stein) }))}</h1>
              ${duell(sp)}
              <p class="hjelp sf-tett">${esc(R.t("Sett dere ansikt til ansikt. Begge gjør dette samtidig:"))}</p>
              ${oppgaveKort(na.q, true)}
              ${R.ui.dokk(R.ui.knapp(R.t("Start"), "klar", { ikon: "⚡" }), R.ui.lenkerad(R.ui.lenke(R.t("Bytt oppgave"), "bytt"), R.ui.lenke(R.t("Stå over"), "sta-over"), avslutt))}`;
          }
          const hjelp = na.sett
            ? R.t("Klar? Trykk start og sett i gang – {navn} må holde maska!", { navn: R.navn(na.stein) })
            : R.t("{klovn} holder mobilen og ser på kortet. {stein} ser bort.", { klovn: R.navn(na.klovn), stein: R.navn(na.stein) });
          return `
            ${prikker(sp)}
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{a} mot {b}", { a: R.navn(na.klovn), b: R.navn(na.stein) }))}</h1>
            ${duell(sp)}
            <p class="hjelp sf-tett">${esc(hjelp)}</p>
            ${R.ui.mappe({ id: "oppgave", etikett: R.t("Hemmelig oppgave"), tekst: R.t("Hold fingeren på kortet for å se"), etikettAria: R.t("Hold fingeren på kortet for å se oppgaven") })}
            ${R.ui.dokk(
              R.ui.knapp(na.sett ? R.t("Start") : R.t("Se oppgaven først"), "klar", { ikon: "🤡", av: !na.sett }),
              R.ui.lenkerad(R.ui.lenke(R.t("Bytt oppgave"), "bytt"), R.ui.lenke(R.t("Stå over"), "sta-over"), avslutt),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "par";
        },
      },

      // The duel: the clock runs.
      spill: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const na = sp.na;
          const ute = na.igjen <= 0;
          const pauset = !ute && (na.pause || (!startetNa && !klokke()));
          const avslutt = R.ui.lenke(R.t("Avslutt"), "avslutt");
          const { klovn, stein } = na;
          let dokk;
          if (ute) {
            // Only after «Angre» on a turn where the time ran out: the group judges by hand.
            dokk = dobbel(sp)
              ? R.ui.dokk(`<div class="sf-knapper">${R.ui.knapp(R.t("{navn} lo", { navn: R.navn(klovn) }), "lo", { v: klovn, variant: "rod" })}${R.ui.knapp(R.t("{navn} lo", { navn: R.navn(stein) }), "lo", { v: stein, variant: "rod" })}</div>`, R.ui.knapp(R.t("Ingen lo!"), "klarte", { variant: "mynte" }), R.ui.lenkerad(avslutt))
              : R.ui.dokk(`<div class="sf-knapper">${R.ui.knapp(R.t("Hen lo!"), "lo", { v: stein, variant: "rod", ikon: "😂" })}${R.ui.knapp(R.t("Klarte det!"), "klarte", { variant: "mynte", ikon: "🗿" })}</div>`, R.ui.lenkerad(avslutt));
          } else if (pauset) {
            dokk = R.ui.dokk(R.ui.knapp(R.t("Fortsett"), "fortsett-tur", { ikon: "▶" }), R.ui.lenkerad(dobbel(sp) ? "" : R.ui.lenke(R.t("Hen lo!"), "lo", { v: stein }), avslutt));
          } else {
            dokk = dobbel(sp)
              ? R.ui.dokk(`<div class="sf-knapper">${R.ui.knapp(R.t("{navn} lo", { navn: R.navn(klovn) }), "lo", { v: klovn, variant: "rod", stille: true })}${R.ui.knapp(R.t("{navn} lo", { navn: R.navn(stein) }), "lo", { v: stein, variant: "rod", stille: true })}</div>`, R.ui.lenkerad(R.ui.lenke(R.t("Pause"), "pause")))
              : R.ui.dokk(R.ui.knapp(R.t("Hen lo!"), "lo", { v: stein, variant: "rod", ikon: "😂", stille: true }), R.ui.lenkerad(R.ui.lenke(R.t("Pause"), "pause")));
          }
          const skilt = ute ? `⏱ ${esc(R.t("Tiden er ute – lo noen?"))}` : pauset ? `⏸ ${esc(R.t("Pause"))}` : esc(R.t("Ikke le!"));
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{a} mot {b}", { a: R.navn(klovn), b: R.navn(stein) }))}</h1>
            ${duell(sp, { liten: true, midtHtml: ute ? `<span class="sf-mot" aria-hidden="true">⏱</span>` : R.ui.timer({ id: "sf-tid", sekunder: na.igjen, visning: "sek" }) })}
            <p class="sf-skilt${pauset || ute ? " pause" : ""}">${skilt}</p>
            <div class="sf-kortplass${pauset ? " pauset" : ""}">${oppgaveKort(na.q, true)}</div>
            ${dokk}`;
        },
        etter() {
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "spill";
          const fersk = startetNa;
          startetNa = false;
          if (!sp.na || sp.na.ferdig || sp.na.igjen <= 0) return;
          const t = lagKlokke(S);
          if (fersk && !sp.na.pause) {
            t.start();
            R.holdVaken();
          } else {
            sp.na.pause = true;
            R.vis();
          }
        },
        ut(S) {
          const sp = S.spill;
          const t = klokke();
          if (sp && sp.na && t && !sp.na.ferdig && sp.na.igjen > 0) {
            sp.na.igjen = Math.max(0.5, t.igjen);
            sp.na.pause = true;
          }
        },
      },

      // The verdict of a duel.
      ute: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const l = sp.logg[sp.logg.length - 1];
          const siste = sp.tur + 1 >= sp.turer;
          const [nk, ns] = siste ? [0, 0] : M.par(sp.antall, sp.start, sp.tur + 1);
          let topp;
          if (l.lo === -1) {
            const hvem = l.til.length > 1 ? R.t("Begge holdt maska!") : R.t("{navn} holdt maska!", { navn: R.navn(l.stein) });
            topp = `<div class="sf-holdt">
                <div class="stempel-sted"><span class="stempel mynte">${esc(R.t("Steinhardt!"))}</span></div>
                <span class="sf-vinnere">${l.til.map((i) => R.avatar(i, "gigant")).join("")}</span>
                <h1 id="skjerm-tittel">${esc(hvem)}</h1>
                <p class="ingress">${esc(R.t("Ikke en mine i {tid}.", { tid: sekunder(sp.tid) }))}</p>
              </div>`;
          } else {
            const vinner = l.til[0];
            const tekst = dobbel(sp) ? R.t("{navn} lo først!", { navn: R.navn(l.lo) }) : R.t("{klovn} fikk {stein} til å le!", { klovn: R.navn(l.klovn), stein: R.navn(l.stein) });
            topp = `<div class="sf-knakk">
                <div class="sf-stein">${R.figur()}<span class="sf-boble">${esc(LATTER[(sp.tur + l.q) % LATTER.length])}</span></div>
                <h1 id="skjerm-tittel">${esc(tekst)}</h1>
                <p class="ingress">${esc(R.t("Poenget går til {navn}.", { navn: R.navn(vinner) }))}</p>
              </div>`;
          }
          const neste = siste ? R.t("Se hvem som vant") : R.t("Neste: {a} mot {b}", { a: R.navn(nk), b: R.navn(ns) });
          return `
            ${topp}
            <div class="sf-stilling">${stilling(sp, l.til)}</div>
            ${R.ui.dokk(
              R.ui.knapp(neste, "neste-par", { ikon: siste ? "🏆" : "🗿" }),
              R.ui.lenkerad(M.kanAngre(sp) ? R.ui.lenke(R.t("Angre"), "angre") : "", siste ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "ute";
          const l = sp.logg[sp.logg.length - 1];
          if (l && l.lo === -1 && !l.feiret) {
            l.feiret = true;
            R.lagre();
            R.konfetti();
          }
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const vinnere = M.vinnere(sp);
          const maks = Math.max(0, ...sp.poeng);
          const alle = rader(sp);
          let figur = R.ui.figur(null, { stemning: "" });
          let etikett = R.t("Ingen vinner");
          let tittelTekst = R.t("Ingen poeng i kveld");
          let ingress = R.t("Ingen duell ble ferdig. Prøv igjen – og husk: ikke le!");
          if (vinnere.length === 1) {
            figur = `<span class="sf-vinner">${R.avatar(vinnere[0], "gigant")}<span class="sf-krone" aria-hidden="true">🗿</span></span>`;
            etikett = R.t("Kveldens steinfjes");
            tittelTekst = R.t("{navn} vinner!|{navn} vinner!", { navn: R.navn(vinnere[0]), n: 1 });
            ingress = R.t("{poeng} – både som klovn og som stein.", { poeng: R.flertall(maks, "poeng", "poeng") });
          } else if (vinnere.length > 1) {
            figur = `<span class="sf-delt">${vinnere.slice(0, 4).map((i) => R.avatar(i, "stor")).join("")}</span>`;
            etikett = R.t("Delt seier");
            tittelTekst = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((i) => R.navn(i))), n: vinnere.length });
            ingress = R.t("Like mange poeng: {poeng} hver.", { poeng: R.flertall(maks, "poeng", "poeng") });
          }
          const { latter, holdt } = M.tellinger(sp);
          const priser = [];
          const best = (liste) => {
            const m = Math.max(0, ...liste);
            return m > 0 ? { m, hvem: liste.map((v, i) => (v === m ? i : -1)).filter((i) => i >= 0) } : null;
          };
          const morsom = best(latter);
          if (morsom) priser.push({ ikon: "🤡", tittel: dobbel(sp) ? R.t("Flest seirer i duell") : R.t("Morsomste klovn"), tekst: `${R.ramsOpp(morsom.hvem.map((i) => R.navn(i)))} – ${R.flertall(morsom.m, "latter", "latter")}` });
          const hard = best(holdt);
          if (hard) priser.push({ ikon: "🗿", tittel: R.t("Hardeste stein"), tekst: `${R.ramsOpp(hard.hvem.map((i) => R.navn(i)))} – ${R.t("holdt maska {n} gang|holdt maska {n} ganger", { n: hard.m })}` });
          return `
            <div class="banner aksent${vinnere.length > 1 ? " sf-delt-banner" : ""}">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittelTekst)}</h1>
              <p class="ingress">${esc(ingress)}</p>
            </div>
            ${maks > 0 ? R.ui.pall(alle) + R.ui.poengliste(alle) : ""}
            ${priser.length ? `<ul class="sf-priser">${priser.map((p) => `<li><span class="sf-pris-ikon" aria-hidden="true">${p.ikon}</span><span><b>${esc(p.tittel)}</b><small>${esc(p.tekst)}</small></span></li>`).join("")}</ul>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          const forste = !sp.feiret;
          sp.ferdig = true;
          sp.feiret = true;
          sp.skjerm = "slutt";
          R.slippVaken();
          R.lagre();
          if (!forste) return;
          R.statistikk("ferdig", { spillere: sp.antall, turer: sp.logg.length, modus: sp.modus });
          R.kveld.registrer(rader(sp).map((r) => ({ i: r.i, poeng: r.poeng })));
          if (sp.poeng.some((p) => p > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const iGang = pagar(S);
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang)) || !fortsatt()) return;
        if (iGang) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        R.holdVaken();
        if (sp.na.ferdig) R.gaTil("ute");
        else if (sp.skjerm === "spill") R.gaTil("spill");
        else R.gaTil("par");
      },
      regler(el, e, S) {
        if (S.skjerm === "spill") pause(S);
        R.visRegler();
      },
      modus(el, e, S) {
        if (MODUSER.includes(el.dataset.v)) S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      async start(el, e, S) {
        const o = S.oppsett;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        const antall = R.klamp(S.antall, 2, 12);
        S.spill = M.nyttSpill(o, antall, R.heltall(0, antall - 1));
        nyTur(S.spill);
        R.statistikk("start", { spillere: antall, tid: o.tid, runder: o.runder, modus: o.modus });
        R.holdVaken();
        R.gaTil("par");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || sp.na.ferdig || S.skjerm !== "par") return;
        sp.na.q = nyOppgave(sp.na.q);
        sp.na.sett = false;
        R.lyd.snu();
        R.vis();
        R.toast(dobbel(sp) ? R.t("Ny oppgave!") : R.t("Ny oppgave – hold fingeren på kortet for å se"));
      },
      async klar(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || sp.na.ferdig || opptatt) return;
        if (!dobbel(sp) && !sp.na.sett) return;
        opptatt = true;
        R.holdVaken();
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", R.t("IKKE LE!")], 700);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        sp.na.igjen = sp.tid;
        sp.na.pause = false;
        startetNa = true;
        R.gaTil("spill");
      },
      async "sta-over"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || sp.na.ferdig) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Stå over denne duellen?"), R.t("Helt greit! Ingen får poeng, og turen går videre."), R.t("Stå over"), R.t("Avbryt"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        M.staOver(sp);
        if (!M.neste(sp)) {
          R.gaTil("slutt");
          return;
        }
        nyTur(sp);
        R.gaTil("par");
      },
      lo(el, e, S) {
        const sp = S.spill;
        if (S.skjerm !== "spill" || !sp || !sp.na) return;
        ferdig(S, Number(el.dataset.v));
      },
      klarte(el, e, S) {
        if (S.skjerm !== "spill") return;
        ferdig(S, -1);
      },
      pause: (el, e, S) => pause(S),
      "fortsett-tur": (el, e, S) => fortsett(S),
      angre(el, e, S) {
        const sp = S.spill;
        if (!M.angre(sp)) return;
        R.lyd.snu();
        R.gaTil("spill");
      },
      "neste-par"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.na || !sp.na.ferdig) return;
        if (!M.neste(sp)) {
          R.gaTil("slutt");
          return;
        }
        nyTur(sp);
        R.gaTil("par");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (S.skjerm === "spill") pause(S);
        const harPoeng = sp.poeng.some((p) => p > 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), harPoeng ? R.t("Den som har flest poeng så langt, vinner.") : R.t("Ingen har fått poeng ennå."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (!harPoeng) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        sp.ferdig = true;
        R.gaTil("slutt");
      },
    }),
  });
})();
