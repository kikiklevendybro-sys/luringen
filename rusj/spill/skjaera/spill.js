/* Skjæra — Kim's game ("Kims lek").
   A board of things is shown for a few seconds. Then the magpie swoops across the screen and steals
   one or more of them; the board comes back with gaps (shuffled on the harder levels) and the player
   picks what is missing. As many guesses as stolen things. At the end the magpie flies back with
   whatever was not found.
   Alone: 12 levels × 3 rounds with stars, or «Hvor langt kommer du?» – the board grows by one thing
   for every clean round until three feathers are lost (a record to beat).
   Together: «Rop det ut!» (everyone watches the same board, first to shout it gets the point) or
   turns with a board each, where a tie at the top is settled with extra, harder boards.
   The board is drawn once per round; the phases (look → steal → find/shout → answer) change the DOM
   directly so the animations run undisturbed, and every phase is saved in S for reloads.
   The rules at the top are pure functions; test/skjaera.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit needed) ----------

  const D = window.RUSJ_DATA.ting;

  // Every thing in one list: { e: emoji, n: name, t: theme index }. The Christmas set comes last
  // (t = -1), so the numbers of the ordinary things never change in saved games. It has its own
  // names for pictures the ordinary themes also have («Reinsdyr», «Pepperkake»), and a board never
  // shows the same picture twice.
  const TING = [];
  D.temaer.forEach((tema, t) => tema.ting.forEach(([e, n]) => TING.push({ e, n, t })));
  const VANLIGE = TING.map((_, i) => i);
  const JUL = ((D.jul && D.jul.ting) || []).map(([e, n]) => TING.push({ e, n, t: -1 }) - 1);
  const AV_TEMA = D.temaer.map((_, t) => VANLIGE.filter((i) => TING[i].t === t));

  // ting: things on the board · kol: columns · sek: seconds to look · stjel: stolen · valg: options
  // temaer: how many themes the board mixes · stokk: the rest is shuffled
  // lett: the wrong options come from other themes than the board (later: from the same themes)
  const NIVAER = [
    { ting: 4, kol: 2, sek: 6, stjel: 1, valg: 4, temaer: 4, lett: true },
    { ting: 6, kol: 3, sek: 6, stjel: 1, valg: 4, temaer: 6, lett: true },
    { ting: 6, kol: 3, sek: 5, stjel: 1, valg: 5, temaer: 3 },
    { ting: 8, kol: 4, sek: 7, stjel: 1, valg: 5, temaer: 4 },
    { ting: 9, kol: 3, sek: 7, stjel: 2, valg: 5, temaer: 3 },
    { ting: 9, kol: 3, sek: 6, stjel: 1, valg: 5, temaer: 3, stokk: true },
    { ting: 12, kol: 4, sek: 8, stjel: 2, valg: 6, temaer: 3 },
    { ting: 12, kol: 4, sek: 7, stjel: 2, valg: 6, temaer: 3, stokk: true },
    { ting: 12, kol: 4, sek: 7, stjel: 3, valg: 6, temaer: 2 },
    { ting: 16, kol: 4, sek: 9, stjel: 2, valg: 6, temaer: 2, stokk: true },
    { ting: 16, kol: 4, sek: 8, stjel: 3, valg: 6, temaer: 2, stokk: true },
    { ting: 20, kol: 4, sek: 9, stjel: 3, valg: 6, temaer: 2, stokk: true },
  ];

  // «Hvor langt kommer du?»: a board of n things. Two are stolen from 9 things, the rest is
  // shuffled from 12, three are stolen from 16. The run ends after three misses, or with a clean
  // board of 30.
  const LANGT_START = 4;
  const LANGT_MAKS = 30;
  const FJAER = 3;
  const langtSpes = (n) => ({
    ting: n,
    sek: Math.min(12, 5 + Math.floor(n / 4)),
    stjel: n >= 16 ? 3 : n >= 9 ? 2 : 1,
    valg: n >= 12 ? 6 : n >= 6 ? 5 : 4,
    temaer: n <= 6 ? n : n <= 8 ? 4 : n >= 25 ? 3 : n >= 16 ? 2 : 3,
    stokk: n >= 12,
    lett: n < 6,
  });

  function stokk(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // One board. N: a level or langtSpes(n). o: { niva | e (stored on the board), jul (Christmas set) }.
  // Every wrong option is a thing that was never on the board: an option still lying there in
  // plain sight fooled nobody.
  function lagRunde(N, rng, o = {}) {
    const bland = (l) => stokk(l, rng);
    const jul = !!o.jul && JUL.length >= 12;
    let brett = [];
    if (jul) brett = bland(JUL).slice(0, N.ting);
    else {
      const temaer = bland(D.temaer.map((_, t) => t)).slice(0, N.temaer);
      const per = Math.ceil(N.ting / temaer.length);
      for (const t of temaer) brett.push(...bland(AV_TEMA[t]).slice(0, per));
      brett = bland(brett).slice(0, N.ting);
    }
    const bilder = new Set(brett.map((x) => TING[x].e));
    // (a set smaller than the board – never with today's data – is filled up with other things)
    for (const x of bland(VANLIGE)) {
      if (brett.length >= N.ting) break;
      if (bilder.has(TING[x].e)) continue;
      bilder.add(TING[x].e);
      brett.push(x);
    }
    const stjalet = bland(brett.map((_, p) => p)).slice(0, N.stjel);
    const tatt = stjalet.map((p) => brett[p]);
    const ledig = (i) => !bilder.has(TING[i].e);
    let kilde;
    if (jul) {
      const fraJul = bland(JUL.filter(ledig));
      const andre = bland(VANLIGE.filter(ledig));
      kilde = N.lett ? [...andre, ...fraJul] : [...fraJul, ...andre];
    } else {
      // On the easy boards from other themes, later from the same themes as what was stolen.
      const ledige = VANLIGE.filter(ledig);
      const samme = bland(ledige.filter((i) => tatt.some((s) => TING[s].t === TING[i].t)));
      const andre = bland(ledige.filter((i) => !samme.includes(i) && !brett.some((b) => TING[b].t === TING[i].t)));
      const resten = bland(ledige.filter((i) => !samme.includes(i) && !andre.includes(i)));
      kilde = N.lett ? [...andre, ...resten] : [...samme, ...andre, ...resten];
    }
    const lokke = [];
    for (const i of kilde) {
      if (lokke.length >= N.valg - N.stjel) break;
      if (bilder.has(TING[i].e)) continue;
      bilder.add(TING[i].e);
      lokke.push(i);
    }
    let plass;
    if (N.stokk) {
      const rest = bland(brett.filter((_, p) => !stjalet.includes(p)));
      plass = bland([...rest, ...stjalet.map(() => -1)]);
    } else plass = brett.map((x, p) => (stjalet.includes(p) ? -1 : x));
    const b = { brett, stjalet, plass, valg: bland([...tatt, ...lokke]), gjett: [], fase: "se" };
    if (o.e) b.e = N.ting;
    else b.niva = o.niva || 0;
    return b;
  }

  // The players with the most points (all of them, or only those in `blant`).
  function ledere(poeng, blant) {
    const med = blant || poeng.map((_, i) => i);
    const best = Math.max(...med.map((i) => poeng[i]));
    return med.filter((i) => poeng[i] === best);
  }

  // The Christmas set is offered from 1 November to 6 January. dag: "2026-12-24".
  function erJul(dag) {
    const [, m, d] = String(dag).split("-").map(Number);
    return m === 11 || m === 12 || (m === 1 && d <= 6);
  }

  const R = window.Rusj;
  if (!R) {
    window.Skjaera = { TING, VANLIGE, JUL, NIVAER, LANGT_START, LANGT_MAKS, FJAER, langtSpes, lagRunde, ledere, erJul };
    return;
  }

  // ---------- The game ----------

  const G = window.RusjGjengen;
  const esc = R.esc;
  const TINTER = ["#ffd6e4", "#d4efff", "#d9f6cf", "#fff0bd", "#e6d9ff", "#ffdcc7", "#cbf6e8", "#f5d6ff", "#dae2ff", "#ffe4dc", "#e2f7c4", "#ffe9a8"];
  const tint = (x) => TINTER[(x * 7) % TINTER.length];

  const RUNDER_SOLO = 3;
  const START = { lett: 0, middels: 3, vanskelig: 6 };
  const OMKAMPER = 3; // at most three tie-break rounds; after that the win is shared
  // The level map: the first level of every row is open from the start.
  const RADER = [
    ["Små", 0, 3],
    ["Større", 3, 6],
    ["Proff", 6, 12],
  ];
  const APNE = RADER.map((r) => r[1]);
  const DEL_URL = "https://rusj.no/skjaera/";

  let H; // actions
  let opptatt = false; // an animation is running; taps wait
  let nyttBrett = false; // pop the things in on the next draw

  // ---------- Rounds ----------

  const spes = (b) => (b.e ? langtSpes(b.e) : NIVAER[b.niva]);
  const julPa = (S) => !!(S.oppsett.jul && JUL.length && erJul(R.dag().tekst));
  const nyRunde = (S, o) => lagRunde(o.e ? langtSpes(o.e) : NIVAER[o.niva], R.rng(R.nyttFro()), { ...o, jul: julPa(S) });

  const tatte = (b) => b.stjalet.map((p) => b.brett[p]);
  const funnet = (b) => b.gjett.filter((x) => tatte(b).includes(x));
  const altFunnet = (b) => funnet(b).length === b.stjalet.length;
  const erAlene = (sp) => !!sp && (sp.modus === "solo" || sp.modus === "langt");
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  // What the board looks like now: gaps filled in the order things were found.
  function visning(b) {
    if (b.fase === "svar") return b.brett.slice();
    const v = b.plass.slice();
    for (const x of funnet(b)) {
      const p = spes(b).stokk ? v.indexOf(-1) : b.brett.indexOf(x);
      if (p >= 0) v[p] = x;
    }
    return v;
  }

  // Together: a little harder for every round; a tie-break jumps two levels at a time.
  function nivaForRunde(sp) {
    const topp = NIVAER.length - 1;
    if (sp.modus === "solo") return sp.niva;
    if (sp.modus === "rop") return Math.min(topp, sp.start + Math.floor(sp.runde / 2));
    return Math.min(topp, sp.omkamp ? sp.start + sp.runder - 1 + 2 * sp.omkamp : sp.start + sp.runde);
  }

  // ---------- Markup ----------

  const medFokus = (html) => html.replace("<button ", "<button data-fokus ");

  function tingHtml(x, klasse, n, ekstraHtml, etikett) {
    return `<span class="skj-ting ${klasse || ""}" data-ting="${x}" role="img" aria-label="${esc(etikett || TING[x].n)}" style="--tint:${tint(x)}; --n:${n || 0}">${esc(TING[x].e)}${ekstraHtml || ""}</span>`;
  }
  function ruteHtml(p, x, o = {}) {
    if (x < 0) return `<div class="skj-rute tom" data-pos="${p}"><span class="skj-hull" aria-hidden="true">?</span><span class="vh">Tom plass</span></div>`;
    const m = o.merk ? o.merk(x) : {};
    return `<div class="skj-rute" data-pos="${p}">${tingHtml(x, m.klasse || "", p, m.html, m.etikett)}</div>`;
  }
  // After the answer: things you found get a green tick. Things the magpie got away with are shown
  // where they were – a gold ring, the magpie and «Her var den!» – never a cross: they weren't wrong.
  function brettHtml(b, layout) {
    const st = tatte(b);
    const plass = layout.length <= 12;
    const merk =
      b.fase === "svar"
        ? (x) =>
            !st.includes(x)
              ? {}
              : b.gjett.includes(x)
                ? { klasse: "var-tatt funnet", etikett: `${TING[x].n} – du fant den` }
                : {
                    klasse: "var-tatt her",
                    etikett: `${TING[x].n} – her var den`,
                    html: `<span class="skj-merke" aria-hidden="true">${G.svg("skjaera")}</span>${plass ? '<span class="skj-her" aria-hidden="true">Her var den!</span>' : ""}`,
                  }
        : null;
    return layout.map((x, p) => ruteHtml(p, x, { merk })).join("");
  }

  function lukerHtml(b) {
    const st = tatte(b);
    return `<div class="skj-luker" role="group" aria-label="Forsøk">${b.stjalet
      .map((_, n) => {
        const x = b.gjett[n];
        if (x == null) return `<span class="skj-luke" role="img" aria-label="Forsøk ${n + 1}: ikke brukt">?</span>`;
        const rett = st.includes(x);
        return `<span class="skj-luke ${rett ? "rett" : "feil"}" role="img" aria-label="${esc(TING[x].n)}: ${rett ? "riktig" : "feil"}">${esc(TING[x].e)}</span>`;
      })
      .join("")}</div>`;
  }

  // «Dette tok skjæra»: the stolen things by name (the shout-out mode has no guesses to show).
  const tokHtml = (b) => `<p class="skj-tok">${tatte(b).map((x) => `<span><i aria-hidden="true">${esc(TING[x].e)}</i> ${esc(TING[x].n)}</span>`).join("")}</p>`;

  const fjaerHtml = (igjen, mistet) =>
    `<span class="skj-fjaer" role="img" aria-label="${igjen} av ${FJAER} fjær igjen">${Array.from({ length: FJAER }, (_, i) => `<i class="${i < igjen ? "" : i === igjen && mistet ? "brukt mistet" : "brukt"}">🪶</i>`).join("")}</span>`;

  // The score of the shout-out mode: everyone in one row. A point that is chosen but not yet
  // counted shows as «+1».
  function poengradHtml(sp) {
    const valgt = sp.b.fase === "svar" ? sp.b.hvem : null;
    return `<ul class="skj-poengrad" aria-label="Poeng">${sp.poeng
      .map((p, i) => `<li class="${valgt === i ? "valgt" : ""}">${R.avatar(i)}<span class="vh">${esc(R.navn(i))}:</span><b>${p}</b>${valgt === i ? "<em>+1</em>" : ""}</li>`)
      .join("")}</ul>`;
  }

  // The line over the heading: whose turn it is, the feathers and the record, or the score.
  function statusHtml(S) {
    const sp = S.spill;
    if (sp.modus === "flere") return `<p class="skj-hvem">${R.avatar(sp.tur)}<span>${esc(R.navn(sp.tur))}</span></p>`;
    if (sp.modus === "rop") return poengradHtml(sp);
    if (sp.modus === "langt") {
      const mistet = sp.b.fase === "svar" && !altFunnet(sp.b);
      return `<p class="skj-status">${fjaerHtml(sp.fjaer, mistet)}<span class="skj-status-rek"><small>Rekord</small> <b>${S.langt.rekord ? S.langt.rekord : "–"}</b></span></p>`;
    }
    return "";
  }

  function tittelFor(sp, b) {
    const k = b.stjalet.length;
    if (b.fase === "se") return "Se godt!";
    if (b.fase === "finn" || b.fase === "rop") return "Hva tok skjæra?";
    if (sp.modus === "rop") return "Dette tok skjæra!";
    const fant = funnet(b).length;
    if (fant === k) return k === 1 ? "Riktig!" : "Du fant alt!";
    return fant ? `${fant} av ${k} riktig!` : "Skjæra lurte deg!";
  }

  function hodeHtml(S) {
    const sp = S.spill;
    const b = sp.b;
    const rop = sp.modus === "rop";
    const ikon = b.fase === "se" ? "👀" : b.fase === "finn" ? "🔍" : b.fase === "rop" ? "📣" : rop || !altFunnet(b) ? SKJAERA_IKON : "⭐";
    const under = b.fase === "se" ? `<div class="skj-tid" aria-hidden="true"><i></i></div>` : b.fase === "rop" ? `<p class="skj-rop">Rop det ut!</p>` : rop ? tokHtml(b) : lukerHtml(b);
    return `<div class="skj-hode">
      ${statusHtml(S)}
      <h1 id="skjerm-tittel" class="skj-tittel"><span class="skj-ikon" aria-hidden="true">${ikon}</span><span class="skj-tekst">${esc(tittelFor(sp, b))}</span></h1>
      <div class="skj-under">${under}</div>
    </div>`;
  }

  const kolonner = (n) => (n <= 4 ? 2 : 3);
  // «Hvem ropte det først?»: up to five names in a row, more in two rows – or, on a short screen,
  // everyone in one row with only the avatar (the names are still there for screen readers).
  const hvemTett = (antall) => antall + 1 > 5 && window.innerHeight < 700;
  const hvemKolonner = (antall) => (antall + 1 <= 5 || hvemTett(antall) ? antall + 1 : Math.ceil((antall + 1) / 2));
  // Height of what lies under the thumb (smaller buttons on short phones, see spill.css). The dock
  // keeps the height of its tallest phase, so the board never jumps.
  function dokkHoyde(sp, N) {
    const lav = window.innerHeight < 700;
    const knapp = window.innerHeight <= 700 ? 54 : 64; // the kit's button and link on a short screen
    const lenke = window.innerHeight <= 700 ? 38 : 44;
    if (sp.modus === "rop") {
      // «Hvem ropte det først?», the names, «Neste brett» and «Avslutt»
      const rader = Math.ceil((sp.antall + 1) / hvemKolonner(sp.antall));
      return 20 + rader * (hvemTett(sp.antall) ? 44 : lav ? 68 : 74) + (rader - 1) * 8 + knapp + lenke + 30;
    }
    const rader = Math.ceil(N.valg / kolonner(N.valg));
    const valg = rader * (lav ? 64 : 78) + (rader - 1) * 10;
    // «Hvor langt kommer du?» has «Avslutt» under the button after the answer: room for that too.
    return sp.modus === "langt" ? Math.max(valg, (N.stjel > 1 ? 81 : 59) + knapp + lenke + 20) : valg;
  }

  function valgHtml(b) {
    const k = kolonner(b.valg.length);
    const st = tatte(b);
    const forste = b.valg.find((x) => !b.gjett.includes(x));
    return `<div class="skj-valg-rad" style="--k:${k}" role="group" aria-label="Hva mangler?">${b.valg
      .map((x) => {
        const gjettet = b.gjett.includes(x);
        const klasse = gjettet ? (st.includes(x) ? " rett" : " feil") : "";
        return `<button class="skj-valg${klasse}" data-h="gjett" data-v="${x}" data-stille${x === forste ? " data-fokus" : ""}${gjettet ? " disabled" : ""}><span class="skj-valg-e" aria-hidden="true">${esc(TING[x].e)}</span><span class="skj-valg-n">${esc(TING[x].n)}</span></button>`;
      })
      .join("")}</div>`;
  }

  // The shout-out mode after the answer: who shouted it first? The point is counted when the next
  // board is dealt, so a wrong tap is corrected by tapping someone else.
  function hvemHtml(sp) {
    const b = sp.b;
    const brikke = (i, innhold) => `<button class="skj-hvem-valg" data-h="hvem" data-v="${i}" data-stille aria-pressed="${b.hvem === i}">${innhold}</button>`;
    const vinner = b.hvem >= 0 && sp.poeng[b.hvem] + 1 >= sp.mal;
    const navn = hvemTett(sp.antall) ? ' class="vh"' : "";
    return `<p class="skj-hvem-sporsmal" id="skj-hvem-sporsmal">Hvem ropte det først?</p>
      <div class="skj-hvem-rad${hvemTett(sp.antall) ? " tett" : ""}" style="--k:${hvemKolonner(sp.antall)}" role="group" aria-labelledby="skj-hvem-sporsmal">${sp.poeng
        .map((_, i) => brikke(i, `${R.avatar(i)}<span${navn}>${esc(R.navn(i))}</span>`))
        .join("")}${brikke(-1, `<span class="skj-ingen" aria-hidden="true">🤷</span><span${navn}>Ingen</span>`)}</div>
      ${medFokus(R.ui.knapp(vinner ? "Se vinneren" : "Neste brett", "neste", { av: b.hvem == null }))}
      ${R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt"))}`;
  }

  // Is the board that was just answered the last one before the result?
  const langtSlutt = (sp) => sp.fjaer <= 0 || (altFunnet(sp.b) && sp.b.brett.length >= LANGT_MAKS);

  function svarHtml(S) {
    const sp = S.spill;
    const b = sp.b;
    if (sp.modus === "rop") return hvemHtml(sp);
    const fant = funnet(b).length;
    const k = b.stjalet.length;
    const tekst = `Skjæra tok: ${tatte(b).map((x) => `${TING[x].e} ${TING[x].n}`).join(" · ")}`;
    let knapp;
    let poeng;
    let lenker = "";
    if (sp.modus === "solo") {
      knapp = R.ui.knapp(sp.runde + 1 < RUNDER_SOLO ? "Neste runde" : "Se stjernene", "neste");
      poeng = fant === k ? `<b class="skj-pluss stjerne">+1 ⭐</b>` : "";
    } else if (sp.modus === "langt") {
      const slutt = langtSlutt(sp);
      knapp = R.ui.knapp(slutt ? "Se resultatet" : "Neste brett", "neste");
      poeng =
        fant === k
          ? `<b class="skj-pluss">${b.brett.length >= LANGT_MAKS ? "Alle 30 – du klarte alt!" : `Klart! Neste: ${b.brett.length + 1} ting`}</b>`
          : `<b class="skj-pluss null">${sp.fjaer > 0 ? `Skjæra tok en fjær – ${R.flertall(sp.fjaer, "fjær", "fjær")} igjen` : "Skjæra tok den siste fjæra"}</b>`;
      if (!slutt) lenker = R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt"));
    } else {
      const sisteTur = sp.koNr + 1 >= sp.ko.length;
      const sisteRunde = !!sp.omkamp || sp.runde + 1 >= sp.runder;
      if (!sisteTur) knapp = R.ui.knapp(`Neste: ${R.navn(sp.ko[sp.koNr + 1])}`, "neste");
      else knapp = R.ui.knapp(sisteRunde && (ledere(sp.poeng).length === 1 || sp.omkamp >= OMKAMPER) ? "Se vinneren" : "Se stillingen", "neste");
      poeng = `<b class="skj-pluss${fant ? "" : " null"}">${fant ? `+${fant} poeng` : "0 poeng"}</b>`;
    }
    return `<div class="skj-svar"><p>${poeng}<span>${esc(tekst)}</span></p></div>${medFokus(knapp)}${lenker}`;
  }

  function dokkInnhold(S) {
    const sp = S.spill;
    const b = sp.b;
    if (b.fase === "se") return medFokus(R.ui.knapp(sp.modus === "rop" ? "Vi er klare!" : "Jeg er klar!", "klar"));
    if (b.fase === "finn") return valgHtml(b);
    if (b.fase === "rop") return `<p class="skj-rop-hjelp">Den som først roper ${b.stjalet.length === 1 ? "hva som mangler" : "alt som mangler"}, får poenget.</p>${medFokus(R.ui.knapp("Vis hva skjæra tok", "vis"))}`;
    return svarHtml(S);
  }

  // ---------- Small DOM helpers ----------

  const rute = (p) => R.$(`.skj-rute[data-pos="${p}"]`);
  function settHode(S) {
    const h = R.$(".skj-hode");
    if (!h) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = hodeHtml(S);
    h.replaceWith(tmp.firstElementChild);
  }
  function settTittel(ikon, tekst) {
    const t = R.$(".skj-tittel");
    if (!t) return;
    t.querySelector(".skj-ikon").innerHTML = ikon;
    t.querySelector(".skj-tekst").textContent = tekst;
    if (!R.rolig()) {
      t.classList.remove("ny");
      void t.offsetWidth;
      t.classList.add("ny");
    }
  }
  // New content under the thumb. If the button that was pressed went away with the old content,
  // focus moves to the natural next control (keyboards and screen readers keep their place).
  function settDokk(html) {
    const d = R.$(".skj-dokk");
    if (!d) return;
    const aktiv = document.activeElement;
    const mistet = !aktiv || aktiv === document.body || d.contains(aktiv) || !document.contains(aktiv);
    d.innerHTML = html;
    if (mistet) {
      const neste = d.querySelector("[data-fokus]:not(:disabled)");
      if (neste) neste.focus({ preventScroll: true });
    }
  }

  // Board size: fits the screen together with the options under the thumb (the dock keeps the
  // same height in every phase, so the board never jumps). The number of columns is the one that
  // gives the biggest things: the level's own when it fits, more on a low screen. A full last row
  // is worth a little, a last row with a single thing costs a lot.
  function tilpass() {
    const brett = R.$(".skj-brett");
    const bord = R.$(".skj-bord");
    if (!brett || !bord) return;
    const n = Number(brett.dataset.n);
    const onsket = Number(brett.dataset.kol) || 0;
    const gap = n >= 16 ? 8 : 10;
    const dokk = R.$(".skj-dokk");
    const side = R.liggende() === "side";
    // (On a phone on its side the kit puts the dock in a column beside the board: nothing to keep free under it.)
    const reserve = side ? 18 : (dokk ? parseFloat(dokk.style.minHeight) || 180 : 180) + 26 + 16 + 14;
    const topp = bord.getBoundingClientRect().top + window.scrollY;
    const hoyde = window.innerHeight - topp - reserve;
    const bredde = bord.clientWidth;
    let best = null;
    for (let k = n <= 4 ? 2 : 3; k <= Math.min(n, 10); k++) {
      const rader = Math.ceil(n / k);
      const fraBredde = (bredde - gap * (k - 1)) / k;
      const b = Math.min(fraBredde, (hoyde - gap * (rader - 1)) / rader, 124);
      const sist = n - (rader - 1) * k;
      const poeng = b * (k === onsket ? 1.15 : 1) * (sist === k ? 1.08 : sist === 1 ? 0.72 : 1);
      if (!best || poeng > best.poeng + 0.01) best = { k, b, poeng, fraBredde };
    }
    // (a little smaller at the least on its side, so a big board still fits a 360 px high screen;
    // never wider than the screen)
    const b = Math.floor(Math.max(Math.min(side ? 36 : 46, best.fraBredde), best.b));
    brett.style.setProperty("--kol", best.k);
    brett.style.setProperty("--rb", b + "px");
    brett.style.setProperty("--gap", gap + "px");
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "brett") tilpass();
  });

  // Where everything is now, so it can glide to where it ends up (FLIP).
  function posisjoner() {
    const m = new Map();
    R.$$(".skj-brett .skj-ting").forEach((el) => m.set(el.dataset.ting, el.getBoundingClientRect()));
    return m;
  }
  function glidFra(gml, ms) {
    if (R.rolig()) return;
    R.$$(".skj-brett .skj-ting").forEach((el, n) => {
      const a = gml.get(el.dataset.ting);
      if (!a || !el.animate) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(${n % 2 ? 14 : -14}deg) scale(1.08)` }, { transform: "none" }], {
        duration: (ms || 620) + (n % 5) * 60,
        easing: "cubic-bezier(.3,1.25,.5,1)",
      });
    });
  }

  // ---------- The magpie ----------

  const HODE = G.svg("skjaera").replace("<svg ", '<svg x="52" y="24" width="96" height="96" ');
  // A magpie wing: royal blue with a lighter sheen, a white patch and three feather tips.
  const VINGE =
    '<path d="M86 74C72 48 48 24 10 8C16 22 22 31 30 37C18 37 10 41 3 46C17 52 29 56 40 58C30 62 23 68 19 75C35 77 49 81 61 87C69 90 77 92 86 93Z" fill="#2f4ea8" stroke="#170e2b" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M80 72C66 50 46 30 16 14C32 27 50 45 64 66Z" fill="#5a86ea"/>' +
    '<ellipse cx="35" cy="46" rx="13" ry="5" transform="rotate(-30 35 46)" fill="#fff1dd"/>' +
    '<path d="M12 11L24 26M6 46L22 49M21 74L36 71" stroke="#8fd3ff" stroke-width="2.6" stroke-linecap="round"/>';
  const FUGL = `<svg class="skj-fugl-svg" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      <g class="skj-hale"><path d="M78 100L14 136C6 140 1 130 8 126L71 87Z" fill="#2a6f7d" stroke="#170e2b" stroke-width="4" stroke-linejoin="round"/><path d="M67 97L18 126" stroke="#3de3b0" stroke-width="3.2" stroke-linecap="round"/></g>
      <g class="skj-vinge v">${VINGE}</g>
      <g class="skj-vinge h"><g transform="translate(200 0) scale(-1 1)">${VINGE}</g></g>
      ${HODE}
    </svg>`;
  const SKJAERA_IKON = `<span class="skj-ikon-figur">${G.svg("skjaera")}</span>`;

  function himmel() {
    let h = R.$("#skj-himmel");
    if (!h) {
      h = document.createElement("div");
      h.id = "skj-himmel";
      h.className = "skj-himmel";
      h.setAttribute("aria-hidden", "true");
      document.body.appendChild(h);
    }
    return h;
  }
  function tomHimmel() {
    const h = R.$("#skj-himmel");
    if (h) h.innerHTML = "";
  }

  // The magpie's chatter: a quick rattle.
  function skratt() {
    for (let n = 0; n < 6; n++) {
      R.lyd.stoy(n * 0.08, 0.055, 0.2, 2500 + (n % 2) * 800);
      R.lyd.tone(1450 - n * 50, n * 0.08, 0.05, "square", 0.03, 950);
    }
  }

  // Fly through the targets [{ x, y, ved(fugl) }] (viewport px). retning 1 = to the right.
  function fly(mal, o = {}) {
    const fortsatt = R.vakt();
    // A target is only touched if the round is still on screen when the magpie gets there.
    mal = mal.map((m) => ({ ...m, ved: m.ved && ((fugl) => fortsatt() && m.ved(fugl)) }));
    return new Promise((ferdig) => {
      const lag = himmel();
      const fugl = document.createElement("div");
      fugl.className = "skj-fugl" + (o.retning < 0 ? " venstre" : "");
      fugl.innerHTML = `<span class="skj-kropp">${FUGL}</span><span class="skj-bytte">${o.bytte || ""}</span>`;
      lag.appendChild(fugl);
      const bw = fugl.offsetWidth;
      const bh = fugl.offsetHeight;
      const ank = { x: bw * 0.5, y: bh * 0.82 };
      const W = window.innerWidth;
      const hoyre = o.retning !== -1;
      if (R.rolig() || !fugl.animate) {
        // No flying (reduced motion, or a browser without the animation API): the magpie appears,
        // does its thing, and leaves.
        fugl.style.transform = `translate(${W / 2 - ank.x}px, ${Math.max(10, (mal[0] ? mal[0].y : 200) - bh * 1.6)}px)`;
        mal.forEach((m, n) => setTimeout(() => m.ved && m.ved(fugl), 250 + n * 250));
        setTimeout(
          () => {
            fugl.remove();
            ferdig();
          },
          600 + mal.length * 250,
        );
        return;
      }
      const forste = mal[0] || { y: window.innerHeight / 3 };
      const punkter = [
        { x: hoyre ? -bw : W + bw, y: Math.max(bh, forste.y - 170) },
        ...mal,
        { x: hoyre ? W + bw * 1.3 : -bw * 1.3, y: -bh * 1.2 },
      ];
      const kf = [];
      let t = 0;
      for (let n = 0; n < punkter.length - 1; n++) {
        const a = punkter[n];
        const b = punkter[n + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const varighet = 230 + len * 0.7;
        const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - len * 0.2 };
        const steg = 10;
        for (let s = n === 0 ? 0 : 1; s <= steg; s++) {
          const u = s / steg;
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          kf.push({
            x: (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * c.x + e * e * b.x,
            y: (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * c.y + e * e * b.y,
            t: t + u * varighet,
          });
        }
        t += varighet;
        if (b.ved) {
          const vedTid = t;
          setTimeout(() => b.ved(fugl), vedTid);
          t += 170;
          kf.push({ x: b.x, y: b.y + 6, t });
        }
      }
      const total = t;
      const rammer = kf.map((k, n) => {
        const neste = kf[Math.min(n + 1, kf.length - 1)];
        const forrige = kf[Math.max(n - 1, 0)];
        const dx = neste.x - forrige.x;
        const dy = neste.y - forrige.y;
        const rot = R.klamp((Math.atan2(dy, Math.abs(dx) + 0.001) * 180) / Math.PI, -24, 24) * 0.7 * (hoyre ? 1 : -1);
        return { transform: `translate(${(k.x - ank.x).toFixed(1)}px, ${(k.y - ank.y).toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`, offset: k.t / total };
      });
      const anim = fugl.animate(rammer, { duration: total, easing: "linear", fill: "forwards" });
      anim.onfinish = () => {
        fugl.remove();
        ferdig();
      };
    });
  }

  // ---------- Phases ----------

  let seLoop = null;
  function startSe(S) {
    const fortsatt = R.vakt();
    const b = S.spill.b;
    const N = spes(b);
    const forsinkelse = R.rolig() ? 150 : 350 + N.ting * 45;
    setTimeout(() => {
      if (!fortsatt() || S.spill.b !== b || b.fase !== "se") return;
      const start = performance.now();
      const ms = N.sek * 1000;
      const bar = R.$(".skj-tid i");
      let sistSek = Math.ceil(ms / 1000);
      const steg = (na) => {
        if (!fortsatt() || b.fase !== "se" || opptatt) return;
        const andel = Math.max(0, 1 - (na - start) / ms);
        if (bar) bar.style.transform = `scaleX(${andel.toFixed(4)})`;
        const sek = Math.ceil((andel * ms) / 1000);
        if (sek !== sistSek) {
          sistSek = sek;
          if (sek > 0 && sek <= 3) R.lyd.tikk();
        }
        if (andel <= 0) {
          stjel(S);
          return;
        }
        seLoop = requestAnimationFrame(steg);
      };
      seLoop = requestAnimationFrame(steg);
    }, forsinkelse);
  }

  async function stjel(S) {
    const sp = S.spill;
    const b = sp.b;
    if (b.fase !== "se" || opptatt) return;
    opptatt = true;
    const fortsatt = R.vakt();
    cancelAnimationFrame(seLoop);
    const N = spes(b);
    settDokk(`<p class="skj-pst">Pssst … her kommer noen!</p>`);
    settTittel(SKJAERA_IKON, "Skjæra kommer!");
    R.$(".skj-under").innerHTML = "";
    R.$(".skj-brett").classList.remove("inn");
    R.si("Skjæra kommer!");
    skratt();
    R.vibrer(30);
    await R.vent(R.rolig() ? 150 : 450);
    if (!fortsatt()) return;
    const mal = b.stjalet
      .map((p) => {
        const r = rute(p).getBoundingClientRect();
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          ved: (fugl) => {
            const el = rute(p);
            const t = el && el.querySelector(".skj-ting");
            if (t) {
              t.classList.add("tatt");
              setTimeout(() => {
                if (fortsatt()) el.outerHTML = ruteHtml(p, -1);
              }, R.rolig() ? 0 : 260);
            }
            const pose = fugl.querySelector(".skj-bytte");
            pose.insertAdjacentHTML("beforeend", `<span>${esc(TING[b.brett[p]].e)}</span>`);
            R.lyd.pop();
            R.vibrer(15);
          },
        };
      })
      .sort((a, c) => a.x - c.x);
    R.lyd.sveip();
    await fly(mal, { retning: 1 });
    if (!fortsatt()) return;
    if (N.stokk) {
      settTittel("🌀", "Skjæra rotet til!");
      R.si("Skjæra rotet til alt!");
      await R.vent(R.rolig() ? 100 : 350);
      if (!fortsatt()) return;
      const gml = posisjoner();
      R.$(".skj-brett").innerHTML = b.plass.map((x, p) => ruteHtml(p, x)).join("");
      glidFra(gml, 680);
      R.lyd.sveip();
      setTimeout(() => R.lyd.sveip(), 180);
      await R.vent(R.rolig() ? 200 : 1000);
      if (!fortsatt()) return;
    }
    b.fase = sp.modus === "rop" ? "rop" : "finn";
    R.lagre();
    opptatt = false;
    settHode(S);
    settDokk(dokkInnhold(S));
    R.si(sp.modus === "rop" ? "Hva tok skjæra? Rop det ut!" : `${tittelFor(sp, b)} Velg blant ${b.valg.length} ting.`);
  }

  function flyTil(fraEl, tilEl, emoji) {
    return new Promise((ferdig) => {
      if (R.rolig() || !fraEl || !tilEl || !fraEl.animate) return ferdig();
      const a = fraEl.getBoundingClientRect();
      const b = tilEl.getBoundingClientRect();
      const el = document.createElement("span");
      el.className = "skj-flyr";
      el.textContent = emoji;
      himmel().appendChild(el);
      const s = el.offsetWidth;
      const x0 = a.left + a.width / 2 - s / 2;
      const y0 = a.top + a.height / 2 - s / 2;
      const x1 = b.left + b.width / 2 - s / 2;
      const y1 = b.top + b.height / 2 - s / 2;
      const anim = el.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(1)` },
          { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 70}px) scale(1.5) rotate(-12deg)`, offset: 0.5 },
          { transform: `translate(${x1}px, ${y1}px) scale(1.2)` },
        ],
        { duration: 520, easing: "cubic-bezier(.4,0,.3,1)", fill: "forwards" },
      );
      anim.onfinish = () => {
        el.remove();
        ferdig();
      };
    });
  }

  // The round is decided the moment the last guess is made: the score and the "svar" phase are
  // saved right away, so leaving or reloading during the animation can never leave a dead board.
  // Safe to call twice (only the first call counts).
  function fullfor(S) {
    const sp = S.spill;
    const b = sp && sp.b;
    if (!b || b.fase !== "finn" || b.gjett.length < b.stjalet.length) return false;
    const fant = funnet(b).length;
    if (sp.modus === "solo") {
      if (fant === b.stjalet.length) sp.perfekte += 1;
    } else if (sp.modus === "langt") {
      // A clean board counts and the next one is bigger; a miss costs a feather.
      sp.spilt += 1;
      if (fant === b.stjalet.length) sp.klart = Math.max(sp.klart, b.brett.length);
      else sp.fjaer = Math.max(0, sp.fjaer - 1);
    } else {
      sp.poeng[sp.tur] += fant;
      sp.rundePoeng[sp.tur] = fant;
    }
    b.fase = "svar";
    R.lagre();
    return true;
  }

  // Only the show: the magpie brings back what wasn't found, then the answer. The result is
  // already saved (by fullfor(), or by «Vis hva skjæra tok» in the shout-out mode).
  async function avslor(S) {
    const sp = S.spill;
    const b = sp.b;
    const N = spes(b);
    opptatt = true;
    const fortsatt = R.vakt();
    const st = tatte(b);
    const mangler = st.filter((x) => !b.gjett.includes(x));
    const perfekt = !mangler.length;
    await R.vent(R.rolig() ? 50 : 350);
    if (!fortsatt()) return;
    if (mangler.length) {
      settTittel(SKJAERA_IKON, "Skjæra kommer tilbake!");
      skratt();
      const tomme = R.$$(".skj-rute.tom").map((el) => Number(el.dataset.pos));
      const mal = mangler
        .map((x, n) => {
          const p = N.stokk ? tomme[n] : b.brett.indexOf(x);
          const r = rute(p).getBoundingClientRect();
          return {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            ved: (fugl) => {
              const pose = fugl.querySelector(`.skj-bytte span[data-ting="${x}"]`);
              if (pose) pose.remove();
              const el = rute(p);
              if (el) el.outerHTML = ruteHtml(p, x, { merk: () => ({ klasse: "slipp" }) });
              R.lyd.pop();
            },
          };
        })
        .sort((a, c) => c.x - a.x);
      await fly(mal, { retning: -1, bytte: mangler.map((x) => `<span data-ting="${x}">${esc(TING[x].e)}</span>`).join("") });
      if (!fortsatt()) return;
      // (in the shout-out mode nobody has guessed wrong: the magpie simply shows what it took)
      if (sp.modus === "rop") R.lyd.pling();
      else R.lyd.feil();
    } else {
      R.lyd.riktig();
      setTimeout(() => R.lyd.pling(), 220);
      R.vibrer([30, 50, 30]);
    }
    if (N.stokk) {
      // Put everything back where it was, so you can see what it looked like.
      await R.vent(R.rolig() ? 50 : 450);
      if (!fortsatt()) return;
      settTittel("↩️", "Slik så det ut!");
      const gml = posisjoner();
      R.$(".skj-brett").innerHTML = brettHtml(b, b.brett);
      glidFra(gml, 720);
      R.lyd.sveip();
      await R.vent(R.rolig() ? 100 : 1100);
      if (!fortsatt()) return;
    } else {
      R.$(".skj-brett").innerHTML = brettHtml(b, b.brett);
    }
    if (perfekt && !R.rolig()) {
      R.$$(".skj-brett .skj-ting").forEach(
        (el, n) => el.animate && el.animate([{ transform: "none" }, { transform: "translateY(-16px) scale(1.12) rotate(-6deg)" }, { transform: "none" }], { duration: 560, delay: n * 40, easing: "ease-out" }),
      );
    }
    opptatt = false;
    settHode(S);
    settDokk(svarHtml(S));
    R.si(`${tittelFor(sp, b)} Skjæra tok: ${st.map((x) => TING[x].n).join(", ")}.`);
  }

  // ---------- Results ----------

  const stjerner = (S) => (Array.isArray(S.stjerner) ? S.stjerner : []);
  const laast = (S, L) => !APNE.includes(L) && !(stjerner(S)[L - 1] >= 1);
  function nesteNiva(S) {
    const st = stjerner(S);
    for (let L = 0; L < NIVAER.length; L++) if (!laast(S, L) && !(st[L] >= 1)) return L;
    for (let L = 0; L < NIVAER.length; L++) if (!(st[L] >= 3)) return L;
    return NIVAER.length - 1;
  }
  const sumStjerner = (S) => stjerner(S).reduce((s, n) => s + (n || 0), 0);
  const stjerneRad = (n, maks = 3) => Array.from({ length: maks }, (_, i) => (i < n ? "★" : "☆")).join("");
  const rader = (sp) => sp.poeng.map((p, i) => ({ i, poeng: p }));

  // «Hvor langt kommer du?» is over: the biggest clean board is the result (and maybe the record).
  function ferdigLangt(S) {
    const sp = S.spill;
    const gml = S.langt.rekord || 0;
    sp.res = { ting: sp.klart, gml, ny: sp.klart > gml, alt: sp.klart >= LANGT_MAKS, fjaer: sp.fjaer };
    if (sp.klart > gml) S.langt.rekord = sp.klart;
    S.langt.spilt = (S.langt.spilt || 0) + 1;
    sp.ferdig = true;
    R.statistikk("ferdig", { modus: "langt", ting: sp.klart, brett: sp.spilt, rekord: sp.klart > gml });
    R.gaTil("langtslutt");
  }

  // A game together is over: the result goes to «Kveldens gjeng» (once), then «Kåringen».
  function ferdigSammen(S) {
    const sp = S.spill;
    sp.ferdig = true;
    R.kveld.registrer(rader(sp));
    R.statistikk("ferdig", { modus: sp.modus, spillere: sp.antall, omkamp: sp.omkamp || 0 });
    R.gaTil("slutt");
  }

  // Turns: everyone has had a board. Between rounds the standings; after the last round the
  // winner – or, when it is level at the top, an extra and harder board for those who share the lead.
  function etterRunde(S) {
    const sp = S.spill;
    if (!sp.omkamp && sp.runde + 1 < sp.runder) return R.gaTil("stilling");
    const topp = ledere(sp.poeng);
    if (topp.length > 1 && sp.omkamp < OMKAMPER) {
      sp.omkamp += 1;
      sp.ko = topp;
      sp.koNr = 0;
      sp.tur = topp[0];
      sp.rundePoeng = sp.rundePoeng.map(() => 0);
      sp.b = nyRunde(S, { niva: nivaForRunde(sp) });
      return R.gaTil("omkamp");
    }
    ferdigSammen(S);
  }

  function vinnerBanner(sp) {
    const alle = rader(sp);
    const best = Math.max(...alle.map((r) => r.poeng));
    const vinnere = alle.filter((r) => r.poeng === best);
    const alene = vinnere.length === 1;
    if (best === 0) return R.ui.banner({ etikett: "Ingen poeng denne gangen", tittel: "Skjæra vant!", tekst: "Den stakk av med alt sammen. Prøv en gang til!", klasse: "aksent", stemning: "" });
    const hva = sp.modus === "rop" ? `${best} poeng` : `${best} ting funnet`;
    return `<div class="banner aksent">
      ${alene ? `<span class="skj-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="skj-krone" aria-hidden="true">👑</span></span>` : R.ui.figur(null, { stemning: "jubel" })}
      <p class="etikett">${alene ? `${hva}${sp.omkamp ? " · vant omkampen" : ""}` : `Helt likt · ${best} hver`}</p>
      <h1 id="skjerm-tittel">${esc(`${R.ramsOpp(vinnere.map((r) => R.navn(r.i)))} vinner!`)}</h1>
    </div>`;
  }

  function delTekst(res) {
    return `Skjæra – Hvor langt kommer du?\n🪶 Jeg husket et brett med ${res.ting} ting${res.alt ? " – alle sammen!" : "."} Klarer du flere?`;
  }

  // ---------- Start ----------

  R.start({
    id: "skjaera",
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also the one with the answers in it
    // A game (a level, a run or a game with friends) is in progress until its result screen.
    pagar,

    tilstand: () => ({
      antall: 3,
      oppsett: { niva: "lett", runder: 3, sammen: "rop", alene: "nivaer", jul: false },
      stjerner: [],
      langt: { rekord: 0, spilt: 0 },
      spill: null,
    }),

    lastet(S) {
      if (!S.oppsett || !(S.oppsett.niva in START)) S.oppsett = { niva: "lett", runder: 3 };
      if (![3, 5].includes(S.oppsett.runder)) S.oppsett.runder = 3;
      if (!["rop", "tur"].includes(S.oppsett.sammen)) S.oppsett.sammen = "rop";
      if (!["nivaer", "langt"].includes(S.oppsett.alene)) S.oppsett.alene = "nivaer";
      S.oppsett.jul = !!S.oppsett.jul;
      S.stjerner = stjerner(S)
        .slice(0, NIVAER.length)
        .map((n) => R.klamp(Number(n) || 0, 0, 3));
      const l = S.langt && typeof S.langt === "object" ? S.langt : {};
      S.langt = { rekord: R.klamp(Math.floor(Number(l.rekord) || 0), 0, LANGT_MAKS), spilt: Math.max(0, Math.floor(Number(l.spilt) || 0)) };
      S.antall = R.klamp(Number(S.antall) || 3, 2, 8);
      const sp = S.spill;
      if (sp) {
        const b = sp.b;
        const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
        const poengOk = () => Array.isArray(sp.poeng) && sp.poeng.length === sp.antall && sp.poeng.every((p) => heltall(p, 0, 999));
        let ok =
          ["solo", "langt", "flere", "rop"].includes(sp.modus) &&
          b &&
          (b.e ? heltall(b.e, LANGT_START, LANGT_MAKS) : !!NIVAER[b.niva]) &&
          Array.isArray(b.brett) &&
          b.brett.every((x) => TING[x]) &&
          Array.isArray(b.stjalet) &&
          b.stjalet.every((p) => heltall(p, 0, b.brett.length - 1)) &&
          Array.isArray(b.plass) &&
          Array.isArray(b.valg) &&
          b.valg.every((x) => TING[x]) &&
          Array.isArray(b.gjett) &&
          ["se", "finn", "rop", "svar"].includes(b.fase);
        if (ok && sp.modus === "solo") ok = !!NIVAER[sp.niva] && heltall(sp.runde, 0, RUNDER_SOLO - 1);
        if (ok && sp.modus === "langt") ok = !!b.e && heltall(sp.fjaer, 0, FJAER) && heltall(sp.klart, 0, LANGT_MAKS);
        if (ok && sp.modus === "flere") ok = poengOk() && heltall(sp.runde, 0, 4) && Array.isArray(sp.rundePoeng);
        if (ok && sp.modus === "rop") ok = poengOk() && heltall(sp.mal, 1, 9) && b.fase !== "finn";
        if (!ok) S.spill = null;
        else {
          if (sp.modus === "langt") sp.spilt = Math.max(0, Math.floor(Number(sp.spilt) || 0));
          if (sp.modus === "flere") {
            // Saved by an older version: everyone plays in order, no tie-break yet.
            sp.omkamp = R.klamp(Math.floor(Number(sp.omkamp) || 0), 0, OMKAMPER);
            if (!Array.isArray(sp.ko) || !sp.ko.length || !sp.ko.every((i) => heltall(i, 0, sp.antall - 1))) {
              sp.ko = sp.poeng.map((_, i) => i);
              sp.koNr = R.klamp(Number(sp.tur) || 0, 0, sp.antall - 1);
            }
            sp.koNr = R.klamp(Math.floor(Number(sp.koNr) || 0), 0, sp.ko.length - 1);
            sp.tur = sp.ko[sp.koNr];
          }
          if (sp.modus === "rop" && !(b.hvem === -1 || heltall(b.hvem, 0, sp.antall - 1))) delete b.hvem;
          // All guesses used but the round not closed (saved by an older version): close it now.
          fullfor(S);
        }
      }
      const s = S.spill;
      const krever = { brett: () => s && !s.ferdig, gi: () => s && s.modus === "flere", stilling: () => s && s.modus === "flere", omkamp: () => s && s.modus === "flere" && s.omkamp > 0 };
      for (const navn of ["nivaklart", "langtslutt", "slutt"]) krever[navn] = () => !!s;
      if (krever[S.skjerm] && !krever[S.skjerm]()) S.skjerm = "hjem";
    },

    regler: {
      intro: "Se godt på tingene. Så kommer skjæra og stjeler noe! Klarer du å se hva som mangler?",
      steg: [
        ["Se godt", "Tingene vises i noen sekunder. Prøv å huske alle sammen."],
        ["Skjæra stjeler", "Skjæra flyr forbi og tar med seg noe. På de vanskelige brettene roter den til resten også."],
        ["Hva mangler?", "Trykk på det skjæra tok. Du har like mange forsøk som ting som mangler."],
      ],
      tips: [
        "Si tingene høyt mens du ser på dem. Da husker du dem bedre.",
        "Nivåer: Samle stjerner på tolv nivåer. En runde uten feil gir en stjerne.",
        "Hvor langt kommer du? Brettet vokser med én ting hver gang du finner alt. Bommer du, tar skjæra en fjær – og du har bare tre.",
        "Rop det ut: Alle ser på det samme brettet. Den som først roper alt som mangler, får poenget.",
        "Etter tur: Alle får hvert sitt brett, og hver ting du finner, gir ett poeng. Står det likt til slutt, blir det omkamp.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const hvor = !aktiv
            ? ""
            : sp.modus === "solo"
              ? `nivå ${sp.niva + 1}`
              : sp.modus === "langt"
                ? `${sp.b.brett.length} ting`
                : sp.modus === "rop"
                  ? `først til ${sp.mal}`
                  : sp.omkamp
                    ? "omkamp"
                    : `runde ${sp.runde + 1} av ${sp.runder}`;
          const sum = sumStjerner(S);
          const rekord = S.langt.rekord;
          return R.ui.spillhjem({
            slagordHtml: julPa(S) ? "Se godt på julepynten.<br><em>Skjæra stjeler noe!</em>" : "Se godt på tingene.<br><em>Skjæra stjeler noe!</em>",
            knapperHtml:
              (aktiv ? R.ui.knapp(`Fortsett · ${hvor}`, "fortsett") : "") +
              R.ui[aktiv ? "knapp2" : "knapp"]("Spill alene", "alene", { ikon: "⭐", variant: aktiv ? "" : "stor", tekstHtml: `Spill alene${sum ? ` <small class="skj-sum">${sum} ★</small>` : ""}` }) +
              R.ui.knapp2("Spill sammen", "sammen", { ikon: "🦊🐸" }) +
              (rekord ? `<button class="skj-rek" data-h="langt"><span class="skj-rek-merke">Rekord</span><b>${rekord} ting</b><span class="skj-rek-pil">Slå den <i aria-hidden="true">➜</i></span></button>` : "") +
              (JUL.length && erJul(R.dag().tekst) ? R.ui.bryter("jul", S.oppsett.jul, "🎄 Julebrett", "Skjæra stjeler julepynt og julegodt") : "") +
              R.ui.lenke("Slik spiller du", "regler"),
            merker: [
              ["1–8", "spillere"],
              [String(NIVAER.length), "nivåer"],
              [String(VANLIGE.length), "ting"],
            ],
          });
        },
      },

      // Alone: the level map, or the run for a record.
      nivaer: {
        tittel: "Alene",
        tilbake: "hjem",
        vis(S) {
          const st = stjerner(S);
          const neste = nesteNiva(S);
          const langt = S.oppsett.alene === "langt";
          const rekord = S.langt.rekord;
          const fliser = R.ui.fliser(
            "alene-modus",
            [
              { v: "nivaer", tittel: "Nivåer", tekst: `${sumStjerner(S)} av ${NIVAER.length * 3} ★`, ikon: "⭐" },
              { v: "langt", tittel: "Hvor langt kommer du?", tekst: rekord ? `Rekord: ${rekord} ting` : "Sett en rekord", ikon: "🪶" },
            ],
            S.oppsett.alene,
          );
          const nivaKnapp = (N, L) => {
            const lukket = laast(S, L);
            const n = st[L] || 0;
            return `<li><button class="skj-niva${L === neste ? " neste" : ""}${n === 3 ? " full" : ""}" data-h="niva" data-v="${L}" style="--h:${(L * 27) % 360}"${lukket ? " disabled" : ""} aria-label="Nivå ${L + 1}, ${N.ting} ting${N.stokk ? ", skjæra roter til" : ""}, ${lukket ? "låst" : `${n} av 3 stjerner`}">
                <b>${L + 1}</b>
                <span class="skj-niva-st" aria-hidden="true">${lukket ? "🔒" : stjerneRad(n)}</span>
                <small aria-hidden="true">${N.ting} ting${N.stokk ? " · 🌀" : ""}</small>
              </button></li>`;
          };
          const innhold = langt
            ? `<section class="seksjon skj-langt">
                <p class="skj-langt-fjaer" aria-hidden="true">🪶🪶🪶</p>
                <ol class="skj-langt-steg">
                  <li>Du starter med fire ting.</li>
                  <li>Finner du alt skjæra tok, kommer det én ting til.</li>
                  <li>Bommer du, tar skjæra en fjær. Etter tre er det slutt.</li>
                </ol>
                <p class="skj-rekordlinje">${rekord ? `<span>Rekord</span> <b>${rekord} ting</b>` : "Ingen rekord ennå – sett den første!"}</p>
              </section>
              ${R.ui.dokk(R.ui.knapp("Start", "langt", { variant: "stor" }))}`
            : `<section class="seksjon skj-nivaer" aria-label="Velg nivå">
                ${RADER.map(
                  ([navn, fra, til]) => `<h2 class="skj-rad-navn">${navn}</h2>
                  <ol class="skj-kart">${NIVAER.slice(fra, til)
                    .map((N, n) => nivaKnapp(N, fra + n))
                    .join("")}</ol>`,
                ).join("")}
                <p class="hjelp">🌀 = skjæra roter til brettet. En runde uten feil gir en stjerne.</p>
              </section>
              ${R.ui.dokk(R.ui.knapp(`Spill nivå ${neste + 1}`, "niva", { v: neste, variant: "stor" }))}`;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">${fliser}</section>
            ${innhold}`;
        },
      },

      oppsett: {
        tittel: "Spill sammen",
        tilbake: "hjem",
        vis(S) {
          const rop = S.oppsett.sammen === "rop";
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            ${R.ui.fliser(
              "sammen-modus",
              [
                { v: "rop", tittel: "Rop det ut!", tekst: "Alle ser på samme brett", ikon: "📣" },
                { v: "tur", tittel: "Etter tur", tekst: "Hver sin tur med mobilen", ikon: "🔁" },
              ],
              S.oppsett.sammen,
            )}
          </section>
          ${R.ui.spillere({
            min: 2,
            max: 8,
            tittel: "Hvem spiller?",
            hjelp: rop ? "Legg mobilen så alle ser. Den som først roper hva skjæra tok, får poenget." : "Dere sender mobilen rundt. Alle får hvert sitt brett.",
          })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Hvor vanskelig?</h2></div>
            ${R.ui.seg("vanskelighet", [["lett", "Lett"], ["middels", "Middels"], ["vanskelig", "Vanskelig"]], S.oppsett.niva, { etikett: "Vanskelighet" })}
            <p class="hjelp">Det blir litt vanskeligere underveis.</p>
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${rop ? "Hvor lenge?" : "Antall runder"}</h2></div>
            ${
              rop
                ? R.ui.seg("runder", [[3, "Først til 3"], [5, "Først til 5"]], S.oppsett.runder, { etikett: "Hvor mange poeng det spilles til" })
                : R.ui.seg("runder", [[3, "3 runder"], [5, "5 runder"]], S.oppsett.runder, { etikett: "Antall runder" })
            }
            ${rop ? "" : '<p class="hjelp">Står det likt til slutt, blir det omkamp.</p>'}
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`;
        },
      },

      gi: {
        tittel: (S) => (S.spill.omkamp ? "Omkamp" : `Runde ${S.spill.runde + 1} av ${S.spill.runder}`),
        tilbake: "hjem",
        vis: (S) =>
          R.ui.giTil({
            i: S.spill.tur,
            h: "klar-spiller",
            knapp: "Jeg er klar!",
            tekst: S.spill.omkamp ? "Omkamp – gi mobilen til" : "Gi mobilen til",
            advarsel: "De andre kan se på – men ikke hviske!",
            ikon: "👀",
            prikker: S.spill.omkamp ? null : [S.spill.antall, S.spill.tur],
          }),
      },

      brett: {
        tittel(S) {
          const sp = S.spill;
          if (sp.modus === "solo") return `Nivå ${sp.niva + 1} · runde ${sp.runde + 1} av ${RUNDER_SOLO}`;
          if (sp.modus === "langt") return `${sp.b.brett.length} ting`;
          if (sp.modus === "rop") return `Først til ${sp.mal}`;
          return sp.omkamp ? "Omkamp" : `Runde ${sp.runde + 1} av ${sp.runder}`;
        },
        tilbake: "hjem",
        liggende: "side", // the answers always go in the side column on a phone on its side, whatever the phase
        vis(S) {
          const sp = S.spill;
          const b = sp.b;
          const N = spes(b);
          const layout = b.fase === "se" ? b.brett : visning(b);
          const inn = nyttBrett && b.fase === "se";
          nyttBrett = false;
          return `
            ${hodeHtml(S)}
            <div class="skj-bord">
              <div class="skj-brett${inn ? " inn" : ""}" data-n="${layout.length}" data-kol="${N.kol || 0}" style="--kol:${N.kol || 4}" role="group" aria-label="Tingene">
                ${b.fase === "svar" ? brettHtml(b, layout) : layout.map((x, p) => ruteHtml(p, x)).join("")}
              </div>
            </div>
            ${R.ui.dokk(`<div class="skj-dokk${sp.modus === "rop" ? " rop" : ""}" style="min-height:${dokkHoyde(sp, N)}px">${dokkInnhold(S)}</div>`)}`;
        },
        etter() {
          tilpass();
        },
        inn(S) {
          opptatt = false;
          R.holdVaken();
          // Never a dead board: a round whose guesses are all used is shown as answered.
          if (fullfor(S)) return R.vis();
          if (S.spill.b.fase === "se") {
            if (!R.rolig()) R.lyd.pop();
            startSe(S);
          }
        },
        ut() {
          opptatt = false;
          cancelAnimationFrame(seLoop);
          tomHimmel();
          R.slippVaken();
        },
      },

      nivaklart: {
        tittel: (S) => `Nivå ${S.spill.niva + 1}`,
        tilbake: "nivaer",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.perfekte;
          const L = sp.niva;
          const sisteNiva = L === NIVAER.length - 1;
          const tittel = n === 0 ? "Skjæra vant!" : sisteNiva ? "Du klarte alt!" : `Nivå ${L + 1} klart!`;
          const tekst =
            n === 0
              ? "Ingen runder uten feil denne gangen. Prøv igjen – du klarer det!"
              : n === 3
                ? "Tre runder uten en eneste feil!"
                : `${n} av 3 runder uten feil.${n < 3 ? " Klarer du alle tre?" : ""}`;
          const knapper =
            n > 0 && !sisteNiva
              ? R.ui.dokk(R.ui.knapp(`Neste nivå (${L + 2})`, "niva", { v: L + 1 }), R.ui.lenkerad(R.ui.lenke("Prøv igjen", "niva", { v: L }), R.ui.lenke("Alle nivåer", "alene")))
              : R.ui.dokk(R.ui.knapp("Prøv igjen", "niva", { v: L }), R.ui.lenkerad(R.ui.lenke("Alle nivåer", "alene"), '<a class="lenke" href="/">Alle spill</a>'));
          return `
            <div class="banner aksent">
              ${R.ui.figur(null, { stemning: n >= 2 ? "jubel" : n === 0 ? "lei" : "" })}
              <p class="etikett">${n === 3 ? "Perfekt!" : n > 0 ? "Godt jobba!" : "Godt forsøk!"}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="skj-store-stjerner" role="img" aria-label="${n} av 3 stjerner">${[1, 2, 3].map((k) => `<span class="${k <= n ? "pa" : ""}" style="--k:${k}">${k <= n ? "★" : "☆"}</span>`).join("")}</p>
              <p class="ingress">${esc(tekst)}</p>
              ${sp.nyRekord && n > 0 ? '<p class="skj-rekord">Ny rekord på nivået!</p>' : ""}
              ${sp.lasteOpp ? `<p class="skj-rekord mynte">🔓 Nivå ${L + 2} er låst opp!</p>` : ""}
            </div>
            ${R.ui.flereSpill({ antall: 1 })}
            ${knapper}`;
        },
        // Celebrate in proportion: fanfare for two or three stars, a warm "pling" otherwise.
        inn(S) {
          const n = S.spill.perfekte;
          if (n >= 2) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },

      // The result of «Hvor langt kommer du?» (one player: no «Kåringen»).
      langtslutt: {
        tittel: "Hvor langt?",
        tilbake: "nivaer",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.res || { ting: sp.klart || 0, gml: S.langt.rekord, ny: false, alt: false, fjaer: 0 };
          const tekst = r.alt
            ? "Et brett med alle 30 tingene, og du fant alt. Skjæra gir seg!"
            : r.ting === 0
              ? "Skjæra tok alle fjærene før du klarte et brett. Prøv igjen – du klarer det!"
              : r.fjaer > 0
                ? `Du husket et brett med ${r.ting} ting.`
                : `Du husket et brett med ${r.ting} ting før skjæra tok den siste fjæra.`;
          const unna = r.gml - r.ting;
          const rekord = r.ny
            ? r.gml
              ? `<p class="skj-rekordlinje">Forrige rekord: <b>${r.gml} ting</b></p>`
              : ""
            : r.gml
              ? `<p class="skj-rekordlinje"><span>Rekord</span> <b>${r.gml} ting</b>${unna > 0 ? ` · ${unna === 1 ? "bare én ting unna" : `${unna} ting unna`}` : unna === 0 ? " · like bra som rekorden" : ""}</p>`
              : "";
          return `
            ${R.ui.banner({
              etikett: "Hvor langt kommer du?",
              tittel: r.ting ? `${r.ting} ting!` : "Skjæra vant!",
              tekst,
              klasse: "aksent",
              stemning: r.ting === 0 ? "lei" : r.ny || r.ting >= 9 ? "jubel" : "",
            })}
            ${r.ny && r.ting ? '<p class="stempel-sted skj-stempel-sted"><span class="stempel lampe skj-stempel">Ny rekord!</span></p>' : ""}
            ${rekord}
            ${r.ting ? R.ui.knapp2("Del resultatet", "del") : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "langt"), R.ui.lenkerad(R.ui.lenke("Nivåene", "til-nivaer"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        // Celebrate in proportion: fanfare for a record or a long run, warm words for a short one.
        inn(S) {
          const r = S.spill.res || {};
          if ((r.ny && r.ting) || r.ting >= 12) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },

      stilling: {
        tittel: "Stillingen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const liste = sp.poeng.map((p, i) => ({ i, poeng: p, pluss: sp.rundePoeng[i] || 0 }));
          const best = Math.max(...sp.poeng);
          const topp = liste.filter((r) => r.poeng === best).map((r) => R.navn(r.i));
          const tittel = best === 0 ? "Alle står likt" : topp.length === sp.antall ? "Helt likt!" : `${R.ramsOpp(topp)} leder!`;
          return `
            <div class="banner">
              ${R.figur()}
              <p class="etikett">Runde ${sp.runde + 1} av ${sp.runder} er ferdig</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
            </div>
            ${R.ui.poengliste(liste)}
            <p class="hjelp">Neste runde blir litt vanskeligere …</p>
            ${R.ui.dokk(R.ui.knapp("Neste runde", "neste-runde"), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
        },
      },

      // Level at the top after the last round: those who share the lead get one more board each.
      omkamp: {
        tittel: "Omkamp",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const navn = R.ramsOpp(sp.ko.map((i) => R.navn(i)));
          return `
            ${R.ui.banner({
              etikett: sp.omkamp > 1 ? "Fortsatt helt likt" : "Helt likt på topp",
              tittel: "Omkamp!",
              tekst: `${navn} står likt. Dere får ett brett til hver – og nå er det vanskeligere.`,
              klasse: "aksent",
              stemning: "",
            })}
            ${R.ui.poengliste(rader(sp))}
            ${R.ui.dokk(R.ui.knapp("Start omkampen", "start-omkamp"), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn() {
          R.lyd.trommevirvel();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const liste = rader(sp);
          return `
            ${vinnerBanner(sp)}
            ${sp.antall >= 3 ? R.ui.pall(liste) : ""}
            ${R.ui.poengliste(liste)}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "sammen"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          if (Math.max(...S.spill.poeng) > 0) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      hjem: () => R.gaTil("hjem"),
      alene: () => R.gaTil("nivaer"),
      sammen: () => R.gaTil("oppsett"),
      "til-nivaer"(el, e, S) {
        S.oppsett.alene = "nivaer";
        R.gaTil("nivaer");
      },
      "alene-modus"(el, e, S) {
        if (!["nivaer", "langt"].includes(el.dataset.v)) return;
        S.oppsett.alene = el.dataset.v;
        R.vis();
      },
      "sammen-modus"(el, e, S) {
        if (!["rop", "tur"].includes(el.dataset.v)) return;
        S.oppsett.sammen = el.dataset.v;
        R.vis();
      },
      jul(el, e, S) {
        S.oppsett.jul = !S.oppsett.jul;
        R.vis();
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return R.gaTil("hjem");
        R.gaTil(sp.modus === "flere" && sp.b.fase === "se" && !sp.b.gjett.length ? "gi" : "brett");
      },
      async niva(el, e, S) {
        const L = R.klamp(Number(el.dataset.v) || 0, 0, NIVAER.length - 1);
        if (laast(S, L)) return;
        // Never throw away a running game without asking (and do nothing if the screen changed meanwhile).
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), erAlene(S.spill))) || !fortsatt()) return;
        S.oppsett.alene = "nivaer";
        S.spill = { modus: "solo", niva: L, runde: 0, perfekte: 0, b: nyRunde(S, { niva: L }), ferdig: false };
        nyttBrett = true;
        R.statistikk("start", { modus: "solo", niva: L + 1 });
        R.gaTil("brett");
      },
      // «Hvor langt kommer du?»: four things, three feathers.
      async langt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), erAlene(S.spill))) || !fortsatt()) return;
        S.oppsett.alene = "langt";
        S.spill = { modus: "langt", fjaer: FJAER, klart: 0, spilt: 0, b: nyRunde(S, { e: LANGT_START }), ferdig: false };
        nyttBrett = true;
        R.statistikk("start", { modus: "langt" });
        R.gaTil("brett");
      },
      vanskelighet(el, e, S) {
        if (!(el.dataset.v in START)) return;
        S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      runder(el, e, S) {
        if (![3, 5].includes(Number(el.dataset.v))) return;
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), erAlene(S.spill))) || !fortsatt()) return;
        const antall = R.klamp(S.antall || 2, 2, 8);
        const start = START[S.oppsett.niva] || 0;
        const poeng = () => Array.from({ length: antall }, () => 0);
        if (S.oppsett.sammen === "rop") {
          S.spill = { modus: "rop", antall, mal: S.oppsett.runder, runde: 0, start, poeng: poeng(), b: null, ferdig: false };
          S.spill.b = nyRunde(S, { niva: nivaForRunde(S.spill) });
          nyttBrett = true;
          R.statistikk("start", { modus: "rop", spillere: antall, niva: S.oppsett.niva });
          return R.gaTil("brett");
        }
        S.spill = {
          modus: "flere",
          antall,
          runder: S.oppsett.runder,
          runde: 0,
          tur: 0,
          ko: Array.from({ length: antall }, (_, i) => i),
          koNr: 0,
          omkamp: 0,
          start,
          poeng: poeng(),
          rundePoeng: poeng(),
          b: nyRunde(S, { niva: start }),
          ferdig: false,
        };
        R.statistikk("start", { modus: "flere", spillere: antall, niva: S.oppsett.niva });
        R.gaTil("gi");
      },
      igjen(el, e, S) {
        H.start(el, e, S);
      },
      "klar-spiller"() {
        nyttBrett = true;
        R.gaTil("brett");
      },
      klar(el, e, S) {
        stjel(S);
      },
      // Right: the thing flies back into its place. Wrong: a cross.
      gjett(el, e, S) {
        const b = S.spill && S.spill.b;
        if (!b || b.fase !== "finn" || opptatt) return;
        const x = Number(el.dataset.v);
        if (!TING[x] || b.gjett.includes(x) || b.gjett.length >= b.stjalet.length) return;
        const st = tatte(b);
        const rett = st.includes(x);
        const fortsatt = R.vakt();
        const haddeFokus = document.activeElement === el;
        b.gjett.push(x);
        // The last guess decides the round now (saved), the animations come afterwards.
        const ferdig = fullfor(S);
        R.lagre();
        el.disabled = true;
        el.classList.add(rett ? "rett" : "feil");
        if (haddeFokus && !ferdig) {
          const neste = R.$(".skj-valg:not(:disabled)");
          if (neste) neste.focus({ preventScroll: true });
        }
        const luker = R.$(".skj-luker");
        if (luker) luker.outerHTML = lukerHtml(b);
        if (rett) {
          R.lyd.riktig();
          R.vibrer(20);
          R.si(`Riktig: ${TING[x].n}`);
          const tom = spes(b).stokk ? R.$(".skj-rute.tom") : rute(b.brett.indexOf(x));
          if (tom) {
            tom.classList.remove("tom");
            tom.classList.add("venter");
            opptatt = true;
            flyTil(el.querySelector(".skj-valg-e"), tom, TING[x].e).then(() => {
              if (!fortsatt()) return;
              const p = Number(tom.dataset.pos);
              tom.outerHTML = ruteHtml(p, x, { merk: () => ({ klasse: "landet" }) });
              opptatt = false;
              if (ferdig) avslor(S);
            });
            return;
          }
        } else {
          R.lyd.feil();
          R.vibrer([40, 40, 40]);
          R.si(`Nei, ikke ${TING[x].n}`);
        }
        if (ferdig) setTimeout(() => fortsatt() && avslor(S), R.rolig() ? 200 : 650);
      },
      // Shout-out mode: everyone has shouted, the magpie shows what it took.
      vis(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.modus !== "rop" || sp.b.fase !== "rop" || opptatt) return;
        sp.b.fase = "svar";
        R.lagre();
        settDokk(`<p class="skj-pst">Nå får vi se …</p>`);
        avslor(S);
      },
      // Shout-out mode: who was first? (−1 = nobody.) Tapping someone else moves the point.
      hvem(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.modus !== "rop" || sp.b.fase !== "svar" || opptatt) return;
        const i = Number(el.dataset.v);
        if (!(i === -1 || (Number.isInteger(i) && i >= 0 && i < sp.antall))) return;
        sp.b.hvem = i;
        R.lagre();
        R.lyd.klikk();
        R.$$(".skj-hvem-valg").forEach((k) => k.setAttribute("aria-pressed", String(Number(k.dataset.v) === i)));
        const neste = R.$('.skj-dokk [data-h="neste"]');
        if (neste) {
          neste.disabled = false;
          neste.textContent = i >= 0 && sp.poeng[i] + 1 >= sp.mal ? "Se vinneren" : "Neste brett";
        }
        const rad = R.$(".skj-poengrad");
        if (rad) rad.outerHTML = poengradHtml(sp);
        R.si(i >= 0 ? `Poenget går til ${R.navn(i)}` : "Ingen får poenget");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.b.fase !== "svar" || opptatt) return;
        if (sp.modus === "solo") {
          if (sp.runde + 1 < RUNDER_SOLO) {
            sp.runde += 1;
            sp.b = nyRunde(S, { niva: sp.niva });
            nyttBrett = true;
            R.gaTil("brett");
            return;
          }
          const L = sp.niva;
          const gml = stjerner(S)[L] || 0;
          const varLast = L + 1 < NIVAER.length && laast(S, L + 1);
          S.stjerner = stjerner(S).slice();
          while (S.stjerner.length < NIVAER.length) S.stjerner.push(0);
          S.stjerner[L] = Math.max(gml, sp.perfekte);
          sp.nyRekord = sp.perfekte > gml && gml > 0;
          sp.lasteOpp = varLast && !laast(S, L + 1);
          sp.ferdig = true;
          R.statistikk("ferdig", { modus: "solo", niva: L + 1, stjerner: sp.perfekte });
          R.gaTil("nivaklart");
          return;
        }
        if (sp.modus === "langt") {
          if (langtSlutt(sp)) return ferdigLangt(S);
          sp.b = nyRunde(S, { e: Math.min(LANGT_MAKS, sp.b.brett.length + (altFunnet(sp.b) ? 1 : 0)) });
          nyttBrett = true;
          R.gaTil("brett");
          return;
        }
        if (sp.modus === "rop") {
          if (sp.b.hvem == null) return;
          if (sp.b.hvem >= 0) sp.poeng[sp.b.hvem] += 1;
          if (Math.max(...sp.poeng) >= sp.mal) return ferdigSammen(S);
          sp.runde += 1;
          sp.b = nyRunde(S, { niva: nivaForRunde(sp) });
          nyttBrett = true;
          R.gaTil("brett");
          return;
        }
        if (sp.koNr + 1 < sp.ko.length) {
          sp.koNr += 1;
          sp.tur = sp.ko[sp.koNr];
          sp.b = nyRunde(S, { niva: nivaForRunde(sp) });
          R.gaTil("gi");
          return;
        }
        etterRunde(S);
      },
      "neste-runde"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.modus !== "flere" || sp.ferdig) return;
        sp.runde += 1;
        sp.koNr = 0;
        sp.tur = sp.ko[0];
        sp.rundePoeng = sp.rundePoeng.map(() => 0);
        sp.b = nyRunde(S, { niva: nivaForRunde(sp) });
        R.gaTil("gi");
      },
      "start-omkamp"(el, e, S) {
        if (S.spill && S.spill.modus === "flere" && !S.spill.ferdig) R.gaTil("gi");
      },
      // Ending early: straight to the result with what has been found so far.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || opptatt) return;
        const fortsatt = R.vakt();
        const langt = sp.modus === "langt";
        const ja = await R.bekreft(langt ? "Avslutte her?" : "Avslutte spillet?", langt ? "Brettene du har klart, teller fortsatt." : "Dere går rett til kåringen med poengene dere har nå.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt()) return;
        if (langt) return ferdigLangt(S);
        // (a point that was chosen but not yet counted, is counted)
        if (sp.modus === "rop" && sp.b.fase === "svar" && sp.b.hvem >= 0) sp.poeng[sp.b.hvem] += 1;
        ferdigSammen(S);
      },
      del(el, e, S) {
        const r = S.spill && S.spill.res;
        if (r && r.ting) R.del("Skjæra", delTekst(r), DEL_URL);
      },
    }),
  });
})();
