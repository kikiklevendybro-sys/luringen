/* Vinglepetter — «Hva vil du helst?»
   A card split in two: option ☝️ (top, mint) or option ✌️ (bottom, lilac), «ELLER» on the seam.
   Count down, and everyone holds up one or two fingers at the same time. Optionally count the votes
   to see the split as an animated bar with a playful verdict, and a verdict for the group at the end. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.dilemmaer;
  const esc = R.esc;

  // All dilemmas in one list so the deck can remember what has been shown across sessions.
  const ALLE = [];
  D.pakker.forEach((p) => p.dilemmaer.forEach(([a, b]) => ALLE.push({ p: p.id, a, b })));
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const STANDARD = PAKKER.filter((p) => !p.voksen).map((p) => p.id);
  const stokk = R.kortstokk("dilemmaer", ALLE.length);
  let H; // the actions, so one action can reuse another
  let opptatt = false; // a countdown or drum roll is running: ignore double taps (ghost taps: the kit)

  const stor = (t) => t.charAt(0).toLocaleUpperCase("nb") + t.slice(1);
  const lengde = (t) => (t.length > 46 ? "vingle-lang" : t.length > 26 ? "vingle-mid" : "");
  const prosent = (n, t) => (t ? Math.round((n / t) * 100) : 0);
  const stemmer = (n) => R.flertall(n, "stemme", "stemmer");
  // A fixed pick for this card, so redrawing the screen never changes the text.
  const plukk = (liste, nokkel) => liste[R.hash(String(nokkel)) % liste.length];
  // A game is running until the verdict (then «Spill igjen» / «Endre oppsett» start a new one).
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  const PROMPTER = [
    "Forsvar valget ditt!",
    "Hvem valgte annerledes? Forklar!",
    "De som valgte ✌️, forklarer først!",
    "De som valgte ☝️, forklarer først!",
    "Noen som vil bytte side?",
    "Ingen vingling – stå for valget!",
    "Hvem var raskest til å velge?",
  ];

  // A playful one-line verdict for the split.
  function dom(a, b, nokkel) {
    const t = a + b;
    const min = Math.min(a, b);
    if (t === 1) return plukk(["Én stemme – og den bestemmer!", "Bare én har stemt. Det får holde!"], nokkel);
    if (min === 0) return plukk(["Enstemmig!", "Alle som én!", "Full enighet!"], nokkel);
    if (a === b) return plukk(["Delt på midten!", "Dødt løp!", "Helt likt – nå må dere diskutere!"], nokkel);
    if (min === 1) return plukk(["Bare én vinglepetter …", "Én mot resten – forsvar deg!", "En ensom ulv!"], nokkel);
    if (Math.abs(a - b) === 1) return plukk(["Knepent!", "På hengende håret!", "Jevnt løp!"], nokkel);
    if (Math.max(a, b) / t >= 0.75) return plukk(["Klart flertall!", "Ingen tvil her!"], nokkel);
    return plukk(["Flertallet har talt!", "Ganske delt!"], nokkel);
  }

  // The verdict for the whole group, from how big the majorities were on average.
  function gruppedom(logg) {
    const talte = logg.filter((l) => l.a + l.b >= 2);
    if (!talte.length) return null;
    const snitt = talte.reduce((s, l) => s + Math.max(l.a, l.b) / (l.a + l.b), 0) / talte.length;
    if (snitt >= 0.85) return { tittel: "Tvillingsjeler!", tekst: "Dere er enige om nesten alt. Er dere sikre på at dere ikke er samme person?" };
    if (snitt >= 0.72) return { tittel: "Godt samkjørte!", tekst: "Stort sett enige – med noen herlige vinglepettere innimellom." };
    if (snitt >= 0.6) return { tittel: "Passe uenige!", tekst: "Akkurat nok uenighet til at det ble gøy å diskutere." };
    return { tittel: "Ekte vinglepettere!", tekst: "Dere er uenige om nesten alt. Lykke til med å velge pizza!" };
  }

  function nyttKort(S) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    let i = stokk.neste((n) => valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste();
    sp.kort = i;
    sp.nr += 1;
    sp.fase = "les";
    sp.a = 0;
    sp.b = 0;
  }

  // The split card. Top half ☝️, bottom half ✌️, «eller» stamped on the seam.
  function kortet(S, o = {}) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const p = pakke(k.p);
    return `<div class="bunke vingle-bunke${o.kompakt ? " kompakt" : ""}">
      <article class="storkort vingle-kort"${o.sveip ? ` data-sveip="${o.sveip}"` : ""}>
        <div class="vingle-halv a">
          <div class="storkort-topp"><span class="storkort-etikett">${p.ikon} ${esc(p.navn)}</span><span class="storkort-nr">#${sp.nr}</span></div>
          <p class="vingle-sporsmal">Hva vil du helst …</p>
          <p class="vingle-valg ${lengde(k.a)}"><span class="vingle-merke" aria-hidden="true">☝️</span><span>${esc(stor(k.a))}</span></p>
        </div>
        <div class="vingle-eller"><span>eller</span></div>
        <div class="vingle-halv b">
          <p class="vingle-valg ${lengde(k.b)}"><span class="vingle-merke" aria-hidden="true">✌️</span><span>${esc(stor(k.b))}?</span></p>
        </div>
      </article>
    </div>`;
  }

  // What tells the options apart: drop the words both start with («at all musikken du hører, er …»);
  // the compact card right above still shows both options in full.
  function forskjell(a, b) {
    const x = a.split(" ");
    const y = b.split(" ");
    let n = 0;
    while (n < x.length - 1 && n < y.length - 1 && x[n] === y[n]) n++;
    return [stor(x.slice(n).join(" ")), stor(y.slice(n).join(" "))];
  }

  // Scroll so that what is under the dock comes into view (only when the page is taller than the screen).
  function visBunn() {
    const y = document.documentElement.scrollHeight - window.innerHeight;
    if (y > 0) window.scrollTo({ top: y, behavior: R.rolig() ? "auto" : "smooth" });
  }

  function tellere(S) {
    const sp = S.spill;
    const k = ALLE[sp.kort];
    const rad = (side, n, merke, tekst) => `
      <div class="vingle-teller ${side}">
        <span class="vingle-teller-merke" aria-hidden="true">${merke}</span>
        <span class="vingle-teller-tekst">${esc(tekst)}</span>
        ${R.ui.teller(`tell-${side}`, n, 0, 99, { id: `teller-${side}`, minus: `Én færre valgte ${side === "a" ? "én finger" : "to fingrer"}`, pluss: `Én til valgte ${side === "a" ? "én finger" : "to fingrer"}` })}
      </div>`;
    const [ta, tb] = forskjell(k.a, k.b);
    return `<div class="vingle-tellere">${rad("a", sp.a, "☝️", ta)}${rad("b", sp.b, "✌️", tb)}</div>`;
  }

  function fordeling(S) {
    const sp = S.spill;
    const { a, b } = sp;
    const t = a + b;
    const pa = prosent(a, t);
    const pb = 100 - pa;
    const del = (side, p) =>
      p > 0 ? `<span class="vingle-del ${side}${p < 20 ? " smal" : ""}" style="--andel: ${p}%">${p >= 20 ? `<b>${p} %</b>` : ""}</span>` : "";
    return `
      <div class="vingle-fordeling" role="img" aria-label="${stemmer(a)} for ☝️ (${pa} prosent) og ${stemmer(b)} for ✌️ (${pb} prosent)">
        <div class="vingle-stolpe">${del("a", pa)}${del("b", pb)}</div>
        <div class="vingle-stemmer" aria-hidden="true"><span>☝️ ${stemmer(a)}</span><span>${stemmer(b)} ✌️</span></div>
      </div>
      <div class="vingle-dom"><span class="stempel ${a > b ? "aksent" : b > a ? "vingle-b" : "lampe"}">${esc(dom(a, b, sp.kort))}</span></div>`;
  }

  // One dilemma from the log, with the votes, for the verdict screen.
  function loggBoks(etikett, l) {
    const k = ALLE[l.k];
    if (!k) return "";
    const linje = (merke, tekst, n, vant) =>
      `<li class="${vant ? "vant" : ""}"><span aria-hidden="true">${merke}</span><span>${esc(stor(tekst))}</span><b>${n}</b></li>`;
    return `<div class="papirboks vingle-boks">
      <p class="etikett">${esc(etikett)}</p>
      <ul class="${l.a === l.b ? "likt" : ""}">${linje("☝️", k.a, l.a, l.a > l.b)}${linje("✌️", k.b, l.b, l.b > l.a)}</ul>
    </div>`;
  }

  R.start({
    id: "vinglepetter",
    versjon: 1,
    pagar,

    tilstand: () => ({
      oppsett: { pakker: STANDARD.slice(), telle: true },
      spill: null,
    }),

    // Drop saved settings or games that no longer fit the content.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ pakker: [], telle: true }, S.oppsett));
      o.pakker = (Array.isArray(o.pakker) ? o.pakker : []).filter((id) => pakke(id));
      if (!o.pakker.length) o.pakker = STANDARD.slice();
      o.telle = o.telle !== false;
      const sp = S.spill;
      if (sp && !(ALLE[sp.kort] && Array.isArray(sp.pakker) && Array.isArray(sp.logg) && ["les", "valgt", "tell", "svar"].includes(sp.fase))) S.spill = null;
      if (!S.spill && ["kort", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "To valg – begge fristende, eller begge forferdelige. Alle må velge ett. Ingen vingling!",
      steg: [
        ["Les begge valgene", "Én leser høyt: «Hva vil du helst … eller …?»"],
        ["3 · 2 · 1 – Velg!", "Trykk på knappen. På «VELG!» holder alle opp én finger ☝️ eller to fingrer ✌️ – samtidig."],
        ["Se hvem som er enige", "Tell stemmene og se fordelingen. Mindretallet får forsvare seg!"],
      ],
      tips: [
        "Det finnes ingen riktige svar – bare gode begrunnelser.",
        "Skru av «Tell stemmer» hvis dere bare vil diskutere.",
        "Sveip kortet til siden for et nytt dilemma.",
        "Festpakken er for voksne og er ikke med før dere velger den.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "To valg. Begge fristende.<br><em>Du må velge ett!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · dilemma ${S.spill.nr}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–20", "spillere"],
              [String(ALLE.length), "dilemmaer"],
              ["0", "reklame"],
            ],
          }),
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const antall = PAKKER.filter((p) => o.pakker.includes(p.id)).reduce((s, p) => s + p.dilemmaer.length, 0);
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Velg pakker</h2><span class="tall">${antall} dilemmaer</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: `${p.tekst} · ${p.dilemmaer.length}`, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          ${R.ui.bryter("telle", o.telle, "Tell stemmer", "Tell hvor mange som valgte hva – og se om dere er enige.")}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !o.pakker.length }))}`;
        },
      },

      kort: {
        tittel: (S) => `Dilemma ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = ALLE[sp.kort];
          const avslutt = R.ui.lenke("Avslutt", "avslutt");
          const vhTittel = `<h1 class="vh" id="skjerm-tittel">Hva vil du helst: ${esc(k.a)}, eller ${esc(k.b)}?</h1>`;
          if (sp.fase === "tell") {
            return `
              ${vhTittel.replace(' id="skjerm-tittel"', "")}
              ${kortet(S, { kompakt: true })}
              <section class="seksjon vingle-telling">
                <div class="seksjon-hode"><h2 id="skjerm-tittel">Hvor mange valgte hva?</h2><span class="tall">${sp.a + sp.b} stemmer</span></div>
                ${tellere(S)}
              </section>
              ${R.ui.dokk(R.ui.knapp("Vis resultatet", "vis-svar", { av: sp.a + sp.b === 0 || opptatt }), R.ui.lenkerad(R.ui.lenke("Hopp over tellingen", "neste")))}`;
          }
          if (sp.fase === "svar") {
            return `
              ${vhTittel.replace(' id="skjerm-tittel"', "")}
              ${kortet(S, { kompakt: true, sveip: "neste" })}
              <section class="seksjon vingle-svar">
                <h2 class="vh" id="skjerm-tittel">Resultatet</h2>
                ${fordeling(S)}
              </section>
              ${R.ui.dokk(R.ui.knapp("Neste dilemma", "neste", { ikon: "👉" }), R.ui.lenkerad(avslutt))}`;
          }
          if (sp.fase === "valgt") {
            return `
              ${vhTittel}
              ${kortet(S, { sveip: "neste" })}
              <p class="vingle-prompt"><span aria-hidden="true">💬</span> ${esc(plukk(PROMPTER, sp.kort * 7 + sp.nr))}</p>
              ${R.ui.dokk(R.ui.knapp("Neste dilemma", "neste", { ikon: "👉" }), R.ui.lenkerad(avslutt))}`;
          }
          return `
            ${vhTittel}
            ${kortet(S, { sveip: "neste" })}
            <p class="vingle-hint">På «VELG!» holder alle opp <span class="vingle-hint-merke">☝️ én</span> eller <span class="vingle-hint-merke">✌️ to</span> fingrer</p>
            ${R.ui.dokk(
              R.ui.knapp("3 · 2 · 1 – Velg!", "velg", { variant: "stor" }),
              R.ui.lenkerad(R.ui.lenke("Hopp over", "neste"), avslutt),
            )}`;
        },
        inn() {
          R.holdVaken();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const logg = sp.logg;
          const g = gruppedom(logg) || { tittel: "Takk for nå!", tekst: "Tell stemmene fra flere spillere, så får dere en dom over gjengen." };
          const talte = logg.filter((l) => l.a + l.b >= 2);
          const enstemmige = talte.filter((l) => Math.min(l.a, l.b) === 0).length;
          const delte = talte.filter((l) => l.a === l.b).length;
          const jevnhet = (l) => Math.abs(l.a - l.b) / (l.a + l.b);
          const sortert = talte.slice().sort((x, y) => jevnhet(x) - jevnhet(y) || y.a + y.b - (x.a + x.b));
          const splittet = sortert.length && jevnhet(sortert[0]) < 1 ? sortert[0] : null;
          const enige = sortert.length ? sortert[sortert.length - 1] : null;
          const visEnige = enige && enige !== splittet && (!splittet || jevnhet(enige) > jevnhet(splittet));
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">Dommen over gjengen</p>
              <h1 id="skjerm-tittel">${esc(g.tittel)}</h1>
              <p class="ingress">${esc(g.tekst)}</p>
            </div>
            ${R.ui.merker([
              [String(logg.length), logg.length === 1 ? "dilemma" : "dilemmaer"],
              [String(enstemmige), enstemmige === 1 ? "enstemmig" : "enstemmige"],
              [String(delte), "delt på midten"],
            ])}
            ${splittet ? loggBoks("Mest uenige", splittet) : ""}
            ${visEnige ? loggBoks("Mest enige", enige) : ""}
            ${R.ui.flereSpill({ antall: logg.reduce((m, l) => Math.max(m, l.a + l.b), 0) || undefined })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          if (S.spill && S.spill.logg.length) {
            R.lyd.fanfare();
            R.konfetti(["--mynte", "--lilla", "--lampe", "--rosa"]);
          }
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) S.spill = null;
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
      telle(el, e, S) {
        S.oppsett.telle = !S.oppsett.telle;
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        S.spill = { pakker: S.oppsett.pakker.slice(), telle: S.oppsett.telle, nr: 0, kort: null, fase: "les", a: 0, b: 0, logg: [], ferdig: false };
        nyttKort(S);
        R.gaTil("kort");
      },
      // Next dilemma: from the card, after the result, or by swiping the card.
      async neste(el, e, S) {
        if (opptatt || !pagar(S)) return;
        const fortsatt = R.vakt();
        if (!(el && el.classList && el.classList.contains("storkort"))) await R.kastKort(-1);
        if (!fortsatt()) return;
        nyttKort(S);
        R.vis();
        window.scrollTo(0, 0);
        const k = ALLE[S.spill.kort];
        R.si(`Dilemma ${S.spill.nr}. Hva vil du helst: ${k.a}, eller ${k.b}?`);
      },
      async velg(el, e, S) {
        if (opptatt || !pagar(S) || S.spill.fase !== "les") return;
        opptatt = true;
        let ferdigTelt = false;
        try {
          ferdigTelt = await R.nedtelling(["3", "2", "1", "VELG!"], 650);
        } finally {
          opptatt = false;
        }
        if (!ferdigTelt) return;
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        const sp = S.spill;
        sp.fase = sp.telle ? "tell" : "valgt";
        sp.a = 0;
        sp.b = 0;
        R.vis();
        if (sp.fase === "tell") {
          R.si("Hvor mange valgte hva? Tell fingrene.");
          visBunn();
        }
      },
      "tell-a"(el, e, S) {
        S.spill.a = R.klamp(S.spill.a + Number(el.dataset.v), 0, 99);
        R.vis();
      },
      "tell-b"(el, e, S) {
        S.spill.b = R.klamp(S.spill.b + Number(el.dataset.v), 0, 99);
        R.vis();
      },
      async "vis-svar"(el, e, S) {
        const sp = S.spill;
        if (opptatt || !sp || sp.fase !== "tell" || sp.a + sp.b === 0) return;
        const fortsatt = R.vakt();
        opptatt = true;
        R.vis();
        const tid = R.rolig() ? 0.3 : 0.9;
        R.lyd.trommevirvel(tid);
        await R.vent(tid * 1000);
        opptatt = false;
        // Left the screen meanwhile: the votes are still there, nothing is logged.
        if (!fortsatt()) return;
        sp.fase = "svar";
        sp.logg.push({ k: sp.kort, a: sp.a, b: sp.b });
        if (sp.logg.length > 300) sp.logg.shift();
        R.vis();
        const t = sp.a + sp.b;
        if (t >= 2 && Math.min(sp.a, sp.b) === 0) {
          R.lyd.riktig();
          R.konfetti(sp.a ? ["--mynte", "--papir"] : ["--lilla", "--papir"]);
        } else if (Math.min(sp.a, sp.b) === 1 && t >= 3) R.lyd.latter();
        else R.lyd.pling();
        R.si(`${dom(sp.a, sp.b, sp.kort)} ${stemmer(sp.a)} for ☝️ og ${stemmer(sp.b)} for ✌️.`);
        window.scrollTo(0, 0);
        visBunn();
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if (S.spill && S.spill.logg.length) {
          // With counted votes the game ends with the verdict over the group (the sheet says so).
          const ja = await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen og får dommen over gjengen.", "Avslutt", "Fortsett");
          if (!ja || !fortsatt() || !pagar(S)) return;
          S.spill.ferdig = true;
          R.slippVaken();
          R.gaTil("slutt");
          return;
        }
        if ((await R.bekreft("Avslutte spillet?", "Dere kan alltid starte et nytt.", "Avslutt", "Fortsett")) && fortsatt()) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },
      igjen(el, e, S) {
        H.start(el, e, S);
      },
    }),
  });
})();
