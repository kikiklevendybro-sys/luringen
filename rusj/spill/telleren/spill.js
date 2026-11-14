/* Telleren — «Tell til 21» (the counting game where the rules grow, 18+).
   The players count round the ring from 1 to 21; each says one, two or three numbers in a row.
   Whoever has to say 21 takes a small sip and puts a new rule on a number: say «banana» instead
   of 7, clap on 12, swap 4 and 15, skip 9 … The phone keeps the board: every number with its rule,
   three suggestions to pick from (or one of your own), who starts the next round, and the misses
   («Noen bommet»: one sip, back to 1). The evening ends when the rules chosen in the setup are on
   the board (or the board is full), with the whole board on Kåringen – no drinking score.
   Responsible by design: small sips only, alcohol-free counts the same, everyone may pass, and a
   water break comes after every fourth rule.
   The rules engine at the top is pure; test/telleren.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- The rules engine (no kit needed) ----------

  const TALL = 20; // rules go on 1–20; 21 ends the round
  const TYPER = ["ord", "handling", "stemme", "bytt", "hopp", "alle", "dobbel"];
  const LISTE = { ord: "ord", handling: "handlinger", stemme: "stemmer" }; // types that use a word from a list
  const VANN_HVERT = 4; // a water break after every fourth rule

  function bland(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const velg = (liste, rng) => liste[Math.floor(rng() * liste.length)];

  // The numbers that already have a rule, and those still free.
  function brukte(regler) {
    const s = new Set();
    for (const r of regler) for (const t of r.tall) s.add(t);
    return s;
  }
  function frie(regler) {
    const b = brukte(regler);
    return Array.from({ length: TALL }, (_, i) => i + 1).filter((t) => !b.has(t));
  }

  // A new rule of a type on free numbers, with a word from the lists not used yet; null if none fits.
  function lagRegel(type, regler, data, rng) {
    const fri = frie(regler);
    if (type === "bytt") {
      if (fri.length < 2) return null;
      const a = velg(fri, rng);
      const b = velg(fri.filter((t) => t !== a), rng);
      return { type, tall: [Math.min(a, b), Math.max(a, b)] };
    }
    if (!fri.length || !TYPER.includes(type)) return null;
    const regel = { type, tall: [velg(fri, rng)] };
    if (LISTE[type]) {
      const tatt = new Set(regler.filter((r) => r.type === type).map((r) => r.ting));
      const ledige = data[LISTE[type]].map((_, i) => i).filter((i) => !tatt.has(i));
      if (!ledige.length) return null;
      regel.ting = velg(ledige, rng);
    }
    return regel;
  }

  // Up to n suggestions of different kinds, on different numbers.
  function forslag(regler, data, rng, n = 3) {
    const ut = [];
    for (const type of bland(TYPER, rng)) {
      if (ut.length >= n) break;
      let r = null;
      for (let forsok = 0; forsok < 8 && !r; forsok++) {
        const x = lagRegel(type, regler, data, rng);
        if (x && !x.tall.some((t) => ut.some((y) => y.tall.includes(t)))) r = x;
      }
      if (r) ut.push(r);
    }
    return ut;
  }

  // Does the rule fit on the board as it is (free numbers, a word not used twice)?
  function passer(regler, r) {
    if (!r || !Array.isArray(r.tall) || !r.tall.length || r.tall.length > 2) return false;
    if (r.type === "egen") {
      if (typeof r.tekst !== "string" || !r.tekst.trim() || r.tall.length !== 1) return false;
    } else if (!TYPER.includes(r.type) || r.tall.length !== (r.type === "bytt" ? 2 : 1)) return false;
    const fri = new Set(frie(regler));
    if (!r.tall.every((t) => Number.isInteger(t) && fri.has(t)) || new Set(r.tall).size !== r.tall.length) return false;
    if (LISTE[r.type] && (!Number.isInteger(r.ting) || r.ting < 0 || regler.some((x) => x.type === r.type && x.ting === r.ting))) return false;
    return true;
  }

  // The rule as a sentence. data.maler has the templates; egen: the text the player wrote.
  function tekst(r, data) {
    if (r.type === "egen") return r.tekst;
    const ting = LISTE[r.type] ? data[LISTE[r.type]][r.ting] : null;
    return data.maler[r.type]
      .replace(/\{tall\}/g, String(r.tall[0]))
      .replace(/\{a\}/g, String(r.tall[0]))
      .replace(/\{b\}/g, String(r.tall[1]))
      .replace(/\{ting\}/g, ting == null ? "" : typeof ting === "string" ? ting : ting.t);
  }

  // The board: for every number 1–21, the index of its rule (or -1).
  function tavla(regler) {
    const ut = Array.from({ length: TALL + 1 }, (_, i) => ({ tall: i + 1, regel: -1 }));
    regler.forEach((r, n) => r.tall.forEach((t) => (ut[t - 1].regel = n)));
    return ut;
  }

  const R = window.Rusj;
  if (!R) {
    window.Telleren = { TALL, TYPER, LISTE, VANN_HVERT, brukte, frie, lagRegel, forslag, passer, tekst, tavla, bland };
    return;
  }

  // ---------- The game ----------

  const D = window.RUSJ_DATA.regler;
  const esc = R.esc;
  const MIN = 2;
  const MAKS = 12;
  const LENGDER = [5, 8, 12];
  const SIST = "telleren.sist";
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "telleren") + "/";
  const IKON = { ord: "💬", bytt: "⇄", hopp: "🚫", alle: "🙌", dobbel: "✌️", egen: "✏️" };
  const ikonFor = (r) => (r.type === "handling" ? D.handlinger[r.ting].ikon : r.type === "stemme" ? D.stemmer[r.ting].ikon : IKON[r.type]);
  const regelTekst = (r) => (r.type === "egen" ? R.t("{tall}: {tekst}", { tall: r.tall[0], tekst: r.tekst }) : tekst(r, D));

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const nesteSpiller = (sp, i) => (i + 1) % sp.antall;
  const fullt = (sp) => sp.regler.length >= sp.maks || !frie(sp.regler).length;

  let H; // the actions, so one action can reuse another

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS);
  }

  // ---------- Pieces of the screen ----------

  function tavleHtml(sp, o = {}) {
    const ny = o.ny != null ? o.ny : -1;
    const ruter = tavla(sp.regler).map((x) => {
      if (x.tall === 21) return `<li class="tel-rute tel-21"><b>21</b><span aria-hidden="true">🍻</span></li>`;
      const r = sp.regler[x.regel];
      if (!r) return `<li class="tel-rute"><b>${x.tall}</b></li>`;
      const merk = x.regel === ny ? " ny" : "";
      return `<li class="tel-rute med${merk}"><button data-h="rute" data-v="${x.tall}" aria-label="${esc(regelTekst(r))}"><b>${x.tall}</b><span aria-hidden="true">${ikonFor(r)}</span></button></li>`;
    });
    return `<ol class="tel-tavle" aria-label="${esc(R.t("Tavla"))}">${ruter.join("")}</ol>`;
  }

  function reglerHtml(sp, o = {}) {
    if (!sp.regler.length) return `<p class="hjelp tel-ingen">${esc(R.t("Ingen regler ennå. Den som sier 21, lager den første."))}</p>`;
    const rader = sp.regler
      .map((r, n) => ({ r, n }))
      .sort((x, y) => x.r.tall[0] - y.r.tall[0])
      .map(
        ({ r, n }) =>
          `<li class="${n === o.ny ? "ny" : ""}"><span class="tel-nr" aria-hidden="true">${r.tall.join("⇄")}</span><span><span class="tel-regel-tekst">${esc(r.type === "egen" ? r.tekst : regelTekst(r))}</span>${
            o.av ? `<small>${esc(R.t("Laget av {navn}", { navn: R.navn(r.av) }))}</small>` : ""
          }</span></li>`,
      );
    return `<ol class="tel-regler">${rader.join("")}</ol>`;
  }

  // A rule goes on the board; the one after the 21-sayer starts the next round.
  function leggTil(S, r) {
    const sp = S.spill;
    r.av = sp.hvem21;
    sp.regler.push(r);
    sp.sist = { type: "regel", starter: sp.starter, forslag: sp.forslag };
    sp.starter = nesteSpiller(sp, sp.hvem21);
    sp.forslag = [];
    R.lyd.riktig();
    R.vibrer([20, 30, 60]);
    if (fullt(sp)) {
      sp.ferdig = true;
      sp.fase = "tavle";
      R.gaTil("slutt");
      return;
    }
    if (sp.regler.length % VANN_HVERT === 0) {
      sp.vann += 1;
      sp.fase = "vann";
      R.gaTil("vann");
      return;
    }
    sp.fase = "tavle";
    R.gaTil("tavle");
    R.si(R.t("Ny regel: {regel} {navn} begynner på 1.", { regel: regelTekst(r), navn: R.navn(sp.starter) }));
  }

  // ---------- Kåringen ----------

  function sistLinje() {
    const s = R.les(SIST, null);
    if (!s || !Number.isInteger(s.regler) || s.regler < 1) return "";
    return R.t("Sist kom dere til {regler}.", { regler: R.flertall(s.regler, "regel", "regler") });
  }

  R.start({
    id: "telleren",
    versjon: 1,
    pagar,

    tilstand: () => ({ antall: standardAntall(), oppsett: { maks: 8 }, spill: null }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      S.oppsett = Object.assign({ maks: 8 }, S.oppsett || {});
      if (!LENGDER.includes(S.oppsett.maks)) S.oppsett.maks = 8;
      const sp = S.spill;
      if (sp) {
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < sp.antall;
        let ok =
          Number.isInteger(sp.antall) && sp.antall >= MIN && sp.antall <= MAKS &&
          LENGDER.includes(sp.maks) && Array.isArray(sp.regler) && spiller(sp.starter) &&
          Array.isArray(sp.bom) && sp.bom.length === sp.antall &&
          ["tavle", "hvem", "regel", "egen", "vann"].includes(sp.fase) &&
          Array.isArray(sp.forslag);
        // Every rule must fit on the board the rules before it left.
        if (ok) {
          const sjekket = [];
          for (const r of sp.regler) {
            if (!passer(sjekket, r) || !spiller(r.av)) {
              ok = false;
              break;
            }
            sjekket.push(r);
          }
        }
        if (ok && (sp.fase === "regel" || sp.fase === "egen") && !spiller(sp.hvem21)) ok = false;
        if (!ok) S.spill = null;
        else {
          sp.forslag = sp.forslag.filter((r) => passer(sp.regler, r));
          if (sp.fase === "regel" && !sp.forslag.length) sp.forslag = forslag(sp.regler, D, Math.random);
          sp.egen = Object.assign({ tekst: "", tall: null }, sp.egen || {});
          sp.egen.tekst = String(sp.egen.tekst || "").slice(0, 60);
          if (!frie(sp.regler).includes(sp.egen.tall)) sp.egen.tall = null;
          sp.vann = Math.max(0, Number(sp.vann) || 0);
          if (sp.sist && !["bom", "regel"].includes(sp.sist.type)) sp.sist = null;
        }
      }
      const skjermer = { tavle: "tavle", hvem: "hvem", regel: "regel", egen: "egen", vann: "vann" };
      if (skjermer[S.skjerm]) S.skjerm = pagar(S) ? skjermer[S.spill.fase] : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Dere teller i ring fra 1 til 21. Den som må si 21, tar en liten slurk og legger en ny regel på et tall. Reglene blir flere og flere – og tellingen vanskeligere."),
      steg: [
        [R.t("Tell rundt"), R.t("Den som begynner, sier 1. Hver sier ett, to eller tre tall etter hverandre, så går det videre til neste.")],
        [R.t("Den som sier 21"), R.t("tar en liten slurk og lager en regel – for eksempel «si banan i stedet for 7». Mobilen foreslår tre, eller dere skriver en selv.")],
        [R.t("Bommer noen?"), R.t("Glemmer noen en regel eller sier feil, tar vedkommende en slurk, og dere begynner på 1 igjen.")],
      ],
      tips: [
        R.t("Alkoholfritt teller like mye, og alle kan stå over – uten å forklare seg."),
        R.t("Trykk på et tall på tavla for å se regelen."),
        R.t("Etter hver fjerde regel tar alle en vannpause."),
        R.t("Spis og drikk vann underveis, og sørg for trygg vei hjem."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sist = !pagar(S) ? sistLinje() : "";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Tell til 21 – og lag en ny regel."))}<br><em>${esc(R.t("Til slutt er det nesten umulig."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · {regler}", { regler: R.flertall(S.spill.regler.length, "regel", "regler") }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (sist ? `<p class="hjelp tel-sist">${esc(sist)}</p>` : ""),
            }),
            merker: [
              [`${MIN}–${MAKS}`, R.t("spillere")],
              ["21", R.t("tall")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Hvor lenge?"))}</h2></div>
            ${R.ui.seg("maks", LENGDER.map((n) => [String(n), R.flertall(n, "regel", "regler")]), String(S.oppsett.maks), { etikett: R.t("Hvor lenge?") })}
            <p class="hjelp">${esc(R.t("Spillet slutter når så mange regler er på tavla."))}</p>
          </section>
          ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Sett dere i ring i samme rekkefølge som lista. Tellingen går til venstre.") })}
          <div class="papirboks tel-vett">
            <p class="etikett">${esc(R.t("Slik er slurkene"))}</p>
            <ul class="tips">
              <li>${esc(R.t("En slurk er en liten slurk – aldri mer."))}</li>
              <li>${esc(R.t("Alkoholfritt teller like mye, og alle kan stå over."))}</li>
              <li>${esc(R.t("Etter hver fjerde regel tar alle en vannpause."))}</li>
            </ul>
          </div>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`,
      },

      tavle: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.regler.length + 1 }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const angre =
            sp.sist && sp.sist.type === "bom"
              ? `<p class="tel-sist-hendelse" role="status">${esc(R.t("{navn} bommet – én slurk, og tilbake til 1.")).replace("{navn}", `<b>${esc(R.navn(sp.sist.i))}</b>`)}</p>`
              : "";
          return `
            <div class="tel-starter">
              ${R.avatar(sp.starter, "mid")}
              <div><p class="etikett">${esc(R.t("Begynner på 1"))}</p><h1 id="skjerm-tittel">${esc(R.navn(sp.starter))}</h1></div>
              <span class="tel-teller" aria-hidden="true">${sp.regler.length}/${sp.maks}</span>
            </div>
            ${angre}
            ${tavleHtml(sp, { ny: sp.sist && sp.sist.type === "regel" ? sp.regler.length - 1 : -1 })}
            ${reglerHtml(sp, { ny: sp.sist && sp.sist.type === "regel" ? sp.regler.length - 1 : -1 })}
            <p class="tel-fot-linje"><span aria-hidden="true">🥤</span> ${esc(R.t("Alkoholfritt teller like mye · alle kan stå over"))}</p>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Noen sa 21!"), "sa21", { variant: "stor", ikon: "🍻" }),
              R.ui.knapp2(R.t("Noen bommet"), "bom"),
              R.ui.lenkerad(sp.sist ? R.ui.lenke(R.t("Angre"), "angre") : "", R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      hvem: {
        tittel: R.t("Noen sa 21!"),
        tilbake: (S) => {
          if (S.spill) S.spill.fase = "tavle";
          return "tavle";
        },
        vis: (S) => `
          <div class="tel-topp">
            <span class="tel-21-merke" aria-hidden="true">21</span>
            <h1 id="skjerm-tittel">${esc(R.t("Hvem sa 21?"))}</h1>
          </div>
          ${R.ui.velgere("hvem21", Array.from({ length: S.spill.antall }, (_, i) => i), null)}`,
      },

      regel: {
        tittel: R.t("Ny regel"),
        tilbake: (S) => {
          if (S.spill) S.spill.fase = "hvem";
          return "hvem";
        },
        vis(S) {
          const sp = S.spill;
          const navn = `<b>${esc(R.navn(sp.hvem21))}</b>`;
          return `
            <div class="tel-topp">
              <span class="stempel aksent">${esc(R.t("21!"))}</span>
              <h1 id="skjerm-tittel">${esc(R.t("{navn} tar en slurk og lager en regel")).replace("{navn}", navn)}</h1>
            </div>
            ${R.ui.fliser(
              "velg-regel",
              sp.forslag.map((r, n) => ({ v: String(n), tittel: regelTekst(r), ikon: ikonFor(r) })),
              null,
              { en: true },
            )}
            ${R.ui.dokk(R.ui.lenkerad(R.ui.lenke(R.t("Nye forslag"), "bland"), R.ui.lenke(R.t("Skriv egen regel"), "egen")))}`;
        },
        inn() {
          R.lyd.trommevirvel(0.6);
        },
      },

      egen: {
        tittel: R.t("Egen regel"),
        tilbake: (S) => {
          if (S.spill) S.spill.fase = "regel";
          return "regel";
        },
        vis(S) {
          const sp = S.spill;
          const e = sp.egen;
          const fri = frie(sp.regler);
          const klar = !!e.tekst.trim() && fri.includes(e.tall);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Skriv en regel"))}</h1>
            <form class="tel-egen" data-skjema="egen" autocomplete="off">
              <label class="etikett" for="tel-egen-tekst">${esc(R.t("Hva skal dere gjøre?"))}</label>
              <input id="tel-egen-tekst" data-felt="egen" maxlength="60" value="${esc(e.tekst)}" placeholder="${esc(R.t("For eksempel: Bjeff som en hund"))}" enterkeyhint="done">
            </form>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("På hvilket tall?"))}</h2></div>
              <div class="tel-tallvalg" role="group" aria-label="${esc(R.t("På hvilket tall?"))}">${fri
                .map((t) => `<button class="tel-tallknapp" data-h="egen-tall" data-v="${t}" aria-pressed="${t === e.tall}">${t}</button>`)
                .join("")}</div>
            </section>
            ${R.ui.dokk(klar ? "" : `<p class="hjelp">${esc(R.t("Skriv regelen og velg et tall."))}</p>`, R.ui.knapp(R.t("Legg til regelen"), "egen-ferdig", { av: !klar }))}`;
        },
      },

      vann: {
        tittel: R.t("Vannpause"),
        tilbake: "hjem",
        vis: (S) => `
          <div class="tel-vann">
            <svg class="tel-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
              <defs><clipPath id="tel-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
              <g clip-path="url(#tel-glass-innside)">
                <path class="tel-vannflate" d="M0 70 Q15 62 30 70 T60 70 T90 70 T120 70 T150 70 V160 H0 Z" fill="var(--himmel)"/>
                <circle class="tel-boble" cx="50" cy="120" r="4" fill="#fff" opacity=".7"/>
                <circle class="tel-boble to" cx="70" cy="128" r="3" fill="#fff" opacity=".6"/>
              </g>
              <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
              <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
            </svg>
            <p class="etikett">${esc(R.t("Etter {regler}", { regler: R.flertall(S.spill.regler.length, "regel", "regler") }))}</p>
            <h1 id="skjerm-tittel">${esc(R.t("Vannpause!"))}</h1>
            <p class="ingress">${esc(R.t("Alle tar en god slurk vann før neste runde. Kroppen takker – og kvelden varer lenger."))}</p>
          </div>
          ${R.ui.dokk(R.ui.knapp(R.t("Skål i vann!"), "vann-ferdig", { variant: "himmel", ikon: "💧" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`,
        inn() {
          R.lyd.pop();
          R.vibrer(20);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const feilfri = sp.bom.some((n) => n > 0) ? sp.bom.map((n, i) => (n === 0 ? i : -1)).filter((i) => i >= 0) : [];
          return `
            ${R.ui.banner({
              klasse: "aksent tel-banner",
              etikett: R.t("Takk for i kveld"),
              tittel: R.t("Skål for gjengen!"),
              tekst: R.t("Dere kom til {regler} på tavla.", { regler: R.flertall(sp.regler.length, "regel", "regler") }),
            })}
            ${feilfri.length ? `<p class="tel-feilfri"><span aria-hidden="true">🎯</span> ${esc(R.t("Bommet aldri: {navn}", { navn: R.ramsOpp(feilfri.map((i) => R.navn(i))) }))}</p>` : ""}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Tavla deres"))}</h2></div>
              ${tavleHtml(sp)}
              ${reglerHtml(sp, { av: true })}
            </section>
            <div class="tel-del">${R.ui.knapp2(R.t("Del kvelden"), "del")}</div>
            <p class="hjelp tel-hjem">💧 ${esc(R.t("Husk vann, mat og trygg vei hjem."))}</p>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp.talt) {
            sp.talt = true;
            if (sp.regler.length) R.skriv(SIST, { regler: sp.regler.length });
            R.statistikk("ferdig", { spillere: sp.antall, regler: sp.regler.length, bom: sp.bom.reduce((s, n) => s + n, 0) });
            R.lagre();
          }
          if (sp.regler.length >= sp.maks) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--lampe", "--mynte", "--himmel"]);
          } else R.lyd.pling();
          R.slippVaken();
        },
      },
    },

    felt: {
      egen(S, el) {
        if (!S.spill || S.spill.fase !== "egen") return;
        const for_ = !!S.spill.egen.tekst.trim();
        S.spill.egen.tekst = R.kutt(el.value, 60);
        R.lagre();
        if (for_ !== !!S.spill.egen.tekst.trim()) R.vis(); // the button wakes up (or sleeps) as the text comes and goes
      },
    },

    skjema: {
      egen(S, form) {
        const f = form.querySelector("input");
        if (f) f.blur();
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
        if (pagar(S)) R.gaTil(S.spill.fase);
      },
      maks(el, e, S) {
        const n = Number(el.dataset.v);
        if (LENGDER.includes(n)) S.oppsett.maks = n;
        R.vis();
      },
      start(el, e, S) {
        const antall = R.klamp(S.antall || 4, MIN, MAKS);
        S.spill = {
          antall,
          maks: S.oppsett.maks,
          regler: [],
          starter: R.heltall(0, antall - 1),
          bom: Array(antall).fill(0),
          forslag: [],
          hvem21: null,
          egen: { tekst: "", tall: null },
          fase: "tavle",
          sist: null,
          vann: 0,
          ferdig: false,
        };
        R.statistikk("start", { spillere: antall, regler: S.oppsett.maks });
        R.gaTil("tavle");
      },
      rute(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const x = tavla(sp.regler)[Number(el.dataset.v) - 1];
        const r = x && sp.regler[x.regel];
        if (r) R.toast(regelTekst(r));
      },
      sa21(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "tavle") return;
        sp.sist = null;
        sp.fase = "hvem";
        R.lyd.pling();
        R.gaTil("hvem");
      },
      hvem21(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!pagar(S) || sp.fase !== "hvem" || !(i >= 0 && i < sp.antall)) return;
        sp.hvem21 = i;
        sp.forslag = forslag(sp.regler, D, Math.random);
        sp.egen = { tekst: "", tall: null };
        sp.fase = "regel";
        R.vibrer([30, 30, 60]);
        R.gaTil("regel");
      },
      bland(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "regel") return;
        sp.forslag = forslag(sp.regler, D, Math.random);
        R.lyd.sveip();
        R.vis();
      },
      "velg-regel"(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.forslag[Number(el.dataset.v)];
        if (!pagar(S) || sp.fase !== "regel" || !passer(sp.regler, r)) return;
        leggTil(S, Object.assign({}, r));
      },
      egen(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "regel") return;
        sp.fase = "egen";
        R.gaTil("egen");
      },
      "egen-tall"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "egen") return;
        sp.egen.tall = Number(el.dataset.v);
        R.vis();
      },
      "egen-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "egen") return;
        const r = { type: "egen", tall: [sp.egen.tall], tekst: sp.egen.tekst.trim() };
        if (!passer(sp.regler, r)) return;
        leggTil(S, r);
      },
      async bom(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "tavle") return;
        const fortsatt = R.vakt();
        const i = await R.velgIArk(R.t("Hvem bommet?"), Array.from({ length: sp.antall }, (_, n) => ({ v: n, tekst: R.navn(n) })), R.t("Én slurk, og dere begynner på 1 igjen."));
        if (i == null || !fortsatt() || S.spill !== sp || sp.fase !== "tavle") return;
        const n = Number(i);
        if (!(n >= 0 && n < sp.antall)) return;
        sp.sist = { type: "bom", i: n, starter: sp.starter };
        sp.bom[n] += 1;
        sp.starter = n;
        R.lyd.feil();
        R.vibrer([30, 40, 30]);
        R.vis();
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.sist) return;
        const s = sp.sist;
        sp.sist = null;
        if (s.type === "bom") {
          sp.bom[s.i] = Math.max(0, sp.bom[s.i] - 1);
          sp.starter = s.starter;
          R.vis();
          return;
        }
        // Take the rule back: the same player chooses again, from the same suggestions.
        const r = sp.regler.pop();
        sp.hvem21 = r.av;
        sp.starter = s.starter;
        sp.forslag = (s.forslag || []).filter((x) => passer(sp.regler, x));
        if (!sp.forslag.length) sp.forslag = forslag(sp.regler, D, Math.random);
        sp.fase = "regel";
        R.gaTil("regel");
      },
      "vann-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "vann") return;
        sp.fase = "tavle";
        R.gaTil("tavle");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = !sp.regler.length;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ingenting ? R.t("Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        sp.ferdig = true;
        sp.fase = "tavle";
        R.gaTil("slutt");
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const regler = R.flertall(sp.regler.length, "regel", "regler");
        R.del(R.app.navn, R.t("{spill}: Vi telte til 21 med {regler} på tavla. Klarer dere flere?", { spill: R.app.navn, regler }), ADRESSE, {
          kort: { tittel: R.app.navn, linjer: [regler, R.t("på tavla")] },
        });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
