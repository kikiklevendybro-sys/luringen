/* Mistanken — «Paranoia» (18+).
   The phone whispers a secret question to one player – «Who here …?» – and that player answers by
   tapping a name. Everyone sees who was pointed at, never why. The one pointed at may want to know:
   take a small sip – or say something nice about the one who answered – and the coin decides
   whether the question is revealed. Or let it be: the secret stays. The phone goes round, so
   everyone answers in turn. Kåringen crowns the evening's most suspected (the most pointed at) and
   lists the questions that came out; the rest stay secret for ever.
   Responsible by design: there is always a way without drinking (a kind word, or letting it be),
   small sips only, alcohol-free counts the same, a water card every tenth round, and the
   questions are kind: no one is singled out, nothing about real people.
   The rules at the top are pure; test/mistanken.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- The rules (no kit needed) ----------

  const VANN_HVERT = 10; // a water card after every tenth round
  const VALG = ["slurk", "snill", "la"]; // drink and flip, a kind word and flip, let it be

  // Another player for {a} in the question: never the one answering, the least named first.
  function velgAnnen(antall, svarer, telling, rng) {
    const andre = Array.from({ length: antall }, (_, i) => i).filter((i) => i !== svarer);
    andre.sort((x, y) => (telling[x] || 0) - (telling[y] || 0) || 0);
    const minst = telling[andre[0]] || 0;
    const kandidater = andre.filter((i) => (telling[i] || 0) === minst);
    return kandidater[Math.floor(rng() * kandidater.length)];
  }
  const harAnnen = (t) => /\{a\}/.test(t);
  // The question split around {a}: strings and the player index.
  function deler(tekst, a) {
    const ut = [];
    String(tekst)
      .split("{a}")
      .forEach((s, n) => {
        if (n) ut.push(a);
        if (s) ut.push(s);
      });
    return ut;
  }

  function ny(antall, svarer) {
    return {
      antall,
      svarer,
      runde: 0, // questions answered
      a: null,
      fase: "gi",
      sett: false,
      pekt: null,
      valgt: null,
      mynt: null,
      pektPa: Array(antall).fill(0),
      navngitt: Array(antall).fill(0),
      avslort: [],
      vann: 0,
      ferdig: false,
    };
  }

  // The answer: a name (never yourself), once the question has been seen.
  function pek(sp, i) {
    if (sp.fase !== "les" || !sp.sett || !Number.isInteger(i) || i < 0 || i >= sp.antall || i === sp.svarer) return false;
    sp.pekt = i;
    sp.pektPa[i] += 1;
    sp.fase = "pekt";
    return true;
  }
  // The one pointed at chooses; with «slurk» or «snill» the coin is thrown (mynt: true = revealed).
  function velg(sp, valg, rng, kort) {
    if (sp.fase !== "pekt" || !VALG.includes(valg)) return false;
    sp.valgt = valg;
    sp.mynt = valg === "la" ? null : rng() < 0.5;
    if (sp.mynt) sp.avslort.push({ k: kort, a: sp.a, svarer: sp.svarer, pekt: sp.pekt });
    sp.fase = "mynt";
    return true;
  }
  // The next round: the phone goes to the next player (or a water card first).
  function videre(sp) {
    if (sp.fase === "mynt") {
      sp.runde += 1;
      sp.svarer = (sp.svarer + 1) % sp.antall;
      Object.assign(sp, { pekt: null, valgt: null, mynt: null, sett: false, a: null });
      if (sp.runde % VANN_HVERT === 0) {
        sp.vann += 1;
        sp.fase = "vann";
        return "vann";
      }
    } else if (sp.fase !== "vann") return null;
    sp.fase = "gi";
    return "gi";
  }

  const R = window.Rusj;
  if (!R) {
    window.Mistanken = { VANN_HVERT, VALG, velgAnnen, harAnnen, deler, ny, pek, velg, videre };
    return;
  }

  // ---------- The game ----------

  const D = window.RUSJ_DATA.sporsmal;
  const esc = R.esc;
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const ALLE = [];
  PAKKER.forEach((p) => p.sporsmal.forEach((t) => ALLE.push({ p: p.id, t })));
  const stokk = R.kortstokk("sporsmal", ALLE.length);
  const MIN = 3;
  const MAKS = 16;
  const SIST = "mistanken.sist";
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "mistanken") + "/";
  const HOLD = R.t("Hold fingeren på kortet for å se");

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const sporsmalHtml = (k, a) => deler(ALLE[k].t, a).map((d) => (typeof d === "number" ? `<b class="mis-navn">${esc(R.navn(d))}</b>` : esc(d))).join("");
  const sporsmalRen = (k, a) => deler(ALLE[k].t, a).map((d) => (typeof d === "number" ? R.navn(d) : d)).join("");

  let H; // the actions, so one action can reuse another
  let kaster = false; // the coin is in the air

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS);
  }

  // A new secret question for the one answering (and a player for {a}).
  function nyttSporsmal(sp) {
    const valgt = new Set(sp.pakker);
    let k = stokk.neste((i) => valgt.has(ALLE[i].p));
    if (k < 0) k = stokk.neste();
    sp.k = k;
    sp.sett = false;
    sp.a = harAnnen(ALLE[k].t) ? velgAnnen(sp.antall, sp.svarer, sp.navngitt, Math.random) : null;
    if (sp.a != null) sp.navngitt[sp.a] += 1;
  }

  const MYNT = `<span class="mis-mynt-side forside" aria-hidden="true">👁️</span><span class="mis-mynt-side bakside" aria-hidden="true">🤫</span>`;

  function sistLinje() {
    const s = R.les(SIST, null);
    if (!s || !Number.isInteger(s.n) || s.n < 1 || !Number.isInteger(s.m) || s.m < 0) return "";
    return R.t("Sist: {sporsmal}, {m} avslørt.", { sporsmal: R.flertall(s.n, "spørsmål", "spørsmål"), m: s.m });
  }

  // The most pointed at – one or two of them; when more share the top, nobody is crowned.
  function mestMistenkte(sp) {
    const topp = Math.max(0, ...sp.pektPa);
    const mest = topp > 0 ? sp.pektPa.map((n, i) => (n === topp ? i : -1)).filter((i) => i >= 0) : [];
    return mest.length <= 2 && mest.length < sp.antall ? mest : [];
  }

  R.start({
    id: "mistanken",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: { pakker: PAKKER.filter((p) => !p.av).map((p) => p.id) },
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      const o = (S.oppsett = Object.assign({ pakker: [] }, S.oppsett || {}));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = PAKKER.filter((p) => !p.av).map((p) => p.id);
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const liste = (l) => Array.isArray(l) && l.length === n && l.every((x) => Number.isInteger(x) && x >= 0);
        const ok =
          Number.isInteger(n) && n >= MIN && n <= MAKS &&
          spiller(sp.svarer) && Number.isInteger(sp.runde) && sp.runde >= 0 &&
          ["gi", "les", "pekt", "mynt", "vann"].includes(sp.fase) &&
          Array.isArray(sp.pakker) && sp.pakker.some((id) => pakke(id)) &&
          liste(sp.pektPa) && liste(sp.navngitt) && Array.isArray(sp.avslort) &&
          (sp.fase === "vann" || (Number.isInteger(sp.k) && !!ALLE[sp.k])) &&
          (sp.a == null || (spiller(sp.a) && sp.a !== sp.svarer)) &&
          (!["pekt", "mynt"].includes(sp.fase) || (spiller(sp.pekt) && sp.pekt !== sp.svarer)) &&
          (sp.fase !== "mynt" || VALG.includes(sp.valgt));
        if (!ok) S.spill = null;
        else {
          sp.pakker = sp.pakker.filter((id) => pakke(id));
          sp.avslort = sp.avslort.filter((x) => x && ALLE[x.k] && spiller(x.svarer) && spiller(x.pekt) && (x.a == null || spiller(x.a)));
          sp.vann = Math.max(0, Number(sp.vann) || 0);
          if (sp.fase !== "vann" && ALLE[sp.k] && harAnnen(ALLE[sp.k].t) && sp.a == null) sp.a = velgAnnen(n, sp.svarer, sp.navngitt, Math.random);
        }
      }
      const skjermer = { gi: "gi", les: "gi", pekt: "pekt", mynt: "mynt", vann: "vann" };
      if (["gi", "les", "pekt", "mynt", "vann"].includes(S.skjerm)) S.skjerm = pagar(S) ? skjermer[S.spill.fase] : "hjem";
      if (pagar(S) && S.spill.fase === "les") S.spill.fase = "gi"; // a secret is never on the screen after a reload
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Mobilen hvisker et hemmelig spørsmål til én av dere – «Hvem her …?». Svaret er et navn. Alle får vite hvem som ble pekt ut, men ikke hvorfor."),
      steg: [
        [R.t("Les i hemmelighet"), R.t("Den som får mobilen, holder fingeren på kortet og leser spørsmålet. Så trykker du på et navn – uten å si spørsmålet høyt.")],
        [R.t("Vil du vite det?"), R.t("Den som ble pekt ut, kan ta en liten slurk – eller si noe hyggelig om den som svarte. Da kaster mobilen mynt: 👁️ avslører spørsmålet, 🤫 holder det hemmelig.")],
        [R.t("Eller la det være"), R.t("Du trenger ikke å vite. Da forblir spørsmålet hemmelig, og mobilen går videre til neste.")],
      ],
      tips: [
        R.t("Alkoholfritt teller like mye, og alle kan stå over – uten å forklare seg."),
        R.t("Spørsmålene er snille. Er et spørsmål feil for gjengen, trykk «Bytt spørsmål»."),
        R.t("Hver tiende runde er det vannpause."),
        R.t("Spis og drikk vann underveis, og sørg for trygg vei hjem."),
      ],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp || !ALLE[sp.k]) return { html: "" };
        return { html: `<span class="mis-kort-etikett">${esc(R.t("Hemmelig spørsmål"))}</span><p class="mis-sporsmal">${sporsmalHtml(sp.k, sp.a)}</p>`, si: sporsmalRen(sp.k, sp.a), klasse: "mis-bak" };
      },
      sett(S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "les" || sp.sett) return;
        sp.sett = true;
        R.vis();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sist = !pagar(S) ? sistLinje() : "";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("«Hvem her …?» – du svarer med et navn."))}<br><em>${esc(R.t("Spørsmålet forblir kanskje hemmelig."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n}", { n: S.spill.runde + 1 }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (sist ? `<p class="hjelp mis-sist">${esc(sist)}</p>` : ""),
            }),
            merker: [
              [`${MIN}–${MAKS}`, R.t("spillere")],
              [String(ALLE.length), R.t("spørsmål")],
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
          const antall = PAKKER.filter((p) => o.pakker.includes(p.id)).reduce((s, p) => s + p.sporsmal.length, 0);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Velg pakker"))}</h2><span class="tall">${esc(R.flertall(antall, "spørsmål", "spørsmål"))}</span></div>
              ${R.ui.fliser("pakke", PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.sporsmal.length}`, ikon: p.ikon })), o.pakker)}
            </section>
            ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Mobilen går rundt i samme rekkefølge som lista.") })}
            <div class="papirboks mis-vett">
              <p class="etikett">${esc(R.t("Slik er slurkene"))}</p>
              <ul class="tips">
                <li>${esc(R.t("En slurk er en liten slurk – aldri mer."))}</li>
                <li>${esc(R.t("Vil du vite spørsmålet, kan du si noe hyggelig i stedet for å drikke."))}</li>
                <li>${esc(R.t("Alkoholfritt teller like mye, og alle kan stå over."))}</li>
                <li>${esc(R.t("Hver tiende runde er det vannpause."))}</li>
              </ul>
            </div>
            ${R.ui.dokk(o.pakker.length ? "" : `<p class="hjelp">${esc(R.t("Velg minst én pakke."))}</p>`, R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      gi: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.runde + 1 }),
        tilbake: "hjem",
        vis: (S) =>
          R.ui.giTil({
            i: S.spill.svarer,
            h: "jeg-er",
            advarsel: R.t("De andre ser bort"),
          }),
        inn: () => R.holdVaken(),
      },

      les: {
        tittel: (S) => R.t("Runde {n}", { n: S.spill.runde + 1 }),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== sp.svarer);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{navn}: Les spørsmålet i hemmelighet", { navn: R.navn(sp.svarer) }))}</h1>
            ${R.ui.mappe({ etikett: R.t("Topphemmelig"), tekst: HOLD, etikettAria: R.t("Hold fingeren på kortet for å se spørsmålet") })}
            <section class="seksjon mis-svar">
              <div class="seksjon-hode"><h2>${esc(sp.sett ? R.t("Hvem er svaret?") : R.t("Les spørsmålet først"))}</h2></div>
              ${R.ui.velgere("pek", andre, null, { av: () => !sp.sett })}
            </section>
            ${R.ui.dokk(R.ui.lenkerad(R.ui.lenke(R.t("Bytt spørsmål"), "bytt"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
      },

      pekt: {
        tittel: R.t("Mistanken"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const svarer = `<b>${esc(R.navn(sp.svarer))}</b>`;
          const pekt = `<b>${esc(R.navn(sp.pekt))}</b>`;
          return `
            <div class="mis-pekt">
              <span class="mis-finger" aria-hidden="true">👉</span>
              ${R.avatar(sp.pekt, "gigant")}
              <h1 id="skjerm-tittel">${esc(R.t("{svarer} pekte på {pekt}!")).replace("{svarer}", svarer).replace("{pekt}", pekt)}</h1>
              <p class="ingress">${esc(R.t("{pekt}, vil du vite hva spørsmålet var?")).replace("{pekt}", pekt)}</p>
            </div>
            <p class="mis-fot-linje"><span aria-hidden="true">🥤</span> ${esc(R.t("Alkoholfritt teller like mye · alle kan stå over"))}</p>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Ta en slurk og kast mynt"), "valg", { v: "slurk", ikon: "🥤" }),
              R.ui.knapp2(R.t("Si noe hyggelig om {navn} og kast mynt", { navn: R.navn(sp.svarer) }), "valg", { v: "snill", ikon: "💛" }),
              R.ui.lenkerad(R.ui.lenke(R.t("La det være"), "valg", { v: "la" })),
            )}`;
        },
        inn() {
          R.holdVaken();
          R.lyd.trommevirvel(0.8);
        },
      },

      mynt: {
        tittel: R.t("Mistanken"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const neste = (sp.svarer + 1) % sp.antall;
          const svarer = `<b>${esc(R.navn(sp.svarer))}</b>`;
          let midt;
          if (sp.mynt) {
            midt = `
              <div class="mis-resultat">
                <span class="mis-mynt landet" aria-hidden="true">${MYNT}</span>
                <p class="etikett">${esc(R.t("Mynten sier: avslørt!"))}</p>
                <h1 id="skjerm-tittel" class="vh">${esc(R.t("Spørsmålet var"))}</h1>
              </div>
              ${R.ui.storkort({ etikett: R.t("Spørsmålet var"), tekstHtml: sporsmalHtml(sp.k, sp.a), klasse: "mis-avslort", kompakt: true, lengde: sporsmalRen(sp.k, sp.a).length })}
              <p class="mis-etter">${esc(R.t("{svarer} svarte {pekt}.", { svarer: R.navn(sp.svarer), pekt: R.navn(sp.pekt) }))}</p>`;
          } else {
            midt = `
              <div class="mis-resultat">
                <span class="mis-mynt landet bak" aria-hidden="true">${MYNT}</span>
                <p class="etikett">${esc(sp.valgt === "la" ? R.t("Dere lot det være") : R.t("Mynten sier: hemmelig!"))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Hemmeligheten består"))}</h1>
                <p class="ingress">${esc(R.t("Bare {navn} vet hva spørsmålet var.")).replace("{navn}", svarer)}</p>
              </div>`;
          }
          const valg = sp.valgt === "slurk" ? R.t("{navn} tok en slurk for å få vite det.", { navn: R.navn(sp.pekt) }) : sp.valgt === "snill" ? R.t("{navn} sa noe hyggelig for å få vite det.", { navn: R.navn(sp.pekt) }) : "";
          return `
            ${midt}
            ${valg ? `<p class="mis-valg">${esc(valg)}</p>` : ""}
            ${R.ui.dokk(
              `<p class="mis-neste-linje">${R.avatar(neste)}<span>${esc(R.t("{navn} får mobilen")).replace("{navn}", `<b>${esc(R.navn(neste))}</b>`)}</span></p>`,
              R.ui.knapp(R.t("Neste runde"), "neste"),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      vann: {
        tittel: R.t("Vannpause"),
        tilbake: "hjem",
        vis: (S) => `
          <div class="mis-vann">
            <svg class="mis-vannglass" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
              <defs><clipPath id="mis-glass-innside"><path d="M24 22 L34 132 Q35 140 44 140 H76 Q85 140 86 132 L96 22 Z"/></clipPath></defs>
              <g clip-path="url(#mis-glass-innside)">
                <path class="mis-vannflate" d="M0 70 Q15 62 30 70 T60 70 T90 70 T120 70 T150 70 V160 H0 Z" fill="var(--himmel)"/>
                <circle class="mis-boble" cx="50" cy="120" r="4" fill="#fff" opacity=".7"/>
                <circle class="mis-boble to" cx="70" cy="128" r="3" fill="#fff" opacity=".6"/>
              </g>
              <path d="M20 18 L31 133 Q32 144 44 144 H76 Q88 144 89 133 L100 18 Z" fill="none" stroke="var(--papir)" stroke-width="6" stroke-linejoin="round"/>
              <path d="M36 34 L42 112" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
            </svg>
            <p class="etikett">${esc(R.t("Etter {runder}", { runder: R.flertall(S.spill.runde, "runde", "runder") }))}</p>
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
          const mest = mestMistenkte(sp);
          const rader = sp.pektPa.map((n, i) => ({ i, poeng: n }));
          return `
            ${R.ui.banner({
              klasse: "aksent mis-banner",
              etikett: mest.length ? R.t("Kveldens mest mistenkte") : R.t("Takk for i kveld"),
              tittel: mest.length ? R.ramsOpp(mest.map((i) => R.navn(i))) : R.t("Skål for gjengen!"),
              tekst: R.t("{sporsmal} – {m} avslørt. Resten forblir hemmelig.", { sporsmal: R.flertall(sp.runde, "spørsmål", "spørsmål"), m: sp.avslort.length }),
              stemning: mest.length ? "jubel" : "",
            })}
            ${sp.pektPa.some((n) => n > 0) ? `<section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Pekt på"))}</h2></div>${R.ui.poengliste(rader, { utenLeder: !mest.length })}</section>` : ""}
            ${
              sp.avslort.length
                ? `<div class="papirboks mis-avslorte">
                    <p class="etikett">👁️ ${esc(R.t("Spørsmålene som ble avslørt"))}</p>
                    <ul>${sp.avslort.map((x) => `<li>${sporsmalHtml(x.k, x.a)} <span class="mis-svar-pa">→ ${esc(R.navn(x.pekt))}</span></li>`).join("")}</ul>
                  </div>`
                : ""
            }
            <div class="mis-del">${R.ui.knapp2(R.t("Del kvelden"), "del")}</div>
            <p class="hjelp mis-hjem">💧 ${esc(R.t("Husk vann, mat og trygg vei hjem."))}</p>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp.talt) {
            sp.talt = true;
            R.skriv(SIST, { n: sp.runde, m: sp.avslort.length });
            R.statistikk("ferdig", { spillere: sp.antall, runder: sp.runde, avslort: sp.avslort.length });
            R.lagre();
          }
          if (mestMistenkte(sp).length) {
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--lampe", "--rosa", "--himmel"]);
          } else R.lyd.pling();
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
        if (!pagar(S)) return;
        if (S.spill.fase === "les") S.spill.fase = "gi";
        R.gaTil(S.spill.fase);
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        const antall = R.klamp(S.antall || 4, MIN, MAKS);
        S.spill = Object.assign(ny(antall, R.heltall(0, antall - 1)), { pakker: S.oppsett.pakker.slice() });
        nyttSporsmal(S.spill);
        R.statistikk("start", { spillere: antall, pakker: S.spill.pakker.length });
        R.gaTil("gi");
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "gi") return;
        sp.fase = "les";
        R.gaTil("les");
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "les") return;
        if (sp.a != null) sp.navngitt[sp.a] = Math.max(0, sp.navngitt[sp.a] - 1);
        nyttSporsmal(sp);
        R.lyd.sveip();
        R.vis();
        R.toast(R.t("Nytt spørsmål – hold på kortet igjen"));
      },
      pek(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !pek(sp, Number(el.dataset.v))) return;
        R.vibrer([30, 30, 60]);
        R.gaTil("pekt");
      },
      async valg(el, e, S) {
        const sp = S.spill;
        if (kaster || !pagar(S) || sp.fase !== "pekt") return;
        if (!velg(sp, el.dataset.v, Math.random, sp.k)) return;
        if (sp.valgt === "la") {
          R.lyd.pop();
          R.gaTil("mynt");
          return;
        }
        // The coin spins for a moment before it lands.
        kaster = true;
        const fortsatt = R.vakt();
        R.ark(`<div class="mis-kast"><span class="mis-mynt snurrer ${sp.mynt ? "" : "bak"}" aria-hidden="true">${MYNT}</span><h2 id="ark-tittel">${esc(R.t("Mynten snurrer …"))}</h2></div>`);
        R.lyd.trommevirvel(1);
        await R.vent(R.rolig() ? 300 : 1400);
        kaster = false;
        R.lukkArk();
        if (!fortsatt() || S.spill !== sp) return;
        if (sp.mynt) {
          R.lyd.fanfare();
          R.vibrer([40, 30, 90]);
        } else R.lyd.pling();
        R.gaTil("mynt");
        R.si(sp.mynt ? `${R.t("Spørsmålet var")}: ${sporsmalRen(sp.k, sp.a)}` : R.t("Hemmeligheten består"));
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "mynt") return;
        const hvor = videre(sp);
        if (hvor === "gi") nyttSporsmal(sp);
        R.gaTil(hvor);
      },
      "vann-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "vann") return;
        videre(sp);
        nyttSporsmal(sp);
        R.gaTil("gi");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = sp.runde === 0 && !["pekt", "mynt"].includes(sp.fase);
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ingenting ? R.t("Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (sp.fase === "pekt" || sp.fase === "mynt") sp.runde += 1; // this round was answered
        sp.ferdig = true;
        R.gaTil("slutt");
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const sporsmal = R.flertall(sp.runde, "spørsmål", "spørsmål");
        R.del(R.app.navn, R.t("{spill}: {sporsmal} i kveld – bare {m} ble avslørt. Resten er fortsatt hemmelig!", { spill: R.app.navn, sporsmal, m: sp.avslort.length }), ADRESSE, {
          kort: { tittel: R.app.navn, linjer: [sporsmal, R.t("{m} avslørt", { m: sp.avslort.length })] },
        });
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
