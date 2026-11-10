/* Detektiven — «Hvem er jeg? – 20 spørsmål».
   One player gets a secret (hold to see). The others are detectives and ask yes/no questions out
   loud; the phone counts them on a magnifying-glass meter (Ja / Nei / Kanskje or a plain +1).
   Hints after 10 and 15 questions. Points: a correct guess gives the guesser 2, and the keeper 1
   if it took more than 10 questions; if nobody gets it within 20, the keeper gets 3.
   Everyone keeps a secret once (or more), then the podium. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const KAT = window.RUSJ_DATA.hemmeligheter.kategorier;
  const MAKS = 20;
  const HINT_VED = [10, 15];
  const NIVAER = [
    [1, "Lett"],
    [2, "Middels"],
    [3, "Vanskelig"],
  ];
  const NIVA_TEKST = {
    1: "Bare lette hemmeligheter – perfekt for barn.",
    2: "Lette og middels vanskelige – passer de fleste.",
    3: "Alt sammen, også de vanskeligste.",
  };
  let H; // the actions

  const ALLE = [];
  KAT.forEach((k) => k.liste.forEach(([navn, n, hjelp]) => ALLE.push({ k: k.id, navn, n, hjelp })));
  const kat = (id) => KAT.find((k) => k.id === id);
  const stokk = R.kortstokk("hemmeligheter", ALLE.length);
  const iUtvalg = (o, w) => o.kategorier.includes(w.k) && w.n <= o.nivaa;
  const antallI = (o) => ALLE.reduce((s, w) => s + (iUtvalg(o, w) ? 1 : 0), 0);
  const antallKat = (id, nivaa) => ALLE.reduce((s, w) => s + (w.k === id && w.n <= nivaa ? 1 : 0), 0);

  // ---------- Game helpers ----------
  const pagar = (S) => !!S.spill && !S.spill.ferdig; // a game that «Nytt spill» would throw away
  const navneliste = (navn) => (navn.length < 2 ? navn.join("") : navn.slice(0, -1).join(", ") + " og " + navn[navn.length - 1]);
  const holder = (sp) => sp.logg.length % sp.antall; // who keeps the secret this round
  const totalt = (sp) => sp.antall * sp.runder;
  const ferdig = (sp) => sp.logg.length >= totalt(sp);

  function trekk(S) {
    const sp = S.spill;
    const o = { kategorier: sp.kategorier, nivaa: sp.nivaa };
    const brukt = new Set(sp.logg.map((l) => l.h));
    if (sp.runde) brukt.add(sp.runde.h);
    let i = stokk.neste((n) => iUtvalg(o, ALLE[n]) && !brukt.has(n));
    if (i < 0) i = stokk.neste((n) => iUtvalg(o, ALLE[n]));
    return i < 0 ? 0 : i;
  }
  function nyRunde(S) {
    S.spill.runde = { h: trekk(S), sett: false, spm: 0, svar: [], hint: 0 };
  }

  // Up to two hints: the category (unless only one is in play), then the first letter / length.
  function hintListe(sp, h) {
    const w = ALLE[h];
    const k = kat(w.k);
    const liste = [];
    if (sp.kategorier.length > 1) liste.push({ etikett: "Kategori", tekst: `${k.ikon} ${k.navn}` });
    liste.push({ etikett: "Første bokstav", tekst: w.navn.charAt(0).toLocaleUpperCase("nb") });
    const ord = w.navn.split(/\s+/).length;
    const bokstaver = w.navn.replace(/[^\p{L}]/gu, "").length;
    liste.push({ etikett: ord > 1 ? "Ord og bokstaver" : "Antall bokstaver", tekst: ord > 1 ? `${ord} ord · ${bokstaver} bokstaver` : `${bokstaver} bokstaver` });
    return liste.slice(0, HINT_VED.length);
  }

  function avslutt(S, gjetter) {
    const sp = S.spill;
    const r = sp.runde;
    if (!r) return;
    const k = holder(sp);
    const pluss = {};
    if (gjetter >= 0) {
      pluss[gjetter] = 2;
      // The winning guess is a question too: 10 counted + the guess = over 10.
      if (r.spm >= 10) pluss[k] = 1;
    } else {
      pluss[k] = 3;
    }
    Object.keys(pluss).forEach((i) => (sp.poeng[i] += pluss[i]));
    sp.logg.push({ k, h: r.h, spm: r.spm, g: gjetter, pluss, svar: r.svar.slice(), hint: r.hint });
    sp.runde = null;
  }

  // ---------- The magnifying-glass meter ----------
  const C = 104;
  const RR = 86;
  const BUER = Array.from({ length: MAKS }, (_, k) => {
    const a0 = ((-90 + k * 18 + 1.9) * Math.PI) / 180;
    const a1 = ((-90 + (k + 1) * 18 - 1.9) * Math.PI) / 180;
    const p = (a) => `${(C + RR * Math.cos(a)).toFixed(2)} ${(C + RR * Math.sin(a)).toFixed(2)}`;
    return `M${p(a0)} A${RR} ${RR} 0 0 1 ${p(a1)}`;
  });
  const MERKER = HINT_VED.map((n) => {
    const a = ((-90 + n * 18) * Math.PI) / 180;
    return { n, x: (C + 99 * Math.cos(a)).toFixed(2), y: (C + 99 * Math.sin(a)).toFixed(2) };
  });
  let nySeg = -1; // the segment that was just added (animated once)

  function lupe(sp, r) {
    const svg = `<svg class="detektiv-lupe-svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <line class="skaft-kant" x1="${C + 74}" y1="${C + 74}" x2="${C + 114}" y2="${C + 114}"/>
      <line class="skaft" x1="${C + 74}" y1="${C + 74}" x2="${C + 114}" y2="${C + 114}"/>
      <circle class="ramme" cx="${C}" cy="${C}" r="98"/>
      <g>${BUER.map((d, k) => `<path class="seg${r.svar[k] ? " s-" + r.svar[k] : ""}${k === nySeg ? " ny" : ""}" d="${d}"/>`).join("")}</g>
      ${sp.hint ? MERKER.map((m) => `<g class="merke${r.spm >= m.n ? " na" : ""}"><circle cx="${m.x}" cy="${m.y}" r="11"/><text x="${m.x}" y="${m.y}" text-anchor="middle" dominant-baseline="central">💡</text></g>`).join("") : ""}
      <circle class="glass" cx="${C}" cy="${C}" r="71"/>
      <path class="glans" d="M${C - 46} ${C - 22} A52 52 0 0 1 ${C - 14} ${C - 50}"/>
    </svg>`;
    const fullt = r.spm >= MAKS;
    return `<button class="detektiv-lupe" data-h="spm" data-stille${fullt ? " disabled" : ""} aria-label="${fullt ? "Alle 20 spørsmålene er brukt" : `Legg til ett spørsmål. ${r.spm} av ${MAKS} er brukt.`}">
      ${svg}
      <span class="detektiv-tall"><b>${r.spm}</b><small>av ${MAKS}</small></span>
      ${fullt ? "" : `<span class="detektiv-pluss" aria-hidden="true">+1 spørsmål</span>`}
    </button>`;
  }

  // The magnifier is the only counter (1 … 20); this line just sets the mood, without numbers.
  function statusTekst(r) {
    if (r.spm === 0) return ["", "Detektivene spør – du svarer med knappene."];
    if (r.spm >= MAKS) return ["slutt", "Siste sjanse! Én gjetning til."];
    if (r.spm >= 17) return ["varsel", "Snart tomt for spørsmål!"];
    if (r.spm === 10) return ["", "Halvveis!"];
    return ["", "Svar ærlig – «Kanskje» er også lov."];
  }

  function hintHtml(sp, r) {
    if (!sp.hint) return "";
    const liste = hintListe(sp, r.h);
    const vist = liste
      .slice(0, r.hint)
      .map((x) => `<div class="detektiv-hintkort"><span class="etikett">${esc(x.etikett)}</span><b>${esc(x.tekst)}</b></div>`)
      .join("");
    let neste = "";
    if (r.hint < liste.length) {
      const ved = HINT_VED[r.hint];
      neste =
        r.spm >= ved
          ? R.ui.knapp2(r.hint ? "Vis et hint til" : "Vis hint", "hint", { ikon: "💡", variant: "aksent" })
          : `<p class="detektiv-hint-laast"><span aria-hidden="true">💡</span> ${r.hint ? "Nytt hint" : "Hint"} etter ${ved} spørsmål</p>`;
    }
    return `<section class="detektiv-hint" aria-label="Hint">${vist}${neste}</section>`;
  }

  function stempel(v) {
    const sted = R.$("#detektiv-stempel");
    if (!sted) return;
    const [tekst, variant] = { j: ["Ja!", "mynte"], n: ["Nei!", ""], k: ["Kanskje", "lampe"] }[v];
    sted.innerHTML = `<span class="stempel ${variant}">${tekst}</span>`;
    clearTimeout(stempel.id);
    stempel.id = setTimeout(() => {
      sted.innerHTML = "";
    }, 950);
  }

  function tell(S, v) {
    const sp = S.spill;
    const r = sp.runde;
    if (!r || r.spm >= MAKS) return;
    r.svar.push(v);
    r.spm = r.svar.length;
    nySeg = r.spm - 1;
    R.vis();
    nySeg = -1;
    if (v === "j") R.lyd.riktig();
    else if (v === "n") R.lyd.tone(220, 0, 0.18, "square", 0.08, 160);
    else if (v === "k") {
      R.lyd.tone(520, 0, 0.1, "triangle", 0.12, 660);
      R.lyd.tone(660, 0.1, 0.12, "triangle", 0.1, 500);
    } else R.lyd.tikk();
    R.vibrer(12);
    if (v !== "x") stempel(v);
    const liste = sp.hint ? hintListe(sp, r.h) : [];
    if (sp.hint && HINT_VED.indexOf(r.spm) >= r.hint && HINT_VED.indexOf(r.spm) < liste.length) {
      R.toast("💡 Hint klart!");
      setTimeout(() => R.lyd.pling(), 180);
    }
    if (r.spm === MAKS) {
      R.lyd.alarm();
      R.vibrer([120, 60, 120]);
      R.si("Alle 20 spørsmålene er brukt. Siste sjanse til å gjette.");
    } else R.si(`${r.spm} av ${MAKS}`);
  }

  let dramatikk = false; // the next reveal gets a drum roll (only right after an unsolved round)
  let starter = false; // the countdown before the questioning is running

  R.start({
    id: "detektiven",
    versjon: 1,
    pagar, // a game is in progress (front page badge, screen kept awake)
    liggende: false, // landscape phones: this game has its own layout (a slim dock at the bottom, see spill.css)

    tilstand: () => ({
      antall: 3,
      oppsett: { kategorier: KAT.map((k) => k.id), nivaa: 2, runder: 1, hint: true },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ kategorier: [], nivaa: 2, runder: 1, hint: true }, S.oppsett));
      o.kategorier = (Array.isArray(o.kategorier) ? o.kategorier : []).filter((id) => kat(id));
      if (!o.kategorier.length) o.kategorier = KAT.map((k) => k.id);
      if (![1, 2, 3].includes(o.nivaa)) o.nivaa = 2;
      if (![1, 2, 3].includes(o.runder)) o.runder = 1;
      o.hint = o.hint !== false;
      const sp = S.spill;
      if (sp) {
        const gyldigH = (h) => Number.isInteger(h) && h >= 0 && h < ALLE.length;
        const ok =
          sp.antall >= 2 &&
          sp.antall <= 20 &&
          Array.isArray(sp.poeng) &&
          sp.poeng.length === sp.antall &&
          Array.isArray(sp.logg) &&
          sp.logg.every((l) => l && gyldigH(l.h) && l.pluss) &&
          Array.isArray(sp.kategorier) &&
          sp.kategorier.every((id) => kat(id)) &&
          (!sp.runde || (gyldigH(sp.runde.h) && Array.isArray(sp.runde.svar)));
        if (!ok) S.spill = null;
      }
      const spillSkjerm = ["gi", "hemmelig", "avhor", "hvem", "avsloring", "slutt"];
      if (!S.spill && spillSkjerm.includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && !S.spill.runde && ["gi", "hemmelig", "avhor", "hvem"].includes(S.skjerm)) {
        if (ferdig(S.spill)) S.skjerm = "slutt";
        else {
          nyRunde(S);
          S.skjerm = "gi";
        }
      }
      if (S.spill && (S.skjerm === "avsloring" || S.skjerm === "slutt") && !S.spill.logg.length) S.skjerm = "hjem";
    },

    regler: {
      intro: "Én spiller får en hemmelighet. De andre er detektiver og har 20 ja/nei-spørsmål på seg til å finne ut hva det er.",
      steg: [
        ["Se hemmeligheten", "Den som har mobilen, holder inne kortet og ser hemmeligheten. De andre ser bort."],
        ["Still ja/nei-spørsmål", "Detektivene spør etter tur: «Er du et dyr?» Svar Ja, Nei eller Kanskje – mobilen teller."],
        ["Gjett!", "Tror du at du vet svaret? Gjett – det teller også som et spørsmål. Riktig? Trykk «Noen gjettet det!»."],
      ],
      tips: [
        "Poeng: Riktig gjetning gir 2. Den med hemmeligheten får 1 hvis det tok over 10 spørsmål – og 3 hvis ingen klarte det på 20.",
        "Etter 10 og 15 spørsmål kan detektivene få et hint.",
        "Usikker på svaret? Trykk «Kanskje». På kortet står det litt om hemmeligheten som hjelp.",
        "Kjenner du ikke hemmeligheten din? Trekk en ny før avhøret starter.",
      ],
    },

    hemmelig: {
      innhold(S) {
        const r = S.spill && S.spill.runde;
        if (!r) return { html: "" };
        const w = ALLE[r.h];
        const k = kat(w.k);
        return {
          klasse: "aksent",
          html: `<span class="kort-etikett">Du er</span>
            <span class="kort-ord ${R.lengdeKlasse(w.navn)}">${esc(w.navn)}</span>
            <span class="kort-pille">${k.ikon} ${esc(k.navn)}</span>
            <span class="kort-fot">${esc(w.hjelp)}</span>`,
        };
      },
      sett(S) {
        const r = S.spill && S.spill.runde;
        if (!r || r.sett) return;
        r.sett = true;
        if (S.skjerm === "hemmelig") R.vis();
        else R.lagre();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        liggende: true, // (the kit's landscape home: mascot left, buttons right)
        vis: (S) => {
          const sp = S.spill;
          const fortsettTekst = !sp
            ? ""
            : sp.runde && sp.runde.spm
              ? `Fortsett · spørsmål ${sp.runde.spm} av ${MAKS}`
              : ferdig(sp)
                ? "Fortsett · se vinneren"
                : `Fortsett · runde ${Math.min(sp.logg.length + 1, totalt(sp))} av ${totalt(sp)}`;
          return R.ui.spillhjem({
            slagordHtml: "Én har en hemmelighet.<br><em>De andre har 20 spørsmål.</em>",
            knapperHtml: R.ui.startKnapper({ pagar: pagar(S), fortsettTekst, ekstraHtml: R.ui.lenke("Slik spiller du", "regler") }),
            merker: [
              ["2–20", "spillere"],
              [String(ALLE.length), "hemmeligheter"],
            ],
          });
        },
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = antallI(o);
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            ${R.ui.spillere({ min: 2, max: 20, hjelp: "Alle får ha hemmeligheten etter tur." })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Kategorier</h2><span class="tall">${n} hemmeligheter</span></div>
              ${R.ui.brikker(
                "kat",
                KAT.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: antallKat(k.id, o.nivaa) })),
                o.kategorier,
                { alle: true, etikett: "Kategorier" },
              )}
            </section>
            <section class="seksjon">
              <h2>Vanskelighet</h2>
              ${R.ui.seg("nivaa", NIVAER, o.nivaa, { etikett: "Vanskelighet" })}
              <p class="hjelp">${esc(NIVA_TEKST[o.nivaa])}</p>
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Runder</h2><span class="tall">${R.klamp(S.antall, 2, 20) * o.runder} hemmeligheter i alt</span></div>
              ${R.ui.seg(
                "runder",
                [
                  [1, "Én hver"],
                  [2, "To hver"],
                  [3, "Tre hver"],
                ],
                o.runder,
                { etikett: "Hvor mange ganger hver" },
              )}
            </section>
            ${R.ui.bryter("hint-valg", o.hint, "Hint underveis", "Etter 10 og 15 spørsmål kan detektivene få et lite hint.")}
            ${R.ui.dokk(n ? "" : `<p class="hjelp">Velg minst én kategori.</p>`, R.ui.knapp("Start", "start", { av: !n }))}`;
        },
      },

      gi: {
        tittel: (S) => `Runde ${S.spill.logg.length + 1} av ${totalt(S.spill)}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = holder(sp);
          return R.ui.giTil({ i: k, h: "jeg-er", tekst: "Hemmeligheten går til", knapp: `Jeg er ${R.navn(k)}`, advarsel: "De andre ser bort", merkeHtml: "🤫", prikker: [sp.antall, k] });
        },
        inn(S) {
          S.spill.skjerm = "gi";
        },
      },

      hemmelig: {
        tittel: "Hemmelig",
        tilbake: "gi",
        gjenoppta: "gi",
        vis(S) {
          const r = S.spill.runde;
          const k = holder(S.spill);
          return `
            <div class="detektiv-hode">
              <p class="ikke-se">🙈 Bare ${esc(R.navn(k))} ser</p>
              <h1 id="skjerm-tittel">Din hemmelighet</h1>
            </div>
            ${R.ui.mappe({ id: "kort", etikett: "Topphemmelig", tekst: "Hold fingeren på kortet for å se" })}
            <p class="hjelp">${r.sett ? "Husk den godt – og hold pokerfjes!" : "Hold fingeren på kortet. Slipp, så skjules det igjen."}</p>
            ${R.ui.dokk(
              R.ui.knapp(r.sett ? "Start avhøret" : "Se kortet først", "start-avhor", { av: !r.sett, ikon: "🔎" }),
              R.ui.lenkerad(R.ui.lenke("Kjenner du den ikke? Trekk en ny", "ny-hemmelighet")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "hemmelig";
        },
      },

      avhor: {
        tittel: "Avhøret",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const [klasse, status] = statusTekst(r);
          const fullt = r.spm >= MAKS;
          // stille: the answer has its own sound, so no kit click on top of it.
          const svar = (tekst, v, variant) => R.ui.knapp(tekst, "svar", { v, variant, av: fullt, stille: true, etikett: `${tekst} – teller som ett spørsmål` });
          return `
            <h1 class="vh" id="skjerm-tittel">Avhøret: ${r.spm} av ${MAKS} spørsmål brukt</h1>
            <div class="detektiv-avhor">
              <div class="detektiv-lupe-sted">
                ${lupe(sp, r)}
                <div class="detektiv-stempel" id="detektiv-stempel" aria-hidden="true"></div>
              </div>
              <div class="detektiv-styring">
                <p class="detektiv-status ${klasse}">${esc(status)}</p>
                <div class="knapprad tre detektiv-svar">${svar("Ja", "j", "mynte")}${svar("Nei", "n", "rosa")}${svar("Kanskje", "k", "lampe")}</div>
                ${hintHtml(sp, r)}
              </div>
            </div>
            ${R.ui.dokk(
              R.ui.knapp("Noen gjettet det!", "gjettet", { ikon: "🎉" }),
              fullt ? R.ui.knapp2("Ingen klarte det", "ingen") : "",
              R.ui.lenkerad(r.spm ? R.ui.lenke("Angre", "angre") : "", R.ui.lenke("Se kortet", "se-kortet"), fullt ? "" : R.ui.lenke("Gi opp", "gi-opp")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "avhor";
        },
      },

      hvem: {
        tittel: "Avhøret",
        tilbake: "avhor",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const k = holder(sp);
          const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== k);
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">Løst etter ${r.spm} spørsmål</p>
              <h1 id="skjerm-tittel">Hvem gjettet det?</h1>
            </div>
            ${R.ui.velgere("gjetter", andre, null)}
            <p class="hjelp">${r.spm >= 10 ? `Riktig svar gir 2 poeng – og ${esc(R.navn(k))} får 1 fordi det tok over 10 spørsmål.` : "Riktig svar gir 2 poeng."}</p>
            ${R.ui.dokk(R.ui.knapp2("Ingen likevel – spill videre", "tilbake-avhor"))}`;
        },
        inn(S) {
          S.spill.skjerm = "hvem";
        },
      },

      avsloring: {
        tittel: "Avsløringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const l = sp.logg[sp.logg.length - 1];
          const w = ALLE[l.h];
          const k = kat(w.k);
          const lost = l.g >= 0;
          const rader = sp.poeng.map((poeng, i) => ({ i, poeng, pluss: l.pluss[i] || 0 }));
          const grunn = (i) => (lost ? (Number(i) === l.g ? "riktig gjetning" : "holdt ut i over 10 spørsmål") : "ingen klarte det");
          const plussListe = Object.keys(l.pluss)
            .sort((a, b) => l.pluss[b] - l.pluss[a])
            .map((i) => `<li>${R.avatar(Number(i))}<span class="navn">${esc(R.navn(Number(i)))}</span><span class="grunn">${grunn(i)}</span><b>+${l.pluss[i]}</b></li>`)
            .join("");
          const neste = ferdig(sp)
            ? R.ui.knapp("Se vinneren", "neste", { variant: "stor", ikon: "🏆" })
            : R.ui.knapp(`Neste: ${R.navn(holder(sp))}`, "neste", { variant: "stor" });
          if (dramatikk) {
            return `
              <div class="detektiv-avsloring spenning">
                <p class="etikett">Ingen klarte det!</p>
                <h1 id="skjerm-tittel">${esc(R.navn(l.k))} var …</h1>
                <div class="papirboks detektiv-fasit" aria-hidden="true"><span class="detektiv-spm-tegn">?</span></div>
              </div>`;
          }
          return `
            <div class="detektiv-avsloring ${lost ? "lost" : "uopp"}">
              <div class="stempel-sted"><span class="stempel ${lost ? "mynte" : ""}">${lost ? "Løst!" : "Uoppklart"}</span></div>
              <h1 id="skjerm-tittel">${lost ? `${esc(R.navn(l.g))} klarte det!` : "Hemmeligheten holdt!"}</h1>
              <div class="papirboks detektiv-fasit">
                <span class="etikett">${esc(R.navn(l.k))} var</span>
                <span class="kort-ord ${R.lengdeKlasse(w.navn)}">${esc(w.navn)}</span>
                <span class="kort-pille">${k.ikon} ${esc(k.navn)}</span>
              </div>
              <p class="ingress">${lost ? `Løst etter ${l.spm} spørsmål.` : `${l.spm} spørsmål, og ingen fant svaret.`}</p>
            </div>
            <section class="seksjon">
              <h2>Poeng denne runden</h2>
              <ul class="detektiv-pluss-liste">${plussListe}</ul>
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Stillingen</h2><span class="tall">${sp.logg.length} av ${totalt(sp)} runder</span></div>
              ${R.ui.poengliste(rader)}
            </section>
            ${R.ui.dokk(neste, R.ui.lenkerad(R.ui.lenke("Angre poengene", "angre-poeng"), ferdig(sp) ? "" : R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn(S) {
          S.spill.skjerm = "avsloring";
          const l = S.spill.logg[S.spill.logg.length - 1];
          // A round is a small win: confetti only for a really quick solve; the big fanfare is saved for the end.
          if (dramatikk) {
            const fortsatt = R.vakt();
            R.lyd.trommevirvel(1.2);
            setTimeout(() => {
              dramatikk = false;
              if (!fortsatt()) return; // left the screen during the drum roll
              R.vis();
              R.vibrer([60, 40, 120]);
            }, 1300);
          } else if (l && l.g >= 0) {
            R.lyd.riktig();
            if (l.spm <= 5) R.konfetti();
          }
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = sp.poeng.map((poeng, i) => ({ i, poeng }));
          const topp = Math.max(...sp.poeng);
          const vinnere = rader.filter((r) => r.poeng === topp && topp > 0);
          const losteRunder = sp.logg.filter((l) => l.g >= 0).sort((a, b) => a.spm - b.spm);
          const holdte = sp.logg.filter((l) => l.g < 0);
          const fakta = [];
          if (losteRunder.length) {
            const l = losteRunder[0];
            fakta.push(["⚡", "Raskeste oppklaring", `${R.navn(l.g)} fant «${ALLE[l.h].navn}» etter ${l.spm} spørsmål`]);
          }
          if (holdte.length) fakta.push(["🔒", "Best bevarte hemmelighet", `${R.navn(holdte[0].k)} som «${ALLE[holdte[0].h].navn}»`]);
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${vinnere.length > 1 ? "Like gode detektiver" : vinnere.length ? "Mesterdetektiven" : "Ferdig!"}</p>
              <h1 id="skjerm-tittel">${vinnere.length ? `${esc(navneliste(vinnere.map((r) => R.navn(r.i))))} vinner!` : "Ingen poeng denne gangen"}</h1>
            </div>
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            ${fakta.length ? `<ul class="detektiv-fakta">${fakta.map(([ikon, t, x]) => `<li><span aria-hidden="true">${ikon}</span><p><b>${esc(t)}</b> ${esc(x)}</p></li>`).join("")}</ul>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          S.spill.skjerm = "slutt";
          S.spill.ferdig = true;
          R.slippVaken();
          if (S.spill.poeng.some((p) => p > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          }
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
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp) return R.gaTil("oppsett");
        if (sp.runde) return R.gaTil(["gi", "hemmelig", "avhor", "hvem"].includes(sp.skjerm) ? sp.skjerm : "gi");
        R.gaTil(ferdig(sp) ? "slutt" : "avsloring");
      },

      // --- setup ---
      kat(el, e, S) {
        const o = S.oppsett;
        const id = el.dataset.v;
        if (id === "*") o.kategorier = o.kategorier.length === KAT.length ? [] : KAT.map((k) => k.id);
        else o.kategorier = o.kategorier.includes(id) ? o.kategorier.filter((x) => x !== id) : [...o.kategorier, id];
        R.vis();
      },
      nivaa(el, e, S) {
        S.oppsett.nivaa = Number(el.dataset.v);
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      "hint-valg"(el, e, S) {
        S.oppsett.hint = !S.oppsett.hint;
        R.vis();
      },
      hint(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.runde;
        if (!r) return;
        const liste = hintListe(sp, r.h);
        if (r.hint >= liste.length || r.spm < HINT_VED[r.hint]) return;
        r.hint += 1;
        R.vis();
        R.lyd.pling();
        R.si(`Hint: ${liste[r.hint - 1].etikett}: ${liste[r.hint - 1].tekst}`);
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!antallI(o)) return;
        const antall = R.klamp(S.antall, 2, 20);
        S.spill = {
          antall,
          runder: o.runder,
          kategorier: o.kategorier.slice(),
          nivaa: o.nivaa,
          hint: o.hint,
          poeng: Array.from({ length: antall }, () => 0),
          logg: [],
          runde: null,
          skjerm: "gi",
        };
        nyRunde(S);
        R.gaTil("gi"); // the kit keeps the screen awake while pagar(S) is true
      },

      // --- the secret ---
      "jeg-er": () => R.gaTil("hemmelig"),
      "ny-hemmelighet"(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || r.spm) return;
        r.h = trekk(S);
        r.sett = false;
        R.vis();
        R.lyd.snu();
        R.toast("Ny hemmelighet trukket!");
      },
      async "start-avhor"(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || !r.sett || starter) return;
        starter = true;
        const ferdigTalt = await R.nedtelling(["3", "2", "1", "Spør!"], 560);
        starter = false;
        // false = the screen changed during the countdown (e.g. «Tilbake»): stay where we are.
        if (!ferdigTalt || S.spill.runde !== r) return;
        R.gaTil("avhor");
      },

      // --- questioning ---
      spm: (el, e, S) => tell(S, "x"),
      svar: (el, e, S) => tell(S, el.dataset.v),
      angre(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || !r.spm) return;
        r.svar.pop();
        r.spm = r.svar.length;
        R.vis();
        R.toast("Ett spørsmål mindre");
      },
      "se-kortet"() {
        R.ark(`
          <h2 id="ark-tittel">Kortet ditt</h2>
          <p class="ingress">Bare for den som har hemmeligheten!</p>
          ${R.ui.mappe({ id: "kort", etikett: "Topphemmelig", tekst: "Hold fingeren på kortet for å se" })}
          <button class="knapp" data-h="lukk-ark">Ferdig</button>`);
      },
      gjettet: () => R.gaTil("hvem"),
      "tilbake-avhor": () => R.gaTil("avhor"),
      gjetter(el, e, S) {
        if (!S.spill || !S.spill.runde) return;
        avslutt(S, Number(el.dataset.v));
        dramatikk = false;
        R.gaTil("avsloring");
      },
      ingen(el, e, S) {
        if (!S.spill || !S.spill.runde) return;
        avslutt(S, -1);
        dramatikk = true;
        R.gaTil("avsloring");
      },
      async "gi-opp"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.runde) return;
        const fortsatt = R.vakt();
        const r = sp.runde;
        const ja = await R.bekreft("Gi opp?", `Hemmeligheten blir avslørt, og ${R.navn(holder(sp))} får 3 poeng.`, "Avslør den", "Spill videre");
        if (ja && fortsatt() && S.spill === sp && sp.runde === r) H.ingen(el, e, S);
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen og ser hvem som vant.", "Avslutt", "Spill videre");
        if (ja && fortsatt() && S.spill) R.gaTil("slutt");
      },

      // --- after the round ---
      "angre-poeng"(el, e, S) {
        const sp = S.spill;
        const l = sp && sp.logg.pop();
        if (!l) return;
        Object.keys(l.pluss).forEach((i) => (sp.poeng[i] -= l.pluss[i]));
        sp.runde = { h: l.h, sett: true, spm: l.spm, svar: l.svar || [], hint: l.hint || 0 };
        R.toast("Poengene er tatt tilbake");
        R.gaTil("avhor");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (ferdig(sp)) return R.gaTil("slutt");
        nyRunde(S);
        R.gaTil("gi");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
