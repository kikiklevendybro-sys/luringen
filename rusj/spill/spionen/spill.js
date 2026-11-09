/* Spionen — "Find the spy".
   Everyone gets the same secret place and a role there, except the spy, who gets nothing.
   Two ways to play:
   - one phone passed around the table (hold-to-reveal cards), or
   - each on their own phone: the host shows a join code + QR; every phone picks its seat and
     computes the same round from the code alone (seed, player count, spy count and packs,
     salted with a hash of the place list). Nothing is sent anywhere. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;

  const PAKKER = D.steder.pakker;
  const STEDER = [];
  PAKKER.forEach((p) => p.steder.forEach((s) => STEDER.push({ p: p.id, navn: s.navn, ikon: s.ikon, roller: s.roller })));
  const SPORSMAL = D.sporsmal;
  const pakke = (id) => PAKKER.find((p) => p.id === id);

  const HOLD = "Hold fingeren på kortet for å se";
  const MIN = 3;
  const MAKS = 12;
  const TIDER = [5, 8, 10];
  const STANDARD_PAKKER = ["hverdag", "norge"];
  const maksSpioner = (n) => (n >= 7 ? 2 : 1);
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const stokk = R.kortstokk("steder", STEDER.length);
  let H; // the actions, so one action can reuse another

  // ---------- Join codes ----------
  // players-3 (4 bits) | spies-1 (1) | one bit per pack | seed (24), plus two check symbols → 9
  // characters. The check symbols catch almost every typo, and they are salted with a hash of the
  // place list, so a phone with other content rejects the code instead of showing another place.
  const BREDDER = [4, 1, PAKKER.length, 24];
  const SJEKK = 2;
  const SALT = R.hash(JSON.stringify(PAKKER));
  const KODELENGDE = R.kode.lengde(BREDDER, SJEKK);

  function lagKode(o) {
    const maske = PAKKER.reduce((m, p, i) => (o.pakker.includes(p.id) ? m + 2 ** (PAKKER.length - 1 - i) : m), 0);
    return R.kode.lag([o.antall - MIN, o.spioner - 1, maske, o.fro], BREDDER, SALT, SJEKK);
  }

  function lesKode(tekst) {
    const v = R.kode.les(tekst, BREDDER, SALT, SJEKK);
    if (!v) return null;
    const antall = v[0] + MIN;
    const spioner = v[1] + 1;
    const pakker = PAKKER.filter((p, i) => Math.floor(v[2] / 2 ** (PAKKER.length - 1 - i)) % 2).map((p) => p.id);
    if (antall > MAKS || spioner > maksSpioner(antall) || !pakker.length) return null;
    return { kode: R.kode.normaliser(tekst), antall, spioner, pakker, fro: v[3] };
  }

  // The join link carries the round too (…/#CODE_3), so a late joiner lands in the right round.
  const lenkeFor = (sp) => R.kode.lenke(sp.kode) + (sp.runde > 1 ? "_" + sp.runde : "");

  function kodeFeil(tekst) {
    const ren = R.kode.normaliser(tekst);
    if (!ren) return "Skriv inn koden først.";
    if (ren.length !== KODELENGDE) return `Koden har ${KODELENGDE} tegn – du har skrevet ${ren.length}.`;
    return "Koden stemmer ikke. Sjekk skrivefeil – og at alle har lastet inn siden på nytt.";
  }

  // ---------- Rounds ----------

  // Indexes of the places in the chosen packs.
  function utvalg(pakker) {
    const valgt = new Set(pakker);
    return STEDER.map((s, i) => i).filter((i) => valgt.has(STEDER[i].p));
  }

  const laastPlass = (S, kode) => (S.laste && Number.isInteger(S.laste[kode]) ? S.laste[kode] : null);

  // Everything about one round. Same settings + seed + round number → the same round on every phone.
  function lagRunde(o, runde) {
    const rekke = R.stokk(utvalg(o.pakker), R.rng(R.hash("steder:" + o.fro)));
    const t = R.rng(R.hash("runde:" + o.fro + ":" + runde));
    const spioner = R.stokk(range(o.antall), t)
      .slice(0, o.spioner)
      .sort((a, b) => a - b);
    const starter = Math.floor(t() * o.antall);
    const rollerekke = R.stokk(range(7), t);
    let k = 0;
    const roller = range(o.antall).map((i) => (spioner.includes(i) ? -1 : rollerekke[k++ % 7]));
    return { sted: rekke[(runde - 1) % rekke.length], spioner, starter, roller };
  }

  const erSpion = (r, i) => r.spioner.includes(i);
  const rolleFor = (r, i) => {
    const roller = STEDER[r.sted].roller;
    return roller[r.roller[i] % roller.length];
  };

  // What one seat sees on the hold-to-reveal card. Spy and place cards share one layout and
  // one colour, so nobody can tell them apart from across the table.
  function kortHtml(r, plass) {
    if (erSpion(r, plass)) {
      return {
        klasse: "sp-kort",
        html: `
          <span class="kort-etikett">Du er</span>
          <span class="sp-kort-ikon" aria-hidden="true">🕵️</span>
          <span class="kort-ord">Spionen</span>
          <span class="sp-rolle"><small>Oppdraget ditt</small>Finn ut hvor dere er – uten at noen skjønner at du ikke vet det.</span>
          <span class="kort-fot">${r.spioner.length > 1 ? "Dere er to spioner. Du vet ikke hvem den andre er." : "Lytt godt og bløff!"}</span>`,
      };
    }
    const s = STEDER[r.sted];
    return {
      klasse: "sp-kort",
      html: `
        <span class="kort-etikett">📍 Stedet er</span>
        <span class="sp-kort-ikon" aria-hidden="true">${esc(s.ikon)}</span>
        <span class="kort-ord ${R.lengdeKlasse(s.navn.replace(/\u00ad/g, ""))}">${esc(s.navn)}</span>
        <span class="sp-rolle"><small>Du er</small>${esc(rolleFor(r, plass))}</span>
        <span class="kort-fot">Ikke si stedet høyt!</span>`,
    };
  }

  // ---------- Clock (survives reloads: the end time is saved in S) ----------

  const igjenMs = (k) => (k.slutt ? Math.max(0, k.slutt - Date.now()) : k.igjen);

  function startKlokke(S) {
    const k = S.spill.klokke;
    if (k.gaar && !k.slutt) k.slutt = Date.now() + k.igjen;
    const igjen = igjenMs(k);
    const t = new R.Timer({ id: "klokke", sekunder: k.total, vedSlutt: () => tidenUte(S) });
    t.igjenMs = igjen;
    if (igjen <= 0) {
      // Coming back to a clock that has run out: show it, but don't jump anywhere by itself.
      k.igjen = 0;
      k.slutt = null;
      k.gaar = false;
      t.tegn();
      if (!S.spill.tidUte) {
        S.spill.tidUte = true;
        R.vis();
      }
      return;
    }
    if (k.gaar) t.start();
    else t.tegn();
    R.lagre();
  }

  // When the clock runs out while you watch, the accusation opens after a moment — unless
  // someone taps «+1 min» or «Pause» first.
  let hopp = null;
  const avbrytHopp = () => {
    clearTimeout(hopp);
    hopp = null;
  };

  // Leaving the play screen stops the clock; it starts again when you come back.
  function stoppKlokke(S) {
    const k = S.spill && S.spill.klokke;
    if (!k) return;
    if (k.slutt) {
      k.igjen = Math.max(0, k.slutt - Date.now());
      k.slutt = null;
    }
  }

  function tidenUte(S) {
    const sp = S.spill;
    if (!sp || S.skjerm !== "runde") return;
    sp.klokke.igjen = 0;
    sp.klokke.slutt = null;
    sp.klokke.gaar = false;
    sp.tidUte = true;
    sp.anklaget = null;
    R.vis();
    avbrytHopp();
    const fortsatt = R.vakt();
    hopp = setTimeout(() => {
      hopp = null;
      if (fortsatt() && S.spill && S.spill.tidUte) R.gaTil("anklage");
    }, 2600);
    R.vedForlat(avbrytHopp);
  }

  // ---------- Small building blocks ----------

  // Big player names shrink a little when a single word is long, so they never break mid-word.
  function navnKlasse(navn) {
    const lengste = Math.max(...String(navn).split(/\s+/).map((d) => d.length));
    return lengste >= 14 ? "sp-navn-xl" : lengste >= 11 ? "sp-navn-l" : "";
  }

  const ferdigKnapp = (neste) => `<span class="sp-to-linjer"><b>Ferdig</b><small>Gi mobilen til ${esc(neste)}</small></span>`;

  function piller(liste) {
    return `<div class="sp-piller">${liste.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("")}</div>`;
  }
  const spionTekst = (n) => (n > 1 ? `${n} spioner` : "1 spion");
  // "A", "A og B", "A, B og C"
  const liste = (navn) => R.ramsOpp(navn);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  function navnerad(liste) {
    return `<span class="sp-navnerad">${liste.map((i) => `<span>${R.avatar(i)}${esc(R.navn(i))}</span>`).join("")}</span>`;
  }

  // All places in the chosen packs, grouped by pack. o.h makes them buttons (guess / cross out).
  function stedListe(pakker, o = {}) {
    return pakker
      .map((id) => {
        const p = pakke(id);
        const rader = utvalg([id])
          .map((i) => {
            const s = STEDER[i];
            const innhold = `<span class="sp-sted-ikon" aria-hidden="true">${esc(s.ikon)}</span><span>${esc(s.navn)}</span>`;
            if (!o.h) return `<li class="sp-sted">${innhold}</li>`;
            const trykket = o.kryss ? ` aria-pressed="${o.kryss.includes(i)}"` : "";
            return `<button class="sp-sted" data-h="${o.h}" data-v="${i}"${trykket}>${innhold}</button>`;
          })
          .join("");
        return `<section class="sp-stedgruppe">
          <h3><span aria-hidden="true">${esc(p.ikon)}</span> ${esc(p.navn)}</h3>
          ${o.h ? `<div class="sp-steder">${rader}</div>` : `<ul class="sp-steder">${rader}</ul>`}
        </section>`;
      })
      .join("");
  }

  function visSteder(S, gjest) {
    const pakker = gjest ? S.gjest.pakker : S.spill.pakker;
    const antall = utvalg(pakker).length;
    R.ark(`
      <h2 id="ark-tittel">Mulige steder</h2>
      <p class="ingress">Ett av disse ${antall} stedene er stedet dere er på.${gjest ? " Trykk på et sted for å krysse det ut." : ""}</p>
      ${stedListe(pakker, gjest ? { h: "kryss", kryss: S.gjest.kryss || [] } : {})}
      <button class="knapp" data-h="lukk-ark">Lukk</button>`);
  }

  function visIde() {
    R.ark(`
      <h2 id="ark-tittel">Trenger du et spørsmål?</h2>
      <p class="sp-ide">«${esc(R.velg(SPORSMAL))}»</p>
      <p class="hjelp">Still det til hvem som helst. Svar ærlig – men ikke så tydelig at spionen skjønner stedet.</p>
      <div class="knapprad">
        ${R.ui.knapp2("Et annet", "ide")}
        ${R.ui.knapp("Takk!", "lukk-ark")}
      </div>`);
  }

  // ---------- Game flow ----------

  function startSpill(S) {
    const o = S.oppsett;
    const antall = R.klamp(S.antall, MIN, MAKS);
    const sp = {
      salt: SALT,
      modus: o.modus,
      antall,
      spioner: Math.min(o.spioner, maksSpioner(antall)),
      tid: o.tid,
      pakker: PAKKER.map((p) => p.id).filter((id) => o.pakker.includes(id)),
      fro: R.nyttFro() % 2 ** 24,
      runde: 0,
      poeng: range(antall).map(() => 0),
      vertPlass: null,
    };
    if (sp.modus === "hver") sp.kode = lagKode(sp);
    S.spill = sp;
    R.holdVaken();
    nyRunde(S);
  }

  function nyRunde(S) {
    const sp = S.spill;
    sp.runde += 1;
    if (sp.modus === "hver") {
      sp.r = lagRunde(sp, sp.runde);
    } else {
      // One phone: real randomness every round, and a deck that avoids repeating places.
      sp.r = lagRunde(Object.assign({}, sp, { fro: R.nyttFro() }), 1);
      const pool = new Set(utvalg(sp.pakker));
      sp.r.sted = stokk.neste((i) => pool.has(i));
    }
    sp.vis = { i: 0, sett: false };
    sp.vertSett = false;
    sp.klokke = { total: sp.tid * 60, igjen: sp.tid * 60 * 1000, slutt: null, gaar: true };
    sp.anklaget = null;
    sp.tidUte = false;
    sp.avslort = false;
    sp.gjetter = null;
    sp.gjett = null;
    sp.svart = false;
    sp.utfall = null;
    sp.feiret = false;
    R.gaTil(sp.modus === "hver" ? (sp.runde === 1 ? "kode" : "vert") : "vis");
  }

  // Countdown overlays: one at a time, even if a button is tapped twice.
  // Resolves false if the countdown is already running or the screen changed during it.
  let teller = false;
  async function nedtelling(liste, ms) {
    if (teller) return false;
    teller = true;
    try {
      return await R.nedtelling(liste, ms);
    } finally {
      teller = false;
    }
  }

  async function startRunde(S) {
    const fortsatt = R.vakt();
    if (!(await nedtelling(["3", "2", "1", "SPØR!"], 650)) || !fortsatt() || !S.spill) return;
    R.lyd.pek();
    R.gaTil("runde");
  }

  function ferdigRunde(S, spionVant, grunn) {
    const sp = S.spill;
    if (!sp.utfall) {
      const pluss = range(sp.antall).map((i) => (erSpion(sp.r, i) ? (spionVant ? 2 : 0) : spionVant ? 0 : 1));
      sp.poeng = sp.poeng.map((p, i) => p + pluss[i]);
      sp.utfall = { spionVant, grunn, pluss };
    }
    R.gaTil("resultat");
  }

  function grunnTekst(sp) {
    const u = sp.utfall;
    const flere = sp.r.spioner.length > 1;
    const spion = flere ? "Spionene" : "Spionen";
    const gjett = sp.gjett != null ? STEDER[sp.gjett].navn : "";
    switch (u.grunn) {
      case "gjettet":
        return sp.gjetter === "tatt" ? `Dere tok spionen – men spionen gjettet riktig: ${gjett}.` : `Spionen avslørte seg og gjettet riktig: ${gjett}.`;
      case "feilgjett":
        return sp.gjetter === "tatt" ? `Spionen ble tatt og gjettet feil: ${gjett}.` : `Spionen avslørte seg, men gjettet feil: ${gjett}.`;
      case "uskyldig":
        return `${R.navn(sp.anklaget)} var uskyldig, så ${spion.toLowerCase()} slapp unna.`;
      default:
        return `Dere ble ikke enige før tiden var ute, så ${spion.toLowerCase()} slapp unna.`;
    }
  }

  // Screens that belong to a running game: "Fortsett" brings you back to the one you left.
  const SPILLSKJERMER = ["vis", "kode", "vert", "runde", "anklage", "avslor", "gjett", "svar", "resultat", "slutt"];

  const DEF = {
    id: "spionen",
    versjon: 1,
    // A game is in progress (front page badge, screen kept awake): hosting, or holding a seat as a guest.
    pagar: (S) => pagar(S) || !!(S.gjest && S.gjest.plass != null),

    tilstand: () => ({
      antall: 4,
      oppsett: { modus: "en", spioner: 1, tid: 8, pakker: STANDARD_PAKKER.slice() },
      spill: null,
      // Seats a guest has seen a card for, per code: locked, also after leaving and rejoining.
      laste: {},
      gjest: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "en", spioner: 1, tid: 8, pakker: [] }, S.oppsett));
      if (!["en", "hver"].includes(o.modus)) o.modus = "en";
      if (!TIDER.includes(o.tid)) o.tid = 8;
      if (![1, 2].includes(o.spioner)) o.spioner = 1;
      o.pakker = (o.pakker || []).filter(pakke);
      if (!o.pakker.length) o.pakker = STANDARD_PAKKER.slice();
      const sp = S.spill;
      if (sp && (sp.salt !== SALT || !sp.r || !STEDER[sp.r.sted] || !sp.klokke)) S.spill = null;
      if (S.gjest && !lesKode(S.gjest.kode)) S.gjest = null;
      if (!S.spill && SPILLSKJERMER.includes(S.skjerm)) S.skjerm = "hjem";
      if (!S.gjest && ["plass", "gjest"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Alle får vite hvor dere er – bortsett fra spionen. Still lure spørsmål, finn spionen og pass på at spionen ikke gjetter stedet.",
      steg: [
        ["Se kortet ditt", "Alle får samme sted og en rolle der. Spionen får bare beskjeden «Du er spionen»."],
        ["Still spørsmål", "Den som starter, spør en annen om stedet. Den som svarer, spør neste. Ikke for tydelig – spionen lytter!"],
        ["Anklag eller gjett", "Trykk «Stopp» og pek på den dere mistenker. Spionen kan når som helst avsløre seg og gjette stedet."],
      ],
      tips: [
        "Tar dere spionen, får alle andre 1 poeng. Slipper spionen unna eller gjetter stedet, får spionen 2.",
        "Blir spionen tatt, får spionen likevel ett forsøk på å gjette stedet.",
        "Trykk «Steder» for å se alle mulige steder – nyttig for spionen, og for å bløffe.",
        "Hver sin mobil: én lager en kode, de andre trykker «Bli med i et spill» og velger nummeret sitt.",
        "Svar gjerne i rollen din. Det er lov å overdrive!",
      ],
    },

    hemmelig: {
      innhold(S, id) {
        // Seeing a card (even a quick peek) locks the seat, so nobody can look at other seats.
        if (id === "gjest") {
          (S.laste = S.laste || {})[S.gjest.kode] = S.gjest.plass;
          R.lagre();
          return kortHtml(lagRunde(S.gjest, S.gjest.runde), S.gjest.plass);
        }
        if (id === "vert") {
          S.spill.vertLaast = true;
          R.lagre();
          return kortHtml(S.spill.r, S.spill.vertPlass);
        }
        return kortHtml(S.spill.r, Number(String(id).slice(1)));
      },
      sett(S, id) {
        if (id === "gjest" && S.skjerm === "gjest") {
          R.vis(); // the seat is locked now: drop «Bytt nummer»
          return;
        }
        if (id === "vert" && S.skjerm === "vert") {
          S.spill.vertSett = true;
          R.vis();
        } else if (S.skjerm === "vis" && id === "p" + S.spill.vis.i && !S.spill.vis.sett) {
          S.spill.vis.sett = true;
          R.vis();
          const knapp = R.$('[data-h="vist"]');
          if (knapp) knapp.classList.add("pop");
        }
      },
    },

    // Join links: …/spionen/#CODE
    vedHash(S, hash) {
      const [kodeDel, rundeDel] = String(hash).split("_");
      const o = lesKode(kodeDel);
      if (!o) {
        S.kodeUtkast = kodeDel;
        S.kodeFeil = kodeFeil(kodeDel);
        return "bli-med";
      }
      if (!S.gjest || S.gjest.kode !== o.kode) S.gjest = Object.assign(o, { runde: 1, plass: laastPlass(S, o.kode), kryss: [] });
      const runde = Number(rundeDel);
      if (Number.isInteger(runde) && runde >= 1 && runde <= 999 && runde !== S.gjest.runde) {
        S.gjest.runde = runde;
        S.gjest.kryss = [];
      }
      R.holdVaken();
      return S.gjest.plass == null ? "plass" : "gjest";
    },

    vedSpillere(S) {
      if (S.oppsett.spioner > maksSpioner(S.antall)) S.oppsett.spioner = 1;
    },

    felt: {
      kode(S, el) {
        S.kodeUtkast = el.value;
      },
    },

    skjema: {
      kode(S, form) {
        const felt = form.querySelector("#kodefelt");
        const o = lesKode(felt.value);
        if (!o) {
          S.kodeUtkast = felt.value;
          S.kodeFeil = kodeFeil(felt.value);
          R.vis();
          const nytt = R.$("#kodefelt");
          if (nytt) {
            nytt.classList.add("risting");
            nytt.focus();
          }
          R.lyd.feil();
          R.vibrer(120);
          return;
        }
        S.kodeUtkast = "";
        S.kodeFeil = "";
        if (!S.gjest || S.gjest.kode !== o.kode) S.gjest = Object.assign(o, { runde: 1, plass: laastPlass(S, o.kode), kryss: [] });
        R.lyd.riktig();
        R.holdVaken();
        R.gaTil(S.gjest.plass == null ? "plass" : "gjest");
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Alle vet hvor dere er.<br><em>Bortsett fra spionen.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · runde ${S.spill.runde}` : "",
              ekstraHtml:
                (S.gjest && S.gjest.plass != null ? R.ui.knapp2(`Tilbake til kortet ditt · nr. ${S.gjest.plass + 1}`, "til-gjest") : "") +
                R.ui.knapp2("Bli med i et spill", "bli-med", { ikon: "📲" }) +
                R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–12", "spillere"],
              [String(STEDER.length), "steder"],
              ["0", "reklame"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const maks = maksSpioner(S.antall);
          const hver = o.modus === "hver";
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hvordan spiller dere?</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "en", tittel: "Én mobil", tekst: "Send den rundt bordet", ikon: "📱" },
                  { v: "hver", tittel: "Hver sin mobil", tekst: "Alle ser kortet på sin egen mobil", ikon: "📲" },
                ],
                o.modus,
              )}
            </section>
            ${R.ui.spillere({
              min: MIN,
              max: MAKS,
              hjelp: hver ? "Navnene trengs bare på denne mobilen. De andre velger nummeret sitt." : "Skriv navn – eller spill som Spiller 1, 2, 3 …",
            })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Steder</h2><span class="tall">${utvalg(o.pakker).length} steder</span></div>
              ${R.ui.fliser(
                "pakke",
                PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: p.tekst, ikon: p.ikon })),
                o.pakker,
              )}
              ${o.pakker.length ? "" : '<p class="hjelp">Velg minst én pakke.</p>'}
            </section>
            <div class="sp-to">
              <section class="seksjon">
                <h2>Spioner</h2>
                ${R.ui.seg("spioner", [[1, "1"], [2, "2"]], Math.min(o.spioner, maks), { etikett: "Antall spioner", av: (v) => Number(v) > maks })}
              </section>
              <section class="seksjon">
                <h2>Minutter</h2>
                ${R.ui.seg("tid", TIDER.map((t) => [t, String(t)]), o.tid, { etikett: "Minutter per runde" })}
              </section>
            </div>
            <p class="hjelp">${maks < 2 ? "2 spioner kan velges fra 7 spillere." : "Med 2 spioner vet ingen av dem hvem den andre er."}</p>
            ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !o.pakker.length }))}`;
        },
      },

      // One phone: the phone goes around, everyone holds to see their card.
      vis: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.vis.i;
          const siste = i === sp.antall - 1;
          return `
            ${R.ui.fremdrift(sp.antall, i)}
            <div class="sp-mottaker">
              <p class="etikett">Gi mobilen til</p>
              <h1 id="skjerm-tittel" class="spillernavn ${navnKlasse(R.navn(i))}">${R.avatar(i, "stor")}<span>${esc(R.navn(i))}</span></h1>
            </div>
            ${R.ui.mappe({ id: "p" + i, etikett: "Topphemmelig", tekst: HOLD, etikettAria: `Hold fingeren på kortet for å se kortet til ${R.navn(i)}` })}
            <p class="hjelp">${sp.vis.sett ? "Husket stedet og rollen? Trykk «Ferdig» og gi mobilen videre." : `Bare ${esc(R.navn(i))} skal se. Slipp, så skjules kortet igjen.`}</p>
            ${R.ui.dokk(R.ui.knapp(siste ? "Alle har sett – start!" : "", "vist", { av: !sp.vis.sett, tekstHtml: siste ? "" : ferdigKnapp(R.navn(i + 1)) }))}`;
        },
      },

      // Each on their own phone: the host shares the code, picks a seat and sees their card.
      // Each on their own phone, step 1: share the code.
      kode: {
        tittel: "Del koden",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const lenke = lenkeFor(sp);
          const qr = /^https?:$/.test(location.protocol) ? R.kode.qr(lenke) : "";
          const forste = sp.runde === 1;
          return `
            ${piller([`${sp.antall} spillere`, spionTekst(sp.spioner), `${utvalg(sp.pakker).length} steder`])}
            <h1 id="skjerm-tittel">Del koden med de andre</h1>
            <div class="kodekort">
              <span class="etikett">Koden til spillet</span>
              <span class="kode" id="spillkode">${esc(R.kode.formater(sp.kode))}</span>
              ${qr ? `<div class="qr">${qr}</div>` : ""}
              <div class="knapprad">${R.ui.knapp2("Kopier kode", "kopier", { variant: "liten" })}${R.ui.knapp2("Del lenke", "del", { variant: "liten" })}</div>
            </div>
            ${
              forste
                ? `<ol class="steg sp-slik">
                    <li><b>Skann QR-koden med kameraet</b><span>Eller åpne Spionen, trykk «Bli med i et spill» og skriv koden.</span></li>
                    <li><b>Velg nummeret ditt</b><span>Nummeret står ved navnet ditt på neste skjerm her.</span></li>
                  </ol>`
                : `<p class="hjelp">QR-koden går rett til runde ${sp.runde}. Skriver noen koden, trykker de «Til runde …» til de er på runde ${sp.runde}.</p>`
            }
            ${R.ui.dokk(R.ui.knapp(forste ? "Alle har koden – videre" : "Tilbake til runden", "til-vert"))}`;
        },
      },

      // Each on their own phone, step 2: the host picks a seat and sees their own card.
      vert: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: (S) => (S.spill.runde === 1 ? "kode" : "hjem"),
        vis(S) {
          const sp = S.spill;
          const forste = sp.runde === 1;
          const plasser = `<section class="seksjon" id="vert-plasser">
              <div class="seksjon-hode"><h2>${forste ? "Trykk på deg selv" : "Nummerne"}</h2><span class="tall">${sp.antall} spillere</span></div>
              <div class="sp-plasser liste">${range(sp.antall)
                .map(
                  (i) =>
                    `<button class="sp-plass" data-h="vert-plass" data-v="${i}" aria-pressed="${sp.vertPlass === i}"${sp.vertLaast && sp.vertPlass !== i ? " disabled" : ""}>${R.avatar(i)}<b>${i + 1}</b><span>${esc(R.navn(i))}</span></button>`,
                )
                .join("")}</div>
            </section>`;
          const kort =
            sp.vertPlass != null
              ? `<section class="seksjon" id="vertskort">
                  <h2>Kortet ditt</h2>
                  ${R.ui.mappe({ id: "vert", etikett: `Nr. ${sp.vertPlass + 1} · topphemmelig`, tekst: HOLD })}
                  <p class="hjelp">De andre ser kortet sitt på sin egen mobil.</p>
                </section>`
              : "";
          const knapp = sp.vertPlass == null ? "Velg nummeret ditt først" : !sp.vertSett ? "Se kortet ditt først" : "Alle har sett kortet – start!";
          return `
            <h1 id="skjerm-tittel">${forste ? "Hvem er du?" : `Runde ${sp.runde}`}</h1>
            <p class="ingress">${
              forste ? "Finn navnet ditt. Nummeret ved navnet er det de andre velger på mobilen sin." : `Alle trykker «Til runde ${sp.runde}» på mobilen sin og ser det nye kortet.`
            }</p>
            ${forste ? plasser + kort : kort + plasser}
            ${R.ui.lenke("Vis koden igjen", "vis-kode")}
            ${R.ui.dokk(R.ui.knapp(knapp, "start-klokka", { av: !sp.vertSett }))}`;
        },
      },

      runde: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const s = sp.r.starter;
          const k = sp.klokke;
          const glemt = sp.modus === "en" || sp.vertPlass != null;
          return `
            <h1 class="vh" id="skjerm-tittel">Runde ${sp.runde}: still spørsmål</h1>
            ${
              sp.tidUte
                ? `<div class="sp-tid-ute-boks"><p class="sp-tid-ute"><span aria-hidden="true">⏰</span> Tiden er ute!</p><p class="hjelp">Pek på den dere mistenker – eller gi dere ett minutt til.</p></div>`
                : `<div class="sp-starter">
                    ${R.avatar(s, "stor")}
                    <div>
                      <p class="etikett">${spionTekst(sp.r.spioner.length)} blant dere</p>
                      <p class="sp-starter-navn"><b>${esc(R.navn(s))}</b> spør først!</p>
                      <p class="sp-starter-hjelp">Spør hvem du vil om stedet. Den som svarer, spør videre.</p>
                    </div>
                  </div>`
            }
            ${R.ui.timer({
              id: "klokke",
              sekunder: Math.ceil(igjenMs(k) / 1000),
              stor: true,
              kontrollHtml: `<div class="knapprad">
                <button class="knapp-2 liten" data-h="pause" data-timer-pause>${k.gaar ? "Pause" : "Fortsett"}</button>
                ${R.ui.knapp2("+1 min", "pluss-min", { variant: "liten" })}
              </div>`,
            })}
            ${R.ui.lenkerad(R.ui.lenke("Spørsmålsideer", "ide"), glemt ? R.ui.lenke("Glemt kortet ditt?", "se-igjen") : "")}
            ${R.ui.dokk(
              R.ui.knapp(sp.tidUte ? "Hvem er spionen?" : "Stopp – vi anklager noen!", "anklag", { variant: "rosa", ikon: "✋" }),
              `<div class="knapprad sp-verktoy">${R.ui.knapp2("Steder", "steder", { ikon: "📍" })}${R.ui.knapp2("Spionen gjetter", "spion-gjetter", { ikon: "🕵️" })}</div>`,
            )}`;
        },
        inn: (S) => startKlokke(S),
        ut: (S) => stoppKlokke(S),
        etter() {
          const t = R.timer("klokke");
          if (t) t.tegn();
        },
      },

      anklage: {
        tittel: "Anklage",
        tilbake: (S) => (S.spill.tidUte ? "hjem" : "runde"),
        vis(S) {
          const sp = S.spill;
          const valgt = sp.anklaget;
          return `
            ${sp.tidUte ? '<p class="sp-tid-ute"><span aria-hidden="true">⏰</span> Tiden er ute!</p>' : ""}
            <h1 id="skjerm-tittel">Hvem er spionen?</h1>
            <p class="ingress">Tell ned – og pek samtidig på den dere mistenker. Den som får flest fingrer, blir anklaget.</p>
            ${R.ui.knapp2("3 · 2 · 1 – Pek!", "pek", { ikon: "👉" })}
            <section class="seksjon">
              <h2>Hvem fikk flest fingrer?</h2>
              ${R.ui.velgere("anklaget", range(sp.antall), valgt)}
            </section>
            ${
              sp.tidUte
                ? R.ui.lenke("Vi ble ikke enige – spionen slipper unna", "uenige")
                : R.ui.lenke("Ikke enige ennå? Spill videre", "spill-videre")
            }
            ${R.ui.dokk(R.ui.knapp(valgt != null ? `Avslør ${R.navn(valgt)}` : "Velg hvem dere anklager", "avslor", { variant: "rosa", av: valgt == null }))}`;
        },
      },

      avslor: {
        tittel: "Avsløringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const a = sp.anklaget;
          const spion = erSpion(sp.r, a);
          const flere = sp.r.spioner.length > 1;
          let tekst = "";
          let dokk = "";
          if (sp.avslort && spion) {
            tekst = `<p class="ingress midt"><b>Men vent …</b> Spionen får én sjanse til. Gjetter ${esc(R.navn(a))} stedet, vinner spionen likevel.</p>`;
            dokk = R.ui.knapp(`Gi mobilen til ${R.navn(a)}`, "til-gjett", { ikon: "🕵️" });
          } else if (sp.avslort) {
            const andre = sp.r.spioner;
            tekst = `<div class="papirboks sp-fasit"><span class="etikett">${flere ? "Spionene var" : "Spionen var"}</span>${navnerad(andre)}</div>`;
            dokk = R.ui.knapp("Se poengene", "uskyldig");
          }
          return `
            <div class="sp-spotlys${sp.avslort ? "" : " spenning"}">
              <span class="sp-skjelv">${R.avatar(a, "gigant")}</span>
              <h1 id="skjerm-tittel">${sp.avslort ? (spion ? `${esc(R.navn(a))} er ${flere ? "en spion" : "spionen"}!` : `${esc(R.navn(a))} er ikke spionen!`) : `Er ${esc(R.navn(a))} ${flere ? "en spion" : "spionen"} …?`}</h1>
              <div class="stempel-sted">${sp.avslort ? (spion ? '<span class="stempel">Avslørt!</span>' : '<span class="stempel mynte">Uskyldig</span>') : ""}</div>
            </div>
            ${tekst}
            ${dokk ? R.ui.dokk(dokk) : ""}`;
        },
        inn(S) {
          if (S.spill.avslort) return;
          R.lyd.trommevirvel(R.rolig() ? 0.6 : 2);
          const id = setTimeout(
            () => {
              const sp = S.spill;
              sp.avslort = true;
              R.vis();
              if (erSpion(sp.r, sp.anklaget)) {
                R.lyd.fanfare();
                R.vibrer([60, 30, 120]);
              } else {
                R.lyd.feil();
                R.vibrer([200]);
              }
              const el = R.$("#skjerm");
              el.classList.remove("risting");
              void el.offsetWidth;
              el.classList.add("risting");
            },
            R.rolig() ? 700 : 2150,
          );
          R.vedForlat(() => clearTimeout(id));
        },
      },

      gjett: {
        tittel: "Spionen gjetter",
        tilbake: (S) => (S.spill.gjetter === "frivillig" ? "runde" : "hjem"),
        vis(S) {
          const sp = S.spill;
          return `
            <div class="sp-gjett-topp">
              ${R.figur()}
              <div>
                <h1 id="skjerm-tittel">Hvor er dere?</h1>
                <p class="ingress">${sp.gjetter === "tatt" ? `${esc(R.navn(sp.anklaget))} velger ett sted.` : "Spionen velger ett sted."} Riktig svar gir seier – feil svar gir tap.</p>
              </div>
            </div>
            ${stedListe(sp.pakker, { h: "gjett-sted" })}`;
        },
      },

      svar: {
        tittel: "Spionens svar",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const g = STEDER[sp.gjett];
          const fasit = STEDER[sp.r.sted];
          const riktig = sp.gjett === sp.r.sted;
          return `
            <div class="sp-spotlys${sp.svart ? "" : " spenning"}">
              <p class="etikett">Spionen gjetter</p>
              <div class="sp-gjettkort"><span aria-hidden="true">${esc(g.ikon)}</span><b>${esc(g.navn)}</b></div>
              <h1 id="skjerm-tittel">${sp.svart ? (riktig ? "Spionen gjettet riktig!" : "Spionen gjettet feil!") : "Er det riktig …?"}</h1>
              <div class="stempel-sted">${sp.svart ? (riktig ? '<span class="stempel">Riktig!</span>' : '<span class="stempel mynte">Bom!</span>') : ""}</div>
            </div>
            ${
              sp.svart
                ? `<div class="papirboks sp-fasit"><span class="etikett">Stedet var</span><strong>${esc(fasit.ikon)} ${esc(fasit.navn)}</strong></div>
                   ${R.ui.dokk(R.ui.knapp("Se poengene", "se-poeng"))}`
                : ""
            }`;
        },
        inn(S) {
          if (S.spill.svart) return;
          R.lyd.trommevirvel(R.rolig() ? 0.6 : 1.8);
          const id = setTimeout(
            () => {
              const sp = S.spill;
              sp.svart = true;
              R.vis();
              if (sp.gjett === sp.r.sted) {
                R.lyd.latter();
                R.vibrer([60, 30, 120]);
              } else {
                R.lyd.fanfare();
                R.vibrer([200]);
              }
            },
            R.rolig() ? 700 : 1950,
          );
          R.vedForlat(() => clearTimeout(id));
        },
      },

      resultat: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const u = sp.utfall;
          const flere = sp.r.spioner.length > 1;
          const fasit = STEDER[sp.r.sted];
          const rader = range(sp.antall).map((i) => ({ i, poeng: sp.poeng[i], pluss: u.pluss[i] }));
          const roller = range(sp.antall)
            .map(
              (i) => `<li class="${erSpion(sp.r, i) ? "spion" : ""}">${R.avatar(i)}<span><b>${esc(R.navn(i))}</b>${
                erSpion(sp.r, i) ? "🕵️ Spionen" : esc(rolleFor(sp.r, i))
              }</span></li>`,
            )
            .join("");
          return `
            <div class="banner ${u.spionVant ? "rosa" : "mynte"}">
              ${R.figur()}
              <h1 id="skjerm-tittel">${u.spionVant ? (flere ? "Spionene vinner!" : "Spionen vinner!") : flere ? "Dere slo spionene!" : "Dere tok spionen!"}</h1>
              <p class="ingress">${esc(grunnTekst(sp))}</p>
            </div>
            <div class="papirboks sp-fasit">
              <div><span class="etikett">Stedet var</span><strong>${esc(fasit.ikon)} ${esc(fasit.navn)}</strong></div>
              <div><span class="etikett">${flere ? "Spionene var" : "Spionen var"}</span>${navnerad(sp.r.spioner)}</div>
            </div>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Poeng</h2><span class="tall">etter ${sp.runde} ${sp.runde === 1 ? "runde" : "runder"}</span></div>
              ${R.ui.poengliste(rader)}
              <p class="hjelp">Dere tar spionen: +1 til alle andre. Spionen vinner: +2.</p>
            </section>
            <section class="seksjon">
              <h2>Hvem var hvem?</h2>
              <ul class="sp-rolleliste">${roller}</ul>
            </section>
            ${R.ui.dokk(R.ui.knapp("Ny runde", "ny-runde"), R.ui.lenkerad(R.ui.lenke("Angre poengene", "angre-poeng"), R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        // One round is a small win: a short sound. The fanfare and confetti are saved for the end.
        inn(S) {
          const sp = S.spill;
          if (sp.feiret) return;
          sp.feiret = true;
          R.lagre();
          if (sp.utfall.spionVant) R.lyd.latter();
          else R.lyd.riktig();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = range(sp.antall).map((i) => ({ i, poeng: sp.poeng[i] }));
          const topp = Math.max(...sp.poeng);
          const vinnere = topp > 0 ? rader.filter((r) => r.poeng === topp).map((r) => r.i) : [];
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">Etter ${sp.runde} ${sp.runde === 1 ? "runde" : "runder"}</p>
              <h1 id="skjerm-tittel">${vinnere.length ? `${esc(liste(vinnere.map(R.navn)))} vinner!` : "Ingen poeng denne gangen"}</h1>
            </div>
            ${vinnere.length ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.ferdig) return;
          sp.ferdig = true;
          R.lagre();
          R.slippVaken();
          if (Math.max(...sp.poeng) > 0) {
            R.lyd.fanfare();
            R.konfetti();
          }
        },
      },

      // ----- Joining a game on your own phone -----

      "bli-med": {
        tittel: "Bli med",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Bli med i et spill</h1>
          <p class="ingress">Skriv koden fra mobilen til den som startet spillet – eller skann QR-koden med kameraet.</p>
          <form class="seksjon sp-kodeskjema" data-skjema="kode" autocomplete="off" novalidate>
            <label class="vh" for="kodefelt">Spillkode</label>
            <input class="kodefelt" id="kodefelt" data-felt="kode" name="kode" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="20" placeholder="ABCD EFGH J" value="${esc(S.kodeUtkast || "")}">
            <p class="feil" id="kodefeil" role="alert">${esc(S.kodeFeil || "")}</p>
            ${R.ui.dokk('<button class="knapp" type="submit">Bli med</button>')}
          </form>`,
      },

      plass: {
        tittel: "Bli med",
        tilbake: "hjem",
        vis(S) {
          const g = S.gjest;
          return `
            ${piller([`${g.antall} spillere`, spionTekst(g.spioner), `${utvalg(g.pakker).length} steder`])}
            <h1 id="skjerm-tittel">Hvilket nummer er du?</h1>
            <p class="ingress">Se på mobilen til den som laget koden. Nummeret ditt står ved navnet ditt.</p>
            <div class="sp-plasser stor">${range(g.antall)
              .map((i) => `<button class="sp-plass" data-h="gjest-plass" data-v="${i}" aria-pressed="${g.plass === i}" aria-label="Nummer ${i + 1}">${R.avatar(i)}<b>${i + 1}</b></button>`)
              .join("")}</div>
            <p class="hjelp">Ett nummer per person. Nummeret låses når du har sett kortet ditt.</p>`;
        },
      },

      gjest: {
        tittel: (S) => `Runde ${S.gjest.runde}`,
        tilbake: "hjem",
        vis(S) {
          const g = S.gjest;
          const r = lagRunde(g, g.runde);
          return `
            ${piller([`${g.antall} spillere`, spionTekst(g.spioner), `${utvalg(g.pakker).length} steder`])}
            <h1 id="skjerm-tittel" class="sp-du-er">${R.avatar(g.plass, "mid")}<span>Du er nr. ${g.plass + 1}</span></h1>
            ${R.ui.mappe({ id: "gjest", etikett: `Runde ${g.runde} · topphemmelig`, tekst: HOLD })}
            <p class="hjelp"><b>Nr. ${r.starter + 1}</b> spør først.</p>
            ${R.ui.lenkerad(
              R.ui.lenke("Spørsmålsideer", "ide"),
              laastPlass(S, g.kode) == null ? R.ui.lenke("Bytt nummer", "bytt-plass") : "",
              g.runde > 1 ? R.ui.lenke(`Tilbake til runde ${g.runde - 1}`, "gjest-forrige") : "",
              R.ui.lenke("Forlat spillet", "forlat"),
            )}
            ${R.ui.dokk(R.ui.knapp("Steder", "steder", { ikon: "📍" }), R.ui.knapp2(`Til runde ${g.runde + 1}`, "gjest-neste", { variant: "liten" }))}`;
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      fortsett: (el, e, S) => R.gaTil(S.spill.skjerm && SPILLSKJERMER.includes(S.spill.skjerm) ? S.spill.skjerm : "runde"),
      "til-gjest": () => R.gaTil("gjest"),
      "bli-med"(el, e, S) {
        S.kodeFeil = "";
        R.gaTil("bli-med");
        const felt = R.$("#kodefelt");
        if (felt) felt.focus();
      },

      // Setup
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      spioner(el, e, S) {
        S.oppsett.spioner = Number(el.dataset.v);
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        startSpill(S);
      },

      // One phone: next player
      vist(el, e, S) {
        const sp = S.spill;
        if (!sp.vis.sett) return;
        if (sp.vis.i < sp.antall - 1) {
          sp.vis = { i: sp.vis.i + 1, sett: false };
          R.lyd.pop();
          R.gaTil("vis");
        } else {
          startRunde(S);
        }
      },

      // Own phones: the host
      "vert-plass"(el, e, S) {
        const ny = Number(el.dataset.v);
        if (S.spill.vertLaast && S.spill.vertPlass !== ny) return R.toast("Nummeret er låst når du har sett kortet");
        S.spill.vertPlass = ny;
        S.spill.vertSett = false;
        R.vis();
        const kort = R.$("#vertskort");
        if (kort) kort.scrollIntoView({ behavior: R.rolig() ? "auto" : "smooth", block: "center" });
      },
      "start-klokka"(el, e, S) {
        if (S.spill.vertSett) startRunde(S);
      },
      "til-vert": () => R.gaTil("vert"),
      "vis-kode": () => R.gaTil("kode"),
      kopier: (el, e, S) => R.kopier(R.kode.formater(S.spill.kode)),
      del: (el, e, S) => R.del("Spionen", `Bli med i Spionen! Koden er ${R.kode.formater(S.spill.kode)}.`, lenkeFor(S.spill)),

      // Play
      pause(el, e, S) {
        const k = S.spill.klokke;
        const t = R.timer("klokke");
        avbrytHopp(); // staying put: no jump to the accusation
        if (k.gaar) {
          k.igjen = igjenMs(k);
          k.slutt = null;
          k.gaar = false;
          if (t) t.pause();
        } else if (k.igjen > 0) {
          k.gaar = true;
          k.slutt = Date.now() + k.igjen;
          if (t) t.start();
        }
        R.lagre();
      },
      "pluss-min"(el, e, S) {
        const sp = S.spill;
        const k = sp.klokke;
        avbrytHopp();
        k.total += 60;
        if (sp.tidUte) {
          // Time had run out: one more minute, and the clock runs again.
          sp.tidUte = false;
          k.igjen = 60000;
          k.slutt = Date.now() + 60000;
          k.gaar = true;
          R.gaTil("runde");
        } else {
          if (k.slutt) k.slutt += 60000;
          else k.igjen += 60000;
          const t = R.timer("klokke");
          if (t) {
            t.leggTil(60);
            t.total = k.total;
            t.tegn();
          }
          R.lagre();
        }
        R.toast("+1 minutt");
      },
      steder: (el, e, S) => visSteder(S, S.skjerm === "gjest"),
      ide: () => visIde(),
      async "se-igjen"(el, e, S) {
        const sp = S.spill;
        let i = sp.vertPlass;
        if (sp.modus === "en") {
          const fortsatt = R.vakt();
          i = await R.velgIArk(
            "Hvem vil se kortet sitt?",
            range(sp.antall).map((n) => ({ v: n, tekst: R.navn(n) })),
          );
          if (i == null || !fortsatt()) return;
        }
        R.ark(`
          <h2 id="ark-tittel">Kortet til ${esc(R.navn(i))}</h2>
          ${R.ui.mappe({ id: sp.modus === "en" ? "p" + i : "vert", etikett: "Topphemmelig", tekst: HOLD })}
          <p class="hjelp">Bare ${esc(R.navn(i))} skal se. Slipp for å skjule.</p>
          <button class="knapp" data-h="lukk-ark">Ferdig</button>`);
      },
      anklag(el, e, S) {
        avbrytHopp();
        S.spill.anklaget = null;
        R.gaTil("anklage");
      },
      "spill-videre": () => R.gaTil("runde"),
      async pek() {
        if (!(await nedtelling(["3", "2", "1", "PEK!"], 700))) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
      },
      anklaget(el, e, S) {
        S.spill.anklaget = Number(el.dataset.v);
        R.vis();
      },
      async uenige(el, e, S) {
        const flere = S.spill.r.spioner.length > 1;
        const tekst = flere ? "Da slipper spionene unna og får 2 poeng hver." : "Da slipper spionen unna og får 2 poeng.";
        const fortsatt = R.vakt();
        if ((await R.bekreft("Ble dere ikke enige?", tekst, flere ? "Ja, spionene slapp unna" : "Ja, spionen slapp unna", "Avbryt")) && fortsatt()) {
          ferdigRunde(S, true, "uenige");
        }
      },
      avslor(el, e, S) {
        if (S.spill.anklaget == null) return;
        S.spill.avslort = false;
        R.gaTil("avslor");
      },
      "til-gjett"(el, e, S) {
        S.spill.gjetter = "tatt";
        R.gaTil("gjett");
      },
      uskyldig: (el, e, S) => ferdigRunde(S, true, "uskyldig"),
      async "spion-gjetter"(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(
          "Er du spionen?",
          "Da avslører du deg nå og gjetter stedet. Riktig svar: spionen vinner. Feil svar: de andre vinner.",
          "Ja, jeg vil gjette",
          "Avbryt",
        );
        if (!ja || !fortsatt()) return;
        avbrytHopp();
        S.spill.gjetter = "frivillig";
        R.gaTil("gjett");
      },
      async "gjett-sted"(el, e, S) {
        const i = Number(el.dataset.v);
        const s = STEDER[i];
        if (!s) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(`${s.ikon} ${s.navn}?`, "Spionen har bare ett forsøk.", "Ja, det er svaret", "Avbryt");
        if (!ja || !fortsatt()) return;
        S.spill.gjett = i;
        S.spill.svart = false;
        R.gaTil("svar");
      },
      "se-poeng"(el, e, S) {
        const sp = S.spill;
        const riktig = sp.gjett === sp.r.sted;
        ferdigRunde(S, riktig, riktig ? "gjettet" : "feilgjett");
      },
      "ny-runde": (el, e, S) => nyRunde(S),
      // Undo the round's points (a mis-tap) and go back to where the outcome was decided.
      "angre-poeng"(el, e, S) {
        const sp = S.spill;
        const u = sp.utfall;
        if (!u) return;
        sp.poeng = sp.poeng.map((p, i) => p - u.pluss[i]);
        sp.utfall = null;
        sp.feiret = false;
        R.toast("Poengene er tatt tilbake");
        if (u.grunn === "gjettet" || u.grunn === "feilgjett") {
          sp.gjett = null;
          sp.svart = false;
          R.gaTil("gjett");
        } else {
          sp.anklaget = null;
          sp.avslort = false;
          R.gaTil("anklage");
        }
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", "Dere går til kåringen med poengene så langt.", "Avslutt", "Spill videre");
        if (ja && fortsatt()) R.gaTil("slutt");
      },
      igjen: (el, e, S) => startSpill(S),

      // Own phones: the guests
      "gjest-plass"(el, e, S) {
        const laast = laastPlass(S, S.gjest.kode);
        if (laast != null && laast !== Number(el.dataset.v)) return R.toast("Nummeret er låst når du har sett kortet");
        S.gjest.plass = Number(el.dataset.v);
        S.gjest.kryss = [];
        R.lyd.pop();
        R.gaTil("gjest");
      },
      // A new round changes the card, so ask first: only the host decides when it starts.
      async "gjest-neste"(el, e, S) {
        const neste = S.gjest.runde + 1;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(`Har verten startet runde ${neste}?`, "Trykk bare når den som laget koden har startet en ny runde. Da får du et nytt kort.", `Ja, vis runde ${neste}`, "Ikke ennå");
        if (!ja || !fortsatt() || !S.gjest) return;
        S.gjest.runde = neste;
        S.gjest.kryss = [];
        R.lyd.pop();
        R.gaTil("gjest");
        R.toast(`Runde ${neste}`);
      },
      "gjest-forrige"(el, e, S) {
        S.gjest.runde = Math.max(1, S.gjest.runde - 1);
        S.gjest.kryss = [];
        R.gaTil("gjest");
      },
      "bytt-plass": (el, e, S) => (laastPlass(S, S.gjest.kode) != null ? R.toast("Nummeret er låst når du har sett kortet") : R.gaTil("plass")),
      async forlat(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft("Forlate spillet?", "Du kan bli med igjen med den samme koden.", "Forlat", "Bli")) && fortsatt()) {
          S.gjest = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },
      kryss(el, e, S) {
        const i = Number(el.dataset.v);
        const liste = S.gjest.kryss || [];
        S.gjest.kryss = liste.includes(i) ? liste.filter((x) => x !== i) : [...liste, i];
        el.setAttribute("aria-pressed", String(S.gjest.kryss.includes(i)));
        R.lagre();
      },
    }),
  };

  // Remember which game screen was open, so "Fortsett" on the home screen returns to it.
  SPILLSKJERMER.forEach((navn) => {
    const sk = DEF.skjermer[navn];
    const inn = sk.inn;
    sk.inn = (S) => {
      if (S.spill) S.spill.skjerm = navn;
      if (inn) inn(S);
    };
  });

  R.start(DEF);
})();
