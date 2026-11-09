/* Ringen — «Kortringen» (a ring-of-fire style drinking game, 18+).
   52 virtual cards lie face down in a ring. The players take turns tapping a card; every value
   has its own rule (our own Norwegian set). Some cards hand out a role that lasts until the next
   card of the same value (Tommelmester, Spørsmålsmester, Kompis), Jacks make house rules, and
   Kings collect toasts for the finale. The fourth King ends the ring: everyone stands up for one
   shared toast, and the one who drew it is crowned.
   Responsible by design: small sips only, alcohol-free counts the same, everyone may pass, no
   "drink the cup", and a water break comes every 12 cards. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;

  const ANTALL = 52;
  const VANN_HVERT = 12; // a water break after every 12th card
  const VERDI = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const SORTER = [
    { tegn: "♥", navn: "Hjerter", rod: true },
    { tegn: "♠", navn: "Spar", rod: false },
    { tegn: "♦", navn: "Ruter", rod: true },
    { tegn: "♣", navn: "Kløver", rod: false },
  ];
  const KONGE = 12;
  // Which idea list helps which rule (and whether the player may type something the game keeps).
  const IDEER = { aldri: "aldri", rim: "rim", kategori: "kategori", regel: "regel", konge: "skal" };
  const SKRIV = { regel: true, konge: true };

  const verdi = (id) => id % 13;
  const sortAv = (id) => SORTER[Math.floor(id / 13)];
  const regelFor = (id) => D.regler[verdi(id)];
  const kortNavn = (id) => {
    const v = verdi(id);
    const navn = v === 0 || v >= 10 ? D.regler[v].navn : VERDI[v];
    return `${sortAv(id).navn} ${navn}`;
  };
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const igjen = (sp) => sp.ring.filter((k) => k >= 0).length;
  const nesteSpiller = (sp) => (sp.tur + 1) % sp.antall;
  // The finale: the fourth King – or «Ta finalen nå» from the «Avslutt» sheet (sp.tidlig).
  const erFinale = (sp) => !!sp.tidlig || (sp.kort != null && verdi(sp.kort) === KONGE && sp.konger >= 4);

  let H; // the actions, so one action can reuse another
  let laast = false; // a card is flying out of the ring: ignore new draws until it has landed

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, 3, 12);
  }

  // ---------- The ring ----------

  // Seat p of 52 around the table, clockwise from the top (percent of the ring's box).
  function plass(p) {
    const v = (p * 360) / ANTALL;
    const rad = (v * Math.PI) / 180;
    return { v, x: 50 + 40.5 * Math.sin(rad), y: 50 - 40.5 * Math.cos(rad) };
  }

  const KRONE =
    '<svg class="ring-krone-svg" viewBox="0 0 120 90" aria-hidden="true" focusable="false">' +
    '<path d="M14 74 L8 22 L36 46 L60 10 L84 46 L112 22 L106 74 Z" fill="var(--lampe)" stroke="var(--blekk)" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M16 70 H104" stroke="var(--lampe-dyp)" stroke-width="6" stroke-linecap="round"/>' +
    '<circle cx="8" cy="20" r="7" fill="var(--lampe)" stroke="var(--blekk)" stroke-width="5"/>' +
    '<circle cx="60" cy="8" r="7" fill="var(--lampe)" stroke="var(--blekk)" stroke-width="5"/>' +
    '<circle cx="112" cy="20" r="7" fill="var(--lampe)" stroke="var(--blekk)" stroke-width="5"/>' +
    "</svg>";

  // Two fanned card backs for the «Trekk et kort» button.
  const KNAPPKORT =
    '<svg class="ring-knappkort" viewBox="0 0 34 34" aria-hidden="true" focusable="false">' +
    '<g transform="rotate(-14 17 17)"><rect x="6" y="4" width="17" height="25" rx="3.5" fill="var(--papir)" stroke="var(--blekk)" stroke-width="2.4"/><rect x="9" y="7" width="11" height="19" rx="2" fill="var(--aksent-dyp)"/></g>' +
    '<g transform="rotate(10 17 17)"><rect x="11" y="5" width="17" height="25" rx="3.5" fill="var(--papir)" stroke="var(--blekk)" stroke-width="2.4"/><rect x="14" y="8" width="11" height="19" rx="2" fill="var(--aksent-dyp)"/><circle cx="19.5" cy="17.5" r="2.6" fill="var(--papir)"/></g>' +
    "</svg>";

  function kroneHtml(konger) {
    const steiner = [0, 1, 2, 3]
      .map((n) => `<i class="ring-stein${n < konger ? " fylt" : ""}" style="--n: ${n}"></i>`)
      .join("");
    return `<span class="ring-krone">${KRONE}<span class="ring-steiner">${steiner}</span></span>`;
  }

  function ringHtml(sp) {
    const kort = [];
    sp.ring.forEach((id, p) => {
      if (id < 0) return;
      const { v, x, y } = plass(p);
      kort.push(`<span class="ring-rygg" data-pos="${p}" style="--x: ${x.toFixed(2)}%; --y: ${y.toFixed(2)}%; --v: ${v.toFixed(2)}deg"></span>`);
    });
    const n = igjen(sp);
    return `
      <button class="ring-bord" id="ring-bord" data-h="trekk" data-stille aria-label="Trekk et kort fra ringen. ${n} kort igjen, ${sp.konger} av 4 konger er trukket.">
        <span class="ring-filt" aria-hidden="true"></span>
        <span class="ring-kortene" aria-hidden="true">${kort.join("")}</span>
        <span class="ring-midt" aria-hidden="true">
          ${kroneHtml(sp.konger)}
          <span class="ring-igjen"><b>${n}</b> kort igjen</span>
        </span>
      </button>`;
  }

  // Roles and rules that are in force right now (shown as chips under the ring).
  function rollerListe(sp) {
    const r = sp.roller;
    const liste = [];
    if (r.tommel != null) liste.push({ ikon: "👍", kort: `Tommel: ${R.navn(r.tommel)}`, lang: `Tommelmester: ${R.navn(r.tommel)}`, til: "Til neste femmer" });
    if (r.sporsmal != null) liste.push({ ikon: "❓", kort: `Spørsmål: ${R.navn(r.sporsmal)}`, lang: `Spørsmålsmester: ${R.navn(r.sporsmal)}`, til: "Til neste dame" });
    if (r.kompis) liste.push({ ikon: "🤝", kort: `Kompis: ${R.navn(r.kompis[0])} + ${R.navn(r.kompis[1])}`, lang: `Kompiser: ${R.ramsOpp(r.kompis.map((i) => R.navn(i)))}`, til: "Til neste åtter" });
    return liste;
  }

  // Chips under the ring (tall screens) or one compact line (short screens and landscape).
  function rollerHtml(sp) {
    const roller = rollerListe(sp);
    const regler = sp.regler.length;
    const skaler = sp.skaler.length;
    if (!roller.length && !regler && !skaler) {
      return `<p class="ring-hint">Trykk på et kort i ringen – eller på knappen.</p>`;
    }
    const deler = roller.map((r) => ({ ikon: r.ikon, tekst: r.kort }));
    if (regler) deler.push({ ikon: "📜", tekst: R.flertall(regler, "regel", "regler") });
    if (skaler) deler.push({ ikon: "👑", tekst: R.flertall(skaler, "skål", "skåler") });
    const brikker = deler.map((d) => `<span class="ring-brikke"><span aria-hidden="true">${d.ikon}</span><span class="ring-brikke-navn">${esc(d.tekst)}</span></span>`);
    const linje = `Gjelder nå: ${deler.map((d) => `${d.ikon} ${d.tekst}`).join(" · ")}`;
    return `<button class="ring-roller" data-h="roller" aria-label="Se hva som gjelder nå">
      <span class="etikett">Gjelder nå</span><span class="ring-brikker">${brikker.join("")}</span>
      <span class="ring-roller-linje"><span class="ring-roller-tekst">${esc(linje)}</span><span aria-hidden="true">›</span></span>
    </button>`;
  }

  // ---------- Ideas ----------

  function ideListe(sp) {
    if (sp.kort == null) return null;
    const navn = IDEER[regelFor(sp.kort).id];
    return navn ? D.ideer[navn] : null;
  }

  function nyIde(sp) {
    const liste = ideListe(sp);
    if (!liste) {
      sp.ide = null;
      return;
    }
    let i = Math.floor(Math.random() * liste.length);
    if (liste.length > 1 && i === sp.ide) i = (i + 1 + Math.floor(Math.random() * (liste.length - 1))) % liste.length;
    sp.ide = i;
  }

  function ideTekst(sp) {
    const liste = ideListe(sp);
    if (!liste || sp.ide == null || !liste[sp.ide]) return "";
    const t = liste[sp.ide];
    const id = regelFor(sp.kort).id;
    if (id === "rim") return `«${t}»`;
    if (id === "aldri") return `«Jeg har aldri ${t}.»`;
    return t;
  }

  // ---------- The card ----------

  function ekstraHtml(sp) {
    const regel = regelFor(sp.kort);
    const id = regel.id;
    let html = "";
    if (id === "kompis") {
      const k = sp.roller.kompis;
      html += k
        ? `<div class="ring-valgt"><span aria-hidden="true">🤝</span><span>Kompis: <b>${esc(R.navn(k[1]))}</b></span>${R.ui.lenke("Bytt", "kompis")}</div>`
        : R.ui.knapp2("Velg kompis", "kompis", { ikon: "🤝", variant: "liten ring-kompisknapp" });
    }
    if (SKRIV[id]) {
      const etikett = id === "regel" ? "Regelen" : "Skålen";
      const plass = id === "regel" ? "Skriv regelen – mobilen husker den" : "Skål for … (mobilen husker den)";
      html += `<form class="ring-skriv" data-skjema="utkast" autocomplete="off">
        <label class="etikett" for="ring-utkast">${etikett} <span class="ring-valgfri">(valgfritt)</span></label>
        <input class="ring-felt" id="ring-utkast" data-felt="utkast" maxlength="80" value="${esc(sp.utkast || "")}" placeholder="${esc(plass)}" enterkeyhint="done" autocapitalize="sentences">
      </form>`;
    }
    const ide = ideTekst(sp);
    if (ide) {
      html += `<div class="ring-ide">
        <span class="ring-ide-tekst"><b>${SKRIV[id] ? "Idé" : "Forslag"}:</b> ${esc(ide)}</span>
        <span class="ring-ide-knapper">
          ${SKRIV[id] ? `<button class="ring-ide-knapp" data-h="ide-bruk">Bruk</button>` : ""}
          <button class="ring-ide-knapp terning" data-h="ide" aria-label="Nytt forslag"><span aria-hidden="true">🎲</span></button>
        </span>
      </div>`;
    }
    return html;
  }

  function spillkortHtml(sp) {
    const finale = erFinale(sp);
    // «Ta finalen nå»: a gold card without a playing-card face.
    if (sp.tidlig) {
      const linjer = sp.skaler.map((s) =>
        s.t ? `<li>${esc(s.t)} <small>– ${esc(R.navn(s.i))}</small></li>` : `<li>Skålen til ${esc(R.navn(s.i))}</li>`,
      );
      linjer.push(`<li>${sp.skaler.length ? "Og skål for gjengen!" : "Skål for gjengen!"}</li>`);
      return `
        <article class="ring-spillkort finale tidlig" id="ring-kort" data-sort="👑">
          <div class="ring-innhold">
            <span class="ring-ikon" aria-hidden="true">${D.finale.ikon}</span>
            <p class="ring-kortnavn">Etter ${esc(R.flertall(sp.nr, "kort", "kort"))}</p>
            <h1 id="skjerm-tittel">${esc(D.finale.tittel)}</h1>
            <p class="ring-tekst">${esc(D.finale.tidlig)}</p>
            <ul class="ring-skaler">${linjer.join("")}</ul>
          </div>
        </article>`;
    }
    const id = sp.kort;
    const sort = sortAv(id);
    const regel = regelFor(id);
    const tittel = finale ? D.finale.tittel : regel.tittel;
    const ikon = finale ? D.finale.ikon : regel.ikon;
    const tekst = finale ? D.finale.tekst : regel.tekst;
    let under = "";
    if (finale) {
      // Every King's toast in order (the ones only said out loud are named after who made them).
      const linjer = sp.skaler.map((s) =>
        s.t ? `<li>${esc(s.t)} <small>– ${esc(R.navn(s.i))}</small></li>` : `<li>Skålen til ${esc(R.navn(s.i))}</li>`,
      );
      linjer.push(`<li>${sp.skaler.length ? "Og skål for gjengen!" : "Skål for gjengen!"}</li>`);
      under = `<ul class="ring-skaler">${linjer.join("")}</ul>`;
    } else {
      under = ekstraHtml(sp);
    }
    // Kings: how far we are towards the finale.
    const kongetall =
      !finale && verdi(id) === KONGE
        ? `<p class="ring-kongetall"><span class="ring-pips" aria-hidden="true">${[0, 1, 2, 3].map((n) => `<i${n < sp.konger ? ' class="fylt"' : ""}></i>`).join("")}</span>Konge ${sp.konger} av 4</p>`
        : "";
    const hjorne = `<span class="ring-hjorne-v">${VERDI[verdi(id)]}</span><span class="ring-hjorne-s">${sort.tegn}</span>`;
    return `
      <article class="ring-spillkort${sort.rod ? " rod" : ""}${finale ? " finale" : ""} r-${regel.id}" id="ring-kort" data-sort="${sort.tegn}">
        <span class="ring-hjorne topp" aria-hidden="true">${hjorne}</span>
        <span class="ring-hjorne bunn" aria-hidden="true">${hjorne}</span>
        <div class="ring-innhold">
          <span class="ring-ikon" aria-hidden="true">${ikon}</span>
          <p class="ring-kortnavn">${esc(kortNavn(id))}</p>
          <h1 id="skjerm-tittel">${esc(tittel)}</h1>
          <p class="ring-tekst">${esc(tekst)}</p>
          ${kongetall}
          ${under}
        </div>
      </article>`;
  }

  // ---------- Game state ----------

  function nyttSpill(S) {
    const antall = R.klamp(S.antall || 4, 3, 12);
    const rng = R.rng(R.nyttFro());
    S.spill = {
      antall,
      ring: R.stokk(Array.from({ length: ANTALL }, (_, i) => i), rng),
      tur: R.heltall(0, antall - 1, rng),
      nr: 0,
      kort: null,
      fase: "ring",
      konger: 0,
      skaler: [],
      regler: [],
      roller: { tommel: null, sporsmal: null, kompis: null },
      ide: null,
      utkast: "",
      vann: 0,
      kronet: null,
      ferdig: false,
    };
    R.statistikk("start", { spillere: antall });
  }

  // Take the card at ring position p: roles change hands right away.
  function trekkKort(sp, p) {
    const id = sp.ring[p];
    sp.ring[p] = -1;
    sp.kort = id;
    sp.nr += 1;
    sp.utkast = "";
    const v = verdi(id);
    const regelId = D.regler[v].id;
    if (regelId === "tommel") sp.roller.tommel = sp.tur;
    if (regelId === "sporsmal") sp.roller.sporsmal = sp.tur;
    if (regelId === "kompis") sp.roller.kompis = null; // the old pair ends; the new one is picked on the card
    if (v === KONGE) {
      sp.konger += 1;
      sp.sisteKonge = sp.tur;
      if (sp.konger >= 4) sp.kronet = sp.tur;
    }
    sp.fase = "kort";
    nyIde(sp);
  }

  // A typed rule (Jack) or toast (King) is kept when the card is done.
  function lagreUtkast(sp) {
    if (sp.kort == null) return;
    const id = regelFor(sp.kort).id;
    const tekst = String(sp.utkast || "").trim().slice(0, 80);
    if (id === "regel") sp.regler.push({ i: sp.tur, t: tekst });
    if (id === "konge" && !erFinale(sp)) sp.skaler.push({ i: sp.tur, t: tekst });
  }

  // The nearest card (by angle) to a tap on the ring, or a random one.
  function velgPlass(sp, e) {
    const ledige = [];
    sp.ring.forEach((id, p) => {
      if (id >= 0) ledige.push(p);
    });
    if (!ledige.length) return -1;
    const bord = document.getElementById("ring-bord");
    if (bord && e && e.detail > 0 && Number.isFinite(e.clientX)) {
      const b = bord.getBoundingClientRect();
      const dx = e.clientX - (b.left + b.width / 2);
      const dy = e.clientY - (b.top + b.height / 2);
      if (Math.hypot(dx, dy) > b.width * 0.24) {
        const v = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
        let best = ledige[0];
        let avstand = 999;
        for (const p of ledige) {
          const d = Math.abs((((p * 360) / ANTALL - v + 540) % 360) - 180);
          if (d < avstand) {
            avstand = d;
            best = p;
          }
        }
        return best;
      }
    }
    return R.velg(ledige);
  }

  // ---------- The game ----------

  R.start({
    id: "ringen",
    versjon: 1,
    pagar,

    tilstand: () => ({ antall: standardAntall(), spill: null }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), 3, 12);
      const sp = S.spill;
      if (sp) {
        const spiller = (i) => i == null || (Number.isInteger(i) && i >= 0 && i < sp.antall);
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 3 && sp.antall <= 12 &&
          Array.isArray(sp.ring) && sp.ring.length === ANTALL &&
          Number.isInteger(sp.tur) && sp.tur >= 0 && sp.tur < sp.antall &&
          ["ring", "kort", "vann"].includes(sp.fase) &&
          Array.isArray(sp.skaler) && sp.skaler.every((x) => x && spiller(x.i) && typeof x.t === "string") &&
          Array.isArray(sp.regler) && sp.regler.every((x) => x && spiller(x.i) && typeof x.t === "string") &&
          sp.roller && spiller(sp.roller.tommel) && spiller(sp.roller.sporsmal) &&
          (sp.roller.kompis == null || (Array.isArray(sp.roller.kompis) && sp.roller.kompis.length === 2 && sp.roller.kompis.every((i) => spiller(i))));
        if (!ok) S.spill = null;
        else {
          sp.tidlig = !!sp.tidlig && sp.fase === "kort";
          if (sp.fase === "kort" && !sp.tidlig && !(Number.isInteger(sp.kort) && sp.kort >= 0 && sp.kort < ANTALL)) sp.fase = "ring";
          if (sp.fase !== "kort" || sp.tidlig) sp.kort = null;
          sp.utkast = String(sp.utkast || "").slice(0, 80);
          if (sp.ide != null && !(ideListe(sp) && ideListe(sp)[sp.ide])) sp.ide = null;
          if (!spiller(sp.kronet)) sp.kronet = null;
          if (!spiller(sp.sisteKonge)) sp.sisteKonge = null;
          if (sp.tidlig && sp.kronet == null) sp.kronet = sp.tur;
          if (sp.ferdig && sp.kronet == null) S.spill = null;
        }
      }
      const skjerm = S.skjerm;
      if (["ring", "kort", "vann"].includes(skjerm) && !pagar(S)) S.skjerm = "hjem";
      else if (pagar(S) && ["ring", "kort", "vann"].includes(skjerm)) S.skjerm = S.spill.fase;
      if (skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Kortene ligger i en ring. Dere trekker etter tur, og hvert kort har sin egen regel. Bare små slurker – og alkoholfritt teller like mye.",
      steg: [
        ["Trekk et kort", "Den som har tur, trykker på et kort i ringen. Mobilen viser regelen."],
        ["Gjør som kortet sier", "Les regelen høyt og gjør det sammen. En slurk er en liten slurk av det du drikker – vann og brus teller like mye."],
        ["Fjerde konge = finale", "Hver konge legger til en skål. Den som trekker den fjerde kongen, blir kronet og leder den felles skålen."],
      ],
      tips: [
        "Alle kan stå over – helt uten forklaring.",
        "Etter hvert tolvte kort er det vannpause for alle.",
        "Roller som tommelmester gjelder til neste kort med samme verdi. Trykk på «Gjelder nå» for å se hvem som har hva.",
        "Skriv inn regler og skåler, så husker mobilen dem til finalen.",
        "Spis og drikk vann underveis, og sørg for trygg vei hjem.",
      ],
      ekstraHtml: `<h3>Kortene</h3><ul class="ring-tabell">${D.regler
        .map((r, v) => `<li><span class="ring-tabell-v">${VERDI[v]}</span><span class="ring-tabell-ikon" aria-hidden="true">${r.ikon}</span><span><b>${esc(r.tittel)}</b> ${esc(r.kort)}</span></li>`)
        .join("")}</ul>`,
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Trekk et kort fra ringen.<br><em>Hvert kort har sin egen regel.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · ${igjen(S.spill)} kort igjen` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–12", "spillere"],
              ["52", "kort"],
              ["0", "reklame"],
            ],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: () => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${R.ui.spillere({ min: 3, max: 12, hjelp: "Sett dere i ring i samme rekkefølge som lista. Turen går til venstre." })}
          <div class="papirboks ring-vett">
            <p class="etikett">Slik er slurkene</p>
            <ul class="tips">
              <li>En slurk er en liten slurk – aldri mer.</li>
              <li>Alkoholfritt teller like mye, og alle kan stå over.</li>
              <li>Etter hvert tolvte kort tar alle en vannpause.</li>
            </ul>
          </div>
          ${R.ui.dokk(R.ui.knapp("Start", "start"))}`,
      },

      ring: {
        tittel: (S) => `Kort ${S.spill.nr + 1}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="ring-tur">
              ${R.avatar(sp.tur, "mid")}
              <div class="ring-tur-tekst"><p class="etikett">Din tur</p><h1 id="skjerm-tittel">${esc(R.navn(sp.tur))}</h1></div>
            </div>
            <div class="ring-scene">${ringHtml(sp)}</div>
            ${rollerHtml(sp)}
            ${R.ui.dokk(
              R.ui.knapp("Trekk et kort", "trekk", { variant: "stor", ikon: KNAPPKORT, id: "ring-trekk" }),
              R.ui.lenkerad(R.ui.lenke("Kortene", "regler"), R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      kort: {
        tittel: (S) => `Kort ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const finale = erFinale(sp);
          const neste = nesteSpiller(sp);
          return `
            <div class="ring-hvem">
              ${R.avatar(sp.tur)}
              <p><b>${esc(R.navn(sp.tur))}</b> ${sp.tidlig ? "leser skålene" : "trakk"}</p>
              ${sp.tidlig ? "" : `<span class="ring-hvem-nr">${sp.nr} av 52</span>`}
            </div>
            <div class="ring-kortplass">${spillkortHtml(sp)}</div>
            <p class="ring-fot"><span aria-hidden="true">🥤</span> Alkoholfritt teller like mye · alle kan stå over</p>
            ${R.ui.dokk(
              finale ? "" : `<p class="ring-neste-linje">${R.avatar(neste)}<span><b>${esc(R.navn(neste))}</b> trekker neste</span></p>`,
              finale ? R.ui.knapp("Til kåringen", "neste", { variant: "stor", ikon: "👑" }) : R.ui.knapp("Neste kort", "neste"),
              finale ? "" : R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          R.holdVaken();
          const sp = S.spill;
          const k = R.$("#ring-kort");
          if (erFinale(sp)) {
            R.lyd.trommevirvel(1.1); // the fanfare comes with the crowning
            R.vibrer([60, 40, 60, 40, 160]);
          } else if (verdi(sp.kort) === KONGE) {
            R.lyd.pling();
          }
          if (k) R.si(sp.tidlig ? `${D.finale.tittel} ${D.finale.tidlig}` : `${kortNavn(sp.kort)}: ${erFinale(sp) ? D.finale.tittel : regelFor(sp.kort).tittel}.`);
        },
      },

      vann: {
        tittel: "Vannpause",
        tilbake: "hjem",
        vis: (S) => `
          <div class="ring-vann">
            <svg class="ring-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
              <defs><clipPath id="ring-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
              <g clip-path="url(#ring-glass-innside)">
                <path class="ring-vannflate" d="M0 70 Q15 62 30 70 T60 70 T90 70 T120 70 T150 70 V160 H0 Z" fill="var(--himmel)"/>
                <circle class="ring-boble" cx="50" cy="120" r="4" fill="#fff" opacity=".7"/>
                <circle class="ring-boble to" cx="70" cy="128" r="3" fill="#fff" opacity=".6"/>
              </g>
              <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
              <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
            </svg>
            <p class="etikett">Etter ${S.spill.nr} kort</p>
            <h1 id="skjerm-tittel">Vannpause!</h1>
            <p class="ingress">Alle tar en god slurk vann før neste kort. Kroppen takker – og kvelden varer lenger.</p>
          </div>
          ${R.ui.dokk(R.ui.knapp("Skål i vann!", "vann-ferdig", { variant: "himmel", ikon: "💧" }), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`,
        inn() {
          R.lyd.pop();
          R.vibrer(20);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = sp.kronet;
          const skaler = sp.skaler.filter((s) => s.t);
          const regler = sp.regler.filter((r) => r.t);
          return `
            <div class="banner aksent ring-banner">
              <div class="ring-kronet">${R.avatar(k, "gigant")}<span class="ring-kronet-krone">${KRONE}</span></div>
              <p class="etikett">${sp.tidlig ? "Finalen" : "Den fjerde kongen"}</p>
              <h1 id="skjerm-tittel">${esc(R.navn(k))} ble kronet!</h1>
              <p class="ingress">${sp.tidlig ? "Dere tok finalen" : "Ringen er brutt"} etter ${esc(R.flertall(sp.nr, "kort", "kort"))}. Skål for gjengen – og takk for laget!</p>
            </div>
            ${
              skaler.length
                ? `<div class="papirboks ring-liste"><p class="etikett">Kveldens skåler</p><ul>${skaler.map((s) => `<li>${esc(s.t)} <span class="ring-av">– ${esc(R.navn(s.i))}</span></li>`).join("")}</ul></div>`
                : ""
            }
            ${
              regler.length
                ? `<div class="papirboks ring-liste"><p class="etikett">Reglene dere laget</p><ul>${regler.map((r) => `<li>${esc(r.t)} <span class="ring-av">– ${esc(R.navn(r.i))}</span></li>`).join("")}</ul></div>`
                : ""
            }
            ${R.ui.merker([
              [String(sp.nr), "kort"],
              [String(sp.regler.length), sp.regler.length === 1 ? "regel" : "regler"],
              [String(sp.vann), sp.vann === 1 ? "vannpause" : "vannpauser"],
            ])}
            <p class="hjelp ring-hjem">💧 Husk vann, mat og trygg vei hjem.</p>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn() {
          R.lyd.fanfare();
          R.konfetti(["--lampe", "--aksent", "--rosa", "--mynte", "--himmel"]);
          R.slippVaken();
        },
      },
    },

    felt: {
      utkast(S, el) {
        if (!S.spill || S.spill.fase !== "kort") return;
        S.spill.utkast = el.value.slice(0, 80);
        R.lagre();
      },
    },

    skjema: {
      // Enter in the rule/toast field: just close the keyboard.
      utkast(S, form) {
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
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil(S.spill.fase);
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("ring");
      },
      // Draw a card: from the ring (the tapped spot) or with the button (a random one).
      async trekk(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "ring" || laast) return;
        const p = velgPlass(sp, el && el.id === "ring-bord" ? e : null);
        if (p < 0) return;
        laast = true;
        const fortsatt = R.vakt();
        const kort = R.$(`#ring-bord [data-pos="${p}"]`);
        R.lyd.sveip();
        R.vibrer(12);
        if (kort && !R.rolig()) {
          kort.classList.add("trekkes");
          R.$$('#skjerm [data-h="trekk"]').forEach((b) => (b.disabled = true));
          await R.vent(430);
        }
        laast = false;
        if (!fortsatt() || S.spill !== sp || sp.fase !== "ring") return;
        trekkKort(sp, p);
        R.lyd.snu();
        R.gaTil("kort");
      },
      ide(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kort") return;
        nyIde(sp);
        R.vis();
      },
      "ide-bruk"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kort") return;
        const t = ideTekst(sp);
        if (!t) return;
        sp.utkast = t.slice(0, 80);
        R.lyd.pop();
        R.vis();
      },
      async kompis(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kort" || regelFor(sp.kort).id !== "kompis") return;
        const fortsatt = R.vakt();
        const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== sp.tur);
        const valgt = await R.velgIArk("Velg en kompis", andre.map((i) => ({ v: i, tekst: R.navn(i) })), "Dere drikker sammen til neste åtter.");
        if (valgt == null || !fortsatt() || S.spill !== sp || sp.fase !== "kort") return;
        sp.roller.kompis = [sp.tur, valgt];
        R.lyd.pop();
        R.vibrer(15);
        R.vis();
        R.si(`${R.navn(valgt)} er kompisen din.`);
      },
      roller(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const roller = rollerListe(sp);
        const rader = roller.map((r) => `<li><span class="ring-rolle-ikon" aria-hidden="true">${r.ikon}</span><span><b>${esc(r.lang)}</b><small>${esc(r.til)}</small></span></li>`);
        sp.regler.forEach((r, n) =>
          rader.push(`<li><span class="ring-rolle-ikon" aria-hidden="true">📜</span><span><b>${r.t ? esc(r.t) : `Regel ${n + 1} (sagt høyt)`}</b><small>Laget av ${esc(R.navn(r.i))} · gjelder resten av spillet</small></span></li>`),
        );
        sp.skaler.forEach((s) =>
          rader.push(`<li><span class="ring-rolle-ikon" aria-hidden="true">👑</span><span><b>${s.t ? esc(s.t) : `Skålen til ${esc(R.navn(s.i))} (sagt høyt)`}</b><small>${s.t ? `Fra ${esc(R.navn(s.i))} · ` : ""}til finalen</small></span></li>`),
        );
        R.ark(`
          <h2 id="ark-tittel">Gjelder nå</h2>
          ${rader.length ? `<ul class="ring-rolleliste">${rader.join("")}</ul>` : `<p class="ingress">Ingen roller eller regler ennå.</p>`}
          <button class="knapp" data-h="lukk-ark">Spill videre</button>`);
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "kort") return;
        if (erFinale(sp)) {
          sp.ferdig = true;
          sp.fase = "ring";
          R.statistikk("ferdig", { kort: sp.nr, finale: true });
          R.gaTil("slutt");
          return;
        }
        lagreUtkast(sp);
        sp.utkast = "";
        sp.ide = null;
        sp.kort = null;
        sp.tur = nesteSpiller(sp);
        if (sp.nr % VANN_HVERT === 0) {
          sp.fase = "vann";
          sp.vann += 1;
          R.gaTil("vann");
        } else {
          sp.fase = "ring";
          R.gaTil("ring");
        }
      },
      "vann-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "vann") return;
        sp.fase = "ring";
        R.gaTil("ring");
      },
      // «Avslutt»: take the finale now (toasts and a crowning) – or end without it.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        if (sp.nr === 0) {
          const fortsatt = R.vakt();
          if ((await R.bekreft("Avslutte ringen?", "Dere kan alltid starte en ny ring.", "Avslutt", "Spill videre")) && fortsatt() && S.spill === sp) H["avslutt-uten"](el, e, S);
          return;
        }
        R.ark(`
          <h2 id="ark-tittel">Avslutte ringen?</h2>
          <p class="ingress">Ta finalen nå, så skåler dere for ${sp.skaler.length ? "skålene dere har laget" : "gjengen"} og kårer en konge. Eller avslutt uten finale.</p>
          <div class="stabel">
            ${R.ui.knapp("Ta finalen nå", "finale-na", { ikon: "👑" })}
            ${R.ui.knapp2("Avslutt", "avslutt-uten")}
          </div>
          <button class="lenke" data-h="lukk-ark">Spill videre</button>`);
      },
      "finale-na"(el, e, S) {
        const sp = S.spill;
        R.lukkArk();
        if (!pagar(S)) return;
        if (sp.fase === "kort" && sp.kort != null) lagreUtkast(sp); // a rule or toast on the card counts
        const kronet = sp.sisteKonge != null ? sp.sisteKonge : sp.tur;
        Object.assign(sp, { tidlig: true, fase: "kort", kort: null, ide: null, utkast: "", tur: kronet, kronet });
        R.gaTil("kort");
      },
      "avslutt-uten"(el, e, S) {
        R.lukkArk();
        if (!S.spill) return;
        R.statistikk("ferdig", { kort: S.spill.nr, finale: false });
        S.spill = null;
        R.gaTil("hjem");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
