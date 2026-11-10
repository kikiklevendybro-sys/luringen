/* Kodeknekkeren — "Kodeord i lag".
   Two teams (Rosa and Blå) share one 5×5 board of words. Each team has a code master who knows
   which words are the team's agents and gives one word and a number as a hint; the team taps
   words on the board. The code masters see the key either on their own phone (a join code / QR
   that holds the seed, board number, starting team and word level, salted with the word bank's
   hash) or behind a hold-to-reveal card on the board device. No network: the code holds it all. */
(function () {
  "use strict";

  const R = window.Rusj;
  const ORD = window.RUSJ_ORD;
  const esc = R.esc;
  let H; // the actions, so one action can reuse another

  // ---------- Words ----------
  // Single words of 3–11 letters with difficulty 1–2 (easy mode: 1 only), kept in the word bank's
  // fixed order so the same seed draws the same board on every phone with the same word list.
  const ER_ORD = /^[A-Za-zÆØÅæøåÉé]{3,11}$/;
  // Never on the board: real people, and English words that aren't everyday Norwegian.
  // (The word list is shared with other games, so it is filtered here, not edited.)
  const UTELATT = new Set([
    "napoleon", "kleopatra", "shakespeare", "tutankhamon",
    "likes", "story", "buffering", "livestream", "highscore", "moonwalk", "backpacking", "sightseeing", "laptop", "powerbank", "meme",
  ]);
  // rusj.no's house spelling for a few words in the shared list.
  const SKRIVEMATE = { Spaghetti: "Spagetti", Fremtid: "Framtid", Fremføring: "Framføring", Romferge: "Romferje" };
  const KANDIDATER = { 1: [], 2: [] };
  ORD.kategorier.forEach((kat, k) =>
    kat.ord.forEach(([o, n]) => {
      if (n > 2 || !ER_ORD.test(o) || UTELATT.has(o.toLocaleLowerCase("nb"))) return;
      const vist = SKRIVEMATE[o] || o;
      const ord = { o: vist, k, l: vist.toLocaleLowerCase("nb") };
      KANDIDATER[2].push(ord);
      if (n === 1) KANDIDATER[1].push(ord);
    }),
  );
  // Boards depend on the word bank and on the rules above: both are part of every code's salt and
  // of saved games, so a change is rejected instead of giving another board.
  const BANK = "2:" + ORD.hash;

  const ANTALL = 25;
  const ROSA = 0;
  const BLA = 1;
  const NOYTRAL = 2;
  const FELLE = 3;
  // Teams are always «Lag Rosa» / «Lag Blå» in text (shared wording on rusj.no).
  const LAG = [
    { navn: "Lag Rosa", kort: "Rosa", klasse: "rosa", token: "--rosa", knapp: "rosa" },
    { navn: "Lag Blå", kort: "Blå", klasse: "bla", token: "--himmel", knapp: "himmel" },
  ];
  const TYPENAVN = ["agent for Lag Rosa", "agent for Lag Blå", "nøytralt ord", "fella"];
  const TID = [0, 60, 120, 180];

  // Watermark icons on revealed cards: agent (fedora), bystander, and the trap (a bomb).
  const IKON = {
    agent:
      '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M9 21.5c0-2 1.8-3.3 4-3.3h1.6l2.6-9.4C17.8 6.6 19.6 5 22 5h4c2.4 0 4.2 1.6 4.8 3.8l2.6 9.4H35c2.2 0 4 1.3 4 3.3z"/><path d="M14.5 24h19v2.6c0 6-4.2 10.4-9.5 10.4s-9.5-4.4-9.5-10.4z"/><path d="M6 48c0-7 7.5-10.5 18-10.5S42 41 42 48z"/></svg>',
    noytral:
      '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="16" r="9.5"/><path d="M6 48c0-10 8-16.5 18-16.5S42 38 42 48z"/></svg>',
    felle:
      '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="21" cy="29" r="14.5"/><path d="M27.5 13.2l4.6 4.6-4.4 4.4-4.6-4.6z"/><path d="M31 15c.6-3.6 3.4-6 7-5.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M41.5 3.5l1.3 3.3 3.4-.6-2.3 2.6 2.3 2.6-3.4-.6-1.3 3.3-1.3-3.3-3.4.6 2.3-2.6-2.3-2.6 3.4.6z"/></svg>',
  };
  const ikonFor = (type) => (type === FELLE ? IKON.felle : type === NOYTRAL ? IKON.noytral : IKON.agent);

  // Size class for a word on a card; tilpass() picks one or two lines and the font size.
  const lengdeKlasse = (ord) => (ord.length <= 5 ? "k5" : ord.length <= 7 ? "k7" : ord.length <= 9 ? "k9" : "k11");

  // ---------- Two lines for long words ----------
  // Long words are shown on two lines on small cards, split where a Norwegian reader expects it:
  // at the joint of a compound (Sol-systemet, Rund-kjøring) when a known last part is found,
  // otherwise before the last consonant between two vowels (Kroko-dille), never inside kj, sj, ng …
  const LEDD = (
    "burger kake pinne bolle suppe postei grøt skive brød stykke salat spyd pølse smør snurr stek bær melon nøtt frukt eple " +
    "gummi spinn ring gull shake banan krem saus split stenger drikk vann kjeks topp skap koker rister panne spade fjøl høvel " +
    "jern åpner kvern papir rull lapp pinner plate mikser slynge folie pose pott saks maskin glass vekt klokke beger form " +
    "pensel hjul padde mus bjørn spett meis fisk hogger sprut stjerne skjell slott post spette anemone krabbe gård rev vrak " +
    "skjelv kopp fugl mark bølge brann sol hoppe stikker nesle kanne plante lilje slange krage blomst sopp bed hage nisse " +
    "suger lys kasse bøtte gris sekk henger varsler køye stake håndtak bryter stol kontakt trekker bår skuffe pumpe stokk " +
    "stikke gaffel benk vern hjelm freser blåser støvel kjede jakke genser briller strikk børste stift lakk bukse kåpe spenne " +
    "tørkle taske dress tang sprit saft tann sperre sans pleier sjåfør legger mester vakt passer trener øving minutt rom " +
    "robe skole tabell melk føring lesning fag bok kontor butikk senter plass bygg klinikk kjøkken verksted felt ballong skip " +
    "vogn buss kjøring skilt bil båt scooter bane stasjon dump grense arbeid kort ball tennis løp board hopp hevinger skyting " +
    "sprang kaptein skinn mølle brett deig album kunst merker klipp bilder kjel kniv støping teppe dyr spray spill fløyte kule " +
    "gulv bass pipe fele musikk vise tekst skrekk gitar hest bobler jakt krig sjakk binge løype kveld liv korps fredag godt tur " +
    "kjøtt ferie hytte kirke stang krone krim kofte mat hus fjord heimen tunga tinget stad landet lag moen berg fest sund fjell " +
    "stigen snes seggen rike huset hammer syke liste bånd reise leir klubb nummer penger feber lengsel sjekking service byrå " +
    "hall mann stav brønn kiste helt skurk styrke ladden mal syn gubben film serie strømming rose mannen rolle snarr haren " +
    "hjerte lavn dagen strømpe krans krybbe maling marked tog alder tid maleri hull loven riket skjold presse propper telefon " +
    "chat navn tone deksel lasting datering bilde alfa motor virus svindel verset systemet kraft landing rør vogna sfære " +
    "syntese krets kapsel heim land dam trekking kroning skraper skop hans tek grafer stikk fotball"
  ).split(" ");
  const FORLEDD = (
    "barne skole fiske kjøkken sommer vinter jule påske reise hytte brann regn snø sol vann luft lys lyd super troll skatte " +
    "sjø hav fjell skog hage kjøtt pepper kanel gulrot vanilje sjokolade mineral sports flagg melke tann hånd hår nøkkel natt " +
    "dag morgen kveld røyk gynge hoppe spill leke for auto opp"
  ).split(" ");
  const HALE = ["", "e", "r", "er", "en", "et", "ene", "s", "a", "ing"];
  // Words the rules get wrong. Triple consonants come back when the word is split (buss-sjåfør).
  const SPESIAL = {
    armbåndsur: ["Arm", "båndsur"],
    samfunnsfag: ["Sam", "funnsfag"],
    byggvarehus: ["Bygg", "varehus"],
    blomsterbed: ["Blomster", "bed"],
    svømming: ["Svøm", "ming"],
    amazonas: ["Ama", "zonas"],
    øyemaske: ["Øye", "maske"],
    romvesen: ["Rom", "vesen"],
    trombone: ["Trom", "bone"],
    moonwalk: ["Moon", "walk"],
    navnedag: ["Navne", "dag"],
    hemsedal: ["Hemse", "dal"],
    ensomhet: ["Ensom", "het"],
    bussjåfør: ["Buss", "sjåfør"],
    stikkontakt: ["Stikk", "kontakt"],
    australia: ["Austra", "lia"],
    hieroglyfer: ["Hiero", "glyfer"],
    influenser: ["Influ", "enser"],
    frustrasjon: ["Frus", "trasjon"],
    plystring: ["Plys", "tring"],
    enhjørning: ["En", "hjørning"],
    elektriker: ["Elek", "triker"],
    resepsjon: ["Resep", "sjon"],
    pinocchio: ["Pinoc", "chio"],
    utkledning: ["Ut", "kledning"],
    cashewnøtt: ["Cashew", "nøtt"],
  };
  // Short words that only look like compounds (Klat-ring, Her-kules): keep them on one line.
  const HEL = new Set(["klatring", "herkules", "tastatur", "skulptur", "thailand", "tønsberg", "grønland"]);
  const VOKAL = /[aeiouyæøåé]/;
  const SAMMEN = ["kj", "sj", "tj", "gj", "hj", "hv", "ng", "ch", "sh", "th", "ph", "ck"];

  function delOrd(ord) {
    const l = ord.toLocaleLowerCase("nb");
    const n = l.length;
    if (n < 8 || HEL.has(l)) return null;
    if (SPESIAL[l]) return SPESIAL[l];
    const midt = n / 2;
    let best = null;
    const prov = (p, verdi) => {
      if (p < 3 || n - p < 3) return;
      const poeng = verdi - Math.abs(p - midt) * 0.4;
      if (!best || poeng > best.poeng) best = { p, poeng };
    };
    for (let p = 3; p <= n - 3; p++) {
      const hoyre = l.slice(p);
      for (const h of LEDD) {
        if (h.length >= 3 && hoyre.startsWith(h) && HALE.includes(hoyre.slice(h.length))) prov(p, 6 + h.length * 0.5);
      }
      if (FORLEDD.includes(l.slice(0, p))) prov(p, 5);
    }
    if (best) return [ord.slice(0, best.p), ord.slice(best.p)];
    if (n < 9) return null; // short words: only split at a known compound joint
    let valg = null;
    for (let p = 3; p <= n - 3; p++) {
      if (VOKAL.test(l[p]) || !VOKAL.test(l[p + 1] || "")) continue; // before the last consonant ahead of a vowel
      if (SAMMEN.includes(l[p - 1] + l[p]) || l.slice(p - 2, p + 1) === "skj") continue;
      if (valg == null || Math.abs(p - midt) < Math.abs(valg - midt)) valg = p;
    }
    return valg == null ? null : [ord.slice(0, valg), ord.slice(valg)];
  }
  const delt = new Map();
  const delAv = (ord) => {
    if (!delt.has(ord)) delt.set(ord, delOrd(ord));
    return delt.get(ord);
  };

  // A word on a card: one line, plus a two-line version for when that reads better.
  function ordHtml(ord) {
    const d = delAv(ord);
    return `<span class="kk-ord"><span class="hel">${esc(ord)}</span>${d ? `<span class="delt" aria-hidden="true">${esc(d[0])}-<br>${esc(d[1])}</span>` : ""}</span>`;
  }

  // One board: 25 different words (at most two per category, no word inside another, so a hint
  // can't simply be part of a word on the board) and the key: 9 for the starting team, 8 for the
  // other, 7 neutral and 1 trap.
  function lagBrett(fro, brett, start, lett) {
    const tilfeldig = R.rng(R.hash(`${fro}:${brett}`));
    const valgt = [];
    const perKategori = {};
    for (const ord of R.stokk(KANDIDATER[lett ? 1 : 2], tilfeldig)) {
      if ((perKategori[ord.k] || 0) >= 2) continue;
      if (valgt.some((v) => v.l.includes(ord.l) || ord.l.includes(v.l))) continue;
      valgt.push(ord);
      perKategori[ord.k] = (perKategori[ord.k] || 0) + 1;
      if (valgt.length === ANTALL) break;
    }
    const typer = [];
    for (let i = 0; i < 9; i++) typer.push(start);
    for (let i = 0; i < 8; i++) typer.push(1 - start);
    for (let i = 0; i < 7; i++) typer.push(NOYTRAL);
    typer.push(FELLE);
    return { ord: valgt.map((v) => v.o), nokkel: R.stokk(typer, tilfeldig) };
  }

  // ---------- Join code ----------
  // seed (27 bits) · board number 0–63 (6) · starting team (1) · easy words (1) = 8 characters.
  // The salt includes the word bank's hash: a code made with another word list is rejected.
  const BREDDER = [27, 6, 1, 1];
  const SALT = "kodeknekkeren:" + BANK;
  const MAKS_BRETT = 63;
  const KODELENGDE = R.kode.lengde(BREDDER);
  const lagKode = (b) => R.kode.lag([b.fro, b.brett, b.start, b.lett ? 1 : 0], BREDDER, SALT);
  function lesKode(tekst) {
    const v = R.kode.les(tekst, BREDDER, SALT);
    return v ? { fro: v[0], brett: v[1], start: v[2], lett: v[3] === 1 } : null;
  }
  const kanLenke = !R.iRamme && /^https?:$/.test(location.protocol);
  const nyttFro = () => R.nyttFro() % 2 ** 27;

  // ---------- The game on the board device ----------

  function nyttSpill(fro, brett, start, lett, tid, stilling) {
    const b = lagBrett(fro, brett, start, lett);
    return {
      hash: BANK,
      fro,
      brett,
      start,
      lett,
      tid,
      ord: b.ord,
      nokkel: b.nokkel,
      vist: [], // revealed cards, in order
      tur: start,
      vinner: null,
      grunn: null, // "alle" (found every agent) | "fella"
      hist: [], // undo stack: { t: "kort" | "ferdig" | "tid", i, tur }
      stilling: stilling || [0, 0],
      melding: startMelding(start),
      sist: null, // the card that was just revealed (animates once)
    };
  }

  function startMelding(lag) {
    return { tekst: `${LAG[lag].navn} begynner. Kodemesteren gir ett ord og et tall.`, type: "tur" };
  }

  const igjen = (sp, lag) => sp.nokkel.reduce((n, t, i) => n + (t === lag && !sp.vist.includes(i) ? 1 : 0), 0);

  // A turn timer (optional). It restarts whenever the turn changes.
  function startTur(S) {
    const sp = S.spill;
    const gammel = R.timer("kk-tid");
    if (gammel) gammel.stopp();
    if (!sp || !sp.tid || sp.vinner != null) return;
    new R.Timer({ id: "kk-tid", sekunder: sp.tid, vedSlutt: () => tidenUte(S) }).start();
  }

  function tidenUte(S) {
    const sp = S.spill;
    if (!sp || sp.vinner != null || S.skjerm !== "brett") return;
    sp.hist.push({ t: "tid", tur: sp.tur });
    sp.tur = 1 - sp.tur;
    sp.melding = { tekst: `Tiden er ute! Nå er det ${LAG[sp.tur].navn} sin tur.`, type: "tid" };
    R.si(sp.melding.tekst);
    R.vis();
    startTur(S);
  }

  let sluttId = null;
  function tilSluttOm(ms) {
    clearTimeout(sluttId);
    const fortsatt = R.vakt();
    sluttId = setTimeout(() => {
      sluttId = null;
      const S = R.S;
      if (fortsatt() && S.spill && S.spill.vinner != null && S.skjerm === "brett") R.gaTil("slutt");
    }, R.rolig() ? 500 : ms);
  }

  // «Lag X er ferdig» twice in a row (a double tap) must not hand the turn over and straight back.
  // (The kit lets the same action repeat quickly, for steppers.)
  let sisteTurbytte = -1e9;
  let sisteAngring = -1e9;

  // Red flash over the whole screen when someone hits the trap.
  function blits() {
    if (R.rolig()) return;
    const el = document.createElement("div");
    el.className = "kk-blits";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  // Wide stage for the board on tablets and laptops.
  const bred = (pa) => document.documentElement.classList.toggle("kk-vid", !!pa);

  // Fit each word to its card: one line if it stays big enough, otherwise two lines when that
  // gives a bigger font (long compounds on phones). Layout widths only (not affected by animations).
  const STOR_NOK = 13; // px: below this, a long word reads better on two lines
  function tilpass(rot) {
    if (!rot) return;
    for (const boks of rot.querySelectorAll(".kk-kort, .kk-n")) {
      const ord = boks.querySelector(".kk-ord");
      if (!ord) continue;
      const hel = ord.querySelector(".hel");
      const to = ord.querySelector(".delt");
      boks.classList.remove("to");
      ord.style.fontSize = "";
      const stil = getComputedStyle(boks);
      const plass = boks.clientWidth - parseFloat(stil.paddingLeft) - parseFloat(stil.paddingRight) - 2;
      const hoyde = boks.clientHeight - parseFloat(stil.paddingTop) - parseFloat(stil.paddingBottom) - 2;
      if (plass <= 0) continue;
      const f0 = parseFloat(getComputedStyle(ord).fontSize);
      const f1 = Math.min(f0, (f0 * plass) / Math.max(1, hel.offsetWidth));
      let f = f1;
      if (to && f1 < Math.min(f0, STOR_NOK)) {
        boks.classList.add("to");
        const f2 = Math.min(f0, (f0 * plass) / Math.max(1, to.offsetWidth), (f0 * hoyde) / Math.max(1, to.offsetHeight));
        if (f2 > f1 * 1.05) f = f2;
        else boks.classList.remove("to");
      }
      if (f < f0 - 0.1) ord.style.fontSize = Math.max(7, f).toFixed(2) + "px";
    }
  }
  let tilpassId = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(tilpassId);
    tilpassId = requestAnimationFrame(() => {
      tilpass(R.$("#skjerm"));
      tilpass(R.$(".mappe.apen .mappe-bakside"));
    });
  });

  // ---------- Markup ----------

  function kortHtml(sp, i, o) {
    const type = sp.nokkel[i];
    const ord = sp.ord[i];
    const vist = sp.vist.includes(i);
    const fasit = !!o.fasit && !vist;
    const synlig = vist || fasit;
    const klasser = ["kk-kort", lengdeKlasse(ord)];
    if (synlig) klasser.push("t" + type);
    if (vist) klasser.push("vist");
    if (fasit) klasser.push("fasit");
    if (o.sist === i) klasser.push("snu");
    const etikett = synlig ? `${ord}: ${TYPENAVN[type]}${fasit ? " (ikke tatt)" : ""}` : ord;
    // A taken card stays focusable (aria-disabled, not disabled), so keyboard focus doesn't fall
    // out of the board when the card flips; taps on it are ignored in the «kort» action.
    return `<button class="${klasser.join(" ")}" data-h="kort" data-v="${i}"${synlig || o.fasit ? ' aria-disabled="true" data-stille' : ""} aria-label="${esc(etikett)}">${
      synlig ? `<span class="kk-ikon">${ikonFor(type)}</span>` : ""
    }${ordHtml(ord)}</button>`;
  }

  function brettHtml(sp, o = {}) {
    const lag = sp.vinner != null ? sp.vinner : sp.tur;
    return `<div class="kk-brett lag-${LAG[lag].klasse}${o.fasit ? " med-fasit" : ""}" role="group" aria-label="Brettet: 25 ord">${sp.ord.map((_, i) => kortHtml(sp, i, o)).join("")}</div>`;
  }

  function timerHtml(sp) {
    if (!sp.tid || sp.vinner != null) return "";
    const t = R.timer("kk-tid");
    const igjenSek = t ? t.igjen : sp.tid;
    const omkrets = 2 * Math.PI * 54;
    return `<button class="kk-timer${t && !t.kjorer && !t.ferdig ? " pause" : ""}" id="kk-tid" data-h="timer-veksle" data-v="kk-tid" aria-label="Tidsur – trykk for pause">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="spor" cx="60" cy="60" r="54"/><circle class="fyll" cx="60" cy="60" r="54" style="stroke-dasharray:${omkrets};stroke-dashoffset:${omkrets * (1 - igjenSek / sp.tid)}"/></svg>
      <span class="timer-tid">${R.formaterTid(igjenSek)}</span>
    </button>`;
  }

  function statusHtml(sp) {
    const boks = (l) => {
      const aktiv = sp.vinner == null && sp.tur === l;
      const n = igjen(sp, l);
      return `<div class="kk-lag ${LAG[l].klasse}${aktiv ? " aktiv" : ""}">
        <span class="kk-lag-navn">${LAG[l].navn}</span>
        <b class="kk-lag-tall">${n}</b>
        <span class="kk-lag-tekst">${n === 1 ? "agent" : "agenter"} igjen</span>
      </div>`;
    };
    const tur = LAG[sp.tur];
    const farge = LAG[sp.vinner != null ? sp.vinner : sp.tur];
    return `<div class="kk-status lag-${farge.klasse}">
      ${boks(ROSA)}
      <div class="kk-tur">
        ${sp.vinner == null ? `<span class="kk-tur-pil" aria-hidden="true">${sp.tur === ROSA ? "◀" : "▶"}</span><b><span class="kk-nb">${tur.navn}</span> <span class="kk-nb">sin tur</span></b>` : `<b><span class="kk-nb">${LAG[sp.vinner].navn}</span> vinner!</b>`}
        ${timerHtml(sp)}
      </div>
      ${boks(BLA)}
    </div>`;
  }

  function meldingHtml(sp) {
    const m = sp.melding || startMelding(sp.tur);
    const ikon = { riktig: "✓", feil: "✗", noytral: "–", felle: "💥", tid: "⏰", tur: "💬", angre: "↶" }[m.type] || "";
    return `<p class="kk-melding ${esc(m.type)}"><span><span class="kk-melding-ikon" aria-hidden="true">${ikon}</span>${esc(m.tekst)}</span></p>`;
  }

  // The key as a small grid: used on the code master's phone and inside the hold-to-reveal card.
  function nokkelGrid(ord, nokkel, o = {}) {
    const tatt = o.tatt || [];
    return `<span class="kk-nokkel">${ord
      .map((w, i) => {
        const t = tatt.includes(i);
        const klasse = `kk-n t${nokkel[i]} ${lengdeKlasse(w)}${t ? " tatt" : ""}`;
        const innhold = ordHtml(w);
        return o.knapper
          ? `<button class="${klasse}" data-h="tatt" data-v="${i}" aria-pressed="${t}" aria-label="${esc(w)}: ${TYPENAVN[nokkel[i]]}">${innhold}</button>`
          : `<span class="${klasse}">${innhold}</span>`;
      })
      .join("")}</span>`;
  }

  function fordeling(start) {
    const lag = (l, n) => `<span><i class="t${l}"></i>${LAG[l].navn}: ${n}</span>`;
    return `<span class="kk-fordeling" aria-hidden="true">${lag(start, 9)}${lag(1 - start, 8)}<span><i class="t2"></i>Nøytrale: 7</span><span><i class="t3"></i>Fella: 1</span></span>`;
  }

  // How the code masters get the key: join code + QR, or hold-to-reveal on this screen.
  function nokkelHtml(S) {
    const sp = S.spill;
    const modus = S.oppsett.nokkel;
    const bytt = R.ui.lenkerad(
      modus === "mobil"
        ? R.ui.lenke("Ingen mobil? Vis nøkkelen på denne skjermen", "nokkelmodus", { v: "skjerm" })
        : R.ui.lenke("Bruk egne mobiler i stedet (QR-kode)", "nokkelmodus", { v: "mobil" }),
    );
    if (modus === "mobil") {
      const kode = lagKode(sp);
      const qr = kanLenke ? R.kode.qr(R.kode.lenke(kode)) : "";
      return `<div class="kodekort kk-kodekort">
          <span class="etikett">Brett ${sp.brett + 1} · bare for kodemesterne</span>
          ${qr ? `<div class="qr">${qr}</div>` : ""}
          <span class="kode" id="kk-kode" data-kode="${esc(kode)}">${esc(R.kode.formater(kode))}</span>
          <div class="knapprad">${R.ui.knapp2("Kopier kode", "kopier", { variant: "liten" })}${kanLenke ? R.ui.knapp2("Del lenke", "del", { variant: "liten" }) : ""}</div>
        </div>
        <ol class="steg kk-steg">
          <li><b>${qr ? "Skann QR-koden" : "Åpne Kodeknekkeren"}</b><span>${qr ? "Eller åpne Kodeknekkeren, trykk «Jeg er kodemester» og skriv koden." : "Trykk «Jeg er kodemester» og skriv koden."}</span></li>
          <li><b>Hold mobilen for dere selv</b><span>Nøkkelen viser hvilke ord som er agenter – og hvor fella er.</span></li>
        </ol>
        ${bytt}`;
    }
    return `${R.ui.mappe({ id: "nokkel", etikett: "Kun kodemestere!", tekst: "Hold fingeren på kortet for å se", etikettAria: "Hold fingeren på kortet for å se nøkkelen. Bare for kodemestere." })}
      <p class="hjelp">De andre ser bort. Nøkkelen kan åpnes igjen fra brettet med 🔑.</p>
      ${bytt}`;
  }

  function visNokkelArk(S) {
    R.ark(`
      <h2 id="ark-tittel">Nøkkelen · brett ${S.spill.brett + 1}</h2>
      ${nokkelHtml(S)}
      <button class="knapp-2" data-h="lukk-ark">Lukk</button>`);
  }

  // ---------- The code master's phone ----------

  function nyGjest(k) {
    return { hash: BANK, fro: k.fro, brett: k.brett, start: k.start, lett: k.lett, tatt: [], skjult: false };
  }

  let gjesteBrett = { nokkel: "", brett: null };
  function gjestensBrett(g) {
    const n = `${g.fro}:${g.brett}:${g.start}:${g.lett}`;
    if (gjesteBrett.nokkel !== n) gjesteBrett = { nokkel: n, brett: lagBrett(g.fro, g.brett, g.start, g.lett) };
    return gjesteBrett.brett;
  }

  function sjekkKode(tekst) {
    const ren = R.kode.normaliser(tekst);
    if (!ren) return { feil: "Skriv inn koden først." };
    if (ren.length !== KODELENGDE) return { feil: `Koden har ${KODELENGDE} tegn. Sjekk at alle er med.` };
    const k = lesKode(ren);
    if (!k) return { feil: "Koden stemmer ikke. Se etter skrivefeil – og oppdater siden på begge skjermene." };
    return { k };
  }

  function visKodefeil(tekst) {
    const feil = R.$("#kk-kodefeil");
    if (feil) feil.textContent = tekst;
    const felt = R.$("#kk-kodefelt");
    if (felt) {
      felt.classList.remove("risting");
      void felt.offsetWidth;
      felt.classList.add("risting");
    }
    R.lyd.feil();
    R.vibrer(120);
  }

  function bliMed(S, k) {
    S.gjest = nyGjest(k);
    S.kodeUtkast = "";
    S.kodeFeil = null;
    R.lyd.pling();
    R.holdVaken();
    R.gaTil("kodemester");
  }

  // ---------- The app ----------

  R.start({
    id: "kodeknekkeren",
    versjon: 1,

    // In progress: a board being played, or a code master looking at the key (keeps the screen on).
    pagar: (S) => (!!S.spill && S.spill.vinner == null) || (S.skjerm === "kodemester" && !!S.gjest),

    tilstand: () => ({
      oppsett: { nokkel: "mobil", lett: false, tid: 0 },
      spill: null,
      gjest: null,
      kodeUtkast: "",
      kodeFeil: null,
    }),

    // Drop saved games that don't fit this version of the word list.
    lastet(S) {
      S.oppsett = Object.assign({ nokkel: "mobil", lett: false, tid: 0 }, S.oppsett);
      if (!["mobil", "skjerm"].includes(S.oppsett.nokkel)) S.oppsett.nokkel = "mobil";
      if (!TID.includes(S.oppsett.tid)) S.oppsett.tid = 0;
      S.oppsett.lett = !!S.oppsett.lett;
      const sp = S.spill;
      const okListe = (l, n) => Array.isArray(l) && (n == null || l.length === n);
      if (sp && (sp.hash !== BANK || !okListe(sp.ord, ANTALL) || !okListe(sp.nokkel, ANTALL) || !okListe(sp.vist) || !okListe(sp.hist) || !okListe(sp.stilling, 2))) S.spill = null;
      const g = S.gjest;
      if (g && (g.hash !== BANK || !Number.isInteger(g.fro) || !Number.isInteger(g.brett) || !okListe(g.tatt))) S.gjest = null;
      if (!S.spill && ["nokkel", "brett", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (!S.gjest && S.skjerm === "kodemester") S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && S.spill.vinner == null) S.skjerm = "brett";
      if (S.spill) S.spill.sist = null;
    },

    regler: {
      intro: "Lag Rosa og Lag Blå leter etter sine hemmelige agenter blant 25 ord. Bare kodemesterne vet hvilke ord som hører til hvem.",
      steg: [
        ["Velg kodemestere", "Del dere i to lag. Hvert lag velger én kodemester, som ser nøkkelen – på egen mobil eller på skjermen med brettet (hold inne for å se)."],
        ["Ett ord og et tall", "Kodemesteren sier ett hint og et tall, for eksempel «Hav, 2». Laget trykker på de ordene de tror hintet peker på."],
        ["Finn agentene – unngå fella", "Rett farge: gjett videre. Nøytralt ord eller motstandernes agent: turen går over. Fella: dere taper brettet med en gang."],
      ],
      tips: [
        "Første lag som finner alle agentene sine, vinner.",
        "Dere kan gjette én gang mer enn tallet – for å ta igjen et ord dere bommet på tidligere.",
        "Hintet må være ett ord, og ikke et av ordene på brettet.",
        "Kodemesteren får ikke peke, nikke eller himle med øynene. Pokerfjes!",
        "Laget som begynner, har 9 agenter. Det andre har 8.",
        "Trykket feil? «Angre» fikser det.",
      ],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp) return { html: "" };
        requestAnimationFrame(() => tilpass(R.$(".mappe.apen .mappe-bakside")));
        return {
          html: `<span class="kk-mappe-topp"><span class="kk-starter ${LAG[sp.start].klasse}">${LAG[sp.start].navn} begynner</span><span>Brett ${sp.brett + 1}</span></span>${nokkelGrid(sp.ord, sp.nokkel, { tatt: sp.vist })}${fordeling(sp.start)}<span class="kk-tommel" aria-hidden="true">Slipp for å skjule</span>`,
          klasse: "kk-bak",
        };
      },
    },

    vedHash(S, hash) {
      const svar = sjekkKode(hash);
      if (!svar.k) {
        S.kodeUtkast = R.kode.formater(R.kode.normaliser(hash).slice(0, KODELENGDE));
        S.kodeFeil = "Lenken inneholder ingen gyldig kode. " + svar.feil;
        return "bli-med";
      }
      S.gjest = nyGjest(svar.k);
      S.kodeUtkast = "";
      S.kodeFeil = null;
      return "kodemester";
    },

    felt: {
      kode(S, el) {
        const ren = R.kode.normaliser(el.value).slice(0, KODELENGDE);
        const pen = R.kode.formater(ren);
        if (pen !== el.value) {
          el.value = pen;
          try {
            el.setSelectionRange(pen.length, pen.length);
          } catch (e) {
            /* not every input type allows it */
          }
        }
        S.kodeUtkast = pen;
        const feil = R.$("#kk-kodefeil");
        if (feil) feil.textContent = "";
        // A complete, valid code opens the key straight away.
        if (ren.length === KODELENGDE) {
          const svar = sjekkKode(ren);
          if (svar.k) setTimeout(() => S.skjerm === "bli-med" && bliMed(S, svar.k), 180);
        }
      },
    },

    skjema: {
      kode(S, form) {
        const svar = sjekkKode(form.querySelector("input").value);
        if (!svar.k) return visKodefeil(svar.feil);
        bliMed(S, svar.k);
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Ett ord. Ett tall.<br><em>Finn agentene – unngå fella.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: !!S.spill,
              fortsettTekst: S.spill ? (S.spill.vinner == null ? `Fortsett · brett ${S.spill.brett + 1}` : "Fortsett") : "",
              ekstraHtml: R.ui.knapp2("Jeg er kodemester", "bli-med", { ikon: "🔑" }) + R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["4–20", "spillere"],
              ["2", "lag"],
              [R.tall(KANDIDATER[2].length), "ord"],
            ],
          }),
        etter: () => bred(false),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <p class="ingress">Del dere i <b class="kk-farge rosa">Lag Rosa</b> og <b class="kk-farge bla">Lag Blå</b>, og velg én kodemester på hvert lag.</p>
          <section class="seksjon">
            <h2>Hvor ser kodemesterne nøkkelen?</h2>
            ${R.ui.fliser(
              "nokkelmodus",
              [
                { v: "mobil", ikon: "📱", tittel: "På egen mobil", tekst: "Med QR-kode" },
                { v: "skjerm", ikon: "🔒", tittel: "På denne skjermen", tekst: "Hold fingeren på kortet" },
              ],
              S.oppsett.nokkel,
            )}
          </section>
          <section class="seksjon">
            <h2>Ordene</h2>
            ${R.ui.seg(
              "ord",
              [
                ["alle", "Blandet"],
                ["lett", "Bare lette ord"],
              ],
              S.oppsett.lett ? "lett" : "alle",
              { etikett: "Ordene" },
            )}
          </section>
          <section class="seksjon">
            <h2>Tidsur for hver tur</h2>
            ${R.ui.seg(
              "tid",
              TID.map((t) => [t, t ? `${t / 60} min` : "Av"]),
              S.oppsett.tid,
              { etikett: "Tidsur for hver tur" },
            )}
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start"))}`,
        etter: () => bred(false),
      },

      nokkel: {
        tittel: (S) => `Brett ${S.spill.brett + 1}`,
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Kodemestere, hent nøkkelen</h1>
          <p class="ingress">${
            S.spill.brett > 0 && S.oppsett.nokkel === "mobil"
              ? "Har dere koden fra forrige brett? Trykk «Neste brett» på mobilen – eller skann på nytt."
              : "Én kodemester på hvert lag. Resten av laget ser bort!"
          }</p>
          ${nokkelHtml(S)}
          ${R.ui.dokk(R.ui.knapp("Klar – vis brettet", "til-brett"))}`,
        etter: () => bred(false),
      },

      brett: {
        tittel: (S) => `Brett ${S.spill.brett + 1}`,
        tilbake: "hjem",
        liggende: false, // landscape phones: the board has its own wide layout (html.kk-vid in spill.css)
        vis(S) {
          const sp = S.spill;
          const ferdig = sp.vinner != null;
          const na = LAG[sp.tur];
          return `
            <h1 class="vh" id="skjerm-tittel">Brett ${sp.brett + 1}: ${ferdig ? `${LAG[sp.vinner].navn} vinner` : `${na.navn} sin tur`}</h1>
            ${statusHtml(sp)}
            ${meldingHtml(sp)}
            ${brettHtml(sp, { sist: sp.sist })}
            ${R.ui.dokk(
              ferdig
                ? R.ui.knapp("Se kåringen", "til-slutt", { ikon: "🏆" })
                : R.ui.knapp("", "ferdig", {
                    variant: na.knapp,
                    ikon: "✋",
                    tekstHtml: `<span class="kk-ferdig"><b>${na.navn} er ferdig</b><small>Turen går til ${LAG[1 - sp.tur].navn}</small></span>`,
                  }),
              `<div class="lenkerad kk-verktoy">
                <button class="lenke" data-h="angre"${sp.hist.length ? "" : " disabled"}>↶ Angre</button>
                <button class="lenke" data-h="nokkel-ark">🔑 Nøkkelen</button>
                <button class="lenke" data-h="avslutt">Avslutt</button>
              </div>`,
            )}`;
        },
        inn(S) {
          R.holdVaken();
          startTur(S);
        },
        etter(S, rot) {
          bred(true);
          tilpass(rot);
          if (S.spill) S.spill.sist = null;
        },
        ut() {
          clearTimeout(sluttId);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        liggende: false, // (as the board: its own wide layout)
        vis(S) {
          const sp = S.spill;
          const v = sp.vinner;
          const grunn = sp.grunn === "fella" ? `${LAG[1 - v].navn} trykket på fella.` : `${LAG[v].navn} fant alle agentene sine.`;
          return `
            <div class="banner kk-banner ${LAG[v].klasse}">
              ${R.figur()}
              <p class="etikett">Brett ${sp.brett + 1}</p>
              <h1 id="skjerm-tittel">${LAG[v].navn} vinner!</h1>
              <p class="ingress">${esc(grunn)}</p>
              <p class="kk-stilling" aria-label="Stillingen: ${LAG[0].navn} ${sp.stilling[0]}, ${LAG[1].navn} ${sp.stilling[1]}"><span class="rosa">${LAG[0].navn} <b>${sp.stilling[0]}</b></span><span class="kk-strek">–</span><span class="bla"><b>${sp.stilling[1]}</b> ${LAG[1].navn}</span></p>
            </div>
            ${brettHtml(sp, { fasit: true })}
            <p class="hjelp kk-fasit-hjelp">Kort med bare farget kant rakk ingen å ta.</p>
            ${R.ui.flereSpill()}
            ${R.ui.dokk(
              R.ui.knapp("Spill igjen", "nytt-brett", { ikon: "🎲" }),
              R.ui.lenkerad(
                '<button class="lenke" data-h="angre" aria-label="Angre siste trykk">↶ Angre</button>',
                R.ui.lenke("Endre oppsett", "endre"),
                '<a class="lenke" href="/">Alle spill</a>',
              ),
            )}`;
        },
        inn(S) {
          R.lyd.fanfare();
          R.vibrer([40, 60, 40]);
          R.konfetti([LAG[S.spill.vinner].token, "--papir", "--aksent"]);
        },
        etter(S, rot) {
          bred(true);
          tilpass(rot);
        },
      },

      "bli-med": {
        tittel: "Kodemester",
        tilbake: "hjem",
        // With a key already on this phone (after a reload), showing it again is the main action
        // and the field is for a new code; otherwise the field is the whole screen.
        vis: (S) => {
          const g = S.gjest;
          return `
          <div class="banner kk-bli-med">
            ${R.figur()}
            <h1 id="skjerm-tittel">Jeg er kodemester</h1>
            <p class="ingress">${g ? "Nøkkelen er lagret på mobilen. Har brettet fått en ny kode, skriver du den nedenfor." : "Skriv koden fra skjermen med brettet. Da ser du nøkkelen her."}</p>
          </div>
          <form class="kk-kodeskjema" data-skjema="kode" autocomplete="off" novalidate>
            <label class="${g ? "etikett kk-nykode" : "vh"}" for="kk-kodefelt">${g ? "Ny kode" : "Koden"}</label>
            <input class="kodefelt" id="kk-kodefelt" name="kode" data-felt="kode" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" placeholder="ABCD 1234" value="${esc(S.kodeUtkast || "")}">
            <p class="feil" id="kk-kodefeil" role="alert">${esc(S.kodeFeil || "")}</p>
            ${g ? '<button class="knapp-2" type="submit">Bruk den nye koden</button>' : '<p class="hjelp">Koden står under 🔑 på brettet.</p>'}
            ${R.ui.dokk(
              g
                ? `<button class="knapp" type="button" data-h="til-gjest"><span class="ikon" aria-hidden="true">🔑</span>Vis nøkkelen til brett ${g.brett + 1}</button>`
                : '<button class="knapp" type="submit">Vis nøkkelen</button>',
            )}
          </form>`;
        },
        etter: () => bred(false),
        // An error from a broken link is shown once, not again after a reload.
        inn(S) {
          S.kodeFeil = null;
        },
        ut(S) {
          S.kodeFeil = null;
          S.kodeUtkast = "";
        },
      },

      kodemester: {
        tittel: "Kodemester",
        tilbake: "hjem",
        gjenoppta: "bli-med", // the key is a secret: after a reload, one tap to see it again
        vis(S) {
          const g = S.gjest;
          const b = gjestensBrett(g);
          const grupper = [g.start, 1 - g.start, NOYTRAL, FELLE]
            .map((type) => {
              const ord = b.ord.map((w, i) => ({ w, i })).filter((x) => b.nokkel[x.i] === type);
              const igjenN = ord.filter((x) => !g.tatt.includes(x.i)).length;
              const navn = type === FELLE ? "Fella" : type === NOYTRAL ? "Nøytrale" : LAG[type].navn;
              return `<section class="kk-gruppe t${type}">
                <h2><i aria-hidden="true"></i>${navn}<span>${type === FELLE ? "" : `${igjenN} igjen`}</span></h2>
                <p>${ord.map((x) => `<span class="${g.tatt.includes(x.i) ? "tatt" : ""}">${esc(x.w)}</span>`).join("")}</p>
              </section>`;
            })
            .join("");
          return `
            <div class="kk-gjest-hode">
              <div><p class="etikett">Nøkkelen</p><h1 id="skjerm-tittel">Brett ${g.brett + 1}</h1></div>
              <span class="kk-starter ${LAG[g.start].klasse}">${LAG[g.start].navn} begynner</span>
            </div>
            ${
              g.skjult
                ? `<button class="kk-dekke" data-h="skjul"><span aria-hidden="true">🙈</span><b>Nøkkelen er skjult</b><span>Trykk for å vise den igjen</span></button>`
                : `${nokkelGrid(b.ord, b.nokkel, { tatt: g.tatt, knapper: true })}
                   <p class="hjelp">Gi ett ord og et tall, for eksempel «Hav, 2». Trykk på ord som blir tatt, så krysses de ut her.</p>
                   <div class="kk-grupper">${grupper}</div>`
            }
            ${R.ui.dokk(
              `<div class="knapprad">${R.ui.knapp2(g.skjult ? "Vis" : "Skjul", "skjul", { ikon: g.skjult ? "👀" : "🙈" })}${R.ui.knapp2("Neste brett", "gjest-neste", { ikon: "→" })}</div>`,
              R.ui.lenkerad(g.brett > 0 ? R.ui.lenke("Forrige brett", "gjest-forrige") : "", R.ui.lenke("Ny kode", "bli-med")),
            )}`;
        },
        inn: () => R.holdVaken(),
        etter(S, rot) {
          bred(false);
          tilpass(rot);
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!S.spill)) || !fortsatt()) return;
        S.beholdStilling = false;
        R.gaTil("oppsett");
      },
      endre(el, e, S) {
        S.beholdStilling = true; // same match, new settings: the score stays
        R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      "bli-med": () => R.gaTil("bli-med"),
      "til-gjest": () => R.gaTil("kodemester"),
      fortsett(el, e, S) {
        if (!S.spill) return;
        R.gaTil(S.spill.vinner != null ? "slutt" : "brett");
      },
      nokkelmodus(el, e, S) {
        S.oppsett.nokkel = el.dataset.v === "skjerm" ? "skjerm" : "mobil";
        if (R.arkApent()) visNokkelArk(S);
        else R.vis();
        R.lagre();
      },
      ord(el, e, S) {
        S.oppsett.lett = el.dataset.v === "lett";
        R.vis();
      },
      tid(el, e, S) {
        const t = Number(el.dataset.v);
        S.oppsett.tid = TID.includes(t) ? t : 0;
        R.vis();
      },
      start(el, e, S) {
        const stilling = S.beholdStilling && S.spill ? S.spill.stilling.slice() : [0, 0];
        S.beholdStilling = false;
        S.spill = nyttSpill(nyttFro(), 0, R.nyttFro() % 2, S.oppsett.lett, S.oppsett.tid, stilling);
        R.holdVaken();
        R.gaTil("nokkel");
      },
      "nytt-brett"(el, e, S) {
        const sp = S.spill;
        let fro = sp.fro;
        let brett = sp.brett + 1;
        if (brett > MAKS_BRETT) {
          fro = nyttFro();
          brett = 0;
        }
        S.spill = nyttSpill(fro, brett, 1 - sp.start, sp.lett, sp.tid, sp.stilling.slice());
        R.gaTil("nokkel");
      },
      "til-brett": () => R.gaTil("brett"),
      "til-slutt": () => R.gaTil("slutt"),
      "nokkel-ark": (el, e, S) => visNokkelArk(S),
      kopier: (el, e, S) => R.kopier(R.kode.formater(lagKode(S.spill))),
      del(el, e, S) {
        const kode = lagKode(S.spill);
        R.del("Kodeknekkeren", `Nøkkelen til brett ${S.spill.brett + 1} – bare for kodemesterne. Koden er ${R.kode.formater(kode)}.`, R.kode.lenke(kode));
      },

      kort(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!sp || sp.vinner != null || !(i >= 0 && i < ANTALL) || sp.vist.includes(i)) return;
        const lag = sp.tur;
        const type = sp.nokkel[i];
        const ord = sp.ord[i];
        sp.hist.push({ t: "kort", i, tur: lag });
        sp.vist.push(i);
        sp.sist = i;

        if (type === FELLE) {
          sp.vinner = 1 - lag;
          sp.grunn = "fella";
          sp.stilling[sp.vinner] += 1;
          sp.melding = { tekst: `«${ord}» var fella! ${LAG[lag].navn} taper brettet.`, type: "felle" };
          R.si(sp.melding.tekst);
          R.lyd.bom();
          R.vibrer([90, 60, 260]);
          R.vis();
          const brett = R.$(".kk-brett");
          if (brett) brett.classList.add("kk-smell");
          blits();
          tilSluttOm(1700);
          return;
        }

        const vinner = igjen(sp, ROSA) === 0 ? ROSA : igjen(sp, BLA) === 0 ? BLA : null;
        if (vinner != null) {
          sp.vinner = vinner;
          sp.grunn = "alle";
          sp.stilling[vinner] += 1;
          sp.melding = { tekst: `${LAG[vinner].navn} har funnet alle agentene!`, type: "riktig" };
          R.si(sp.melding.tekst);
          R.lyd.riktig();
          R.vibrer(30);
          R.vis();
          tilSluttOm(1200);
          return;
        }

        if (type === lag) {
          sp.melding = { tekst: `Riktig! Gjett videre – eller trykk «${LAG[lag].navn} er ferdig».`, type: "riktig" };
          R.lyd.riktig();
          R.vibrer(20);
        } else if (type === NOYTRAL) {
          sp.tur = 1 - lag;
          sp.melding = { tekst: `«${ord}» var nøytralt. Nå er det ${LAG[sp.tur].navn} sin tur.`, type: "noytral" };
          R.lyd.takk();
        } else {
          sp.tur = 1 - lag;
          sp.melding = { tekst: `Oi! «${ord}» tilhørte ${LAG[type].navn} – og nå er det deres tur.`, type: "feil" };
          R.lyd.feil();
          R.vibrer([30, 40, 30]);
        }
        R.si(sp.melding.tekst);
        R.vis();
        if (sp.tur !== lag) startTur(S);
      },

      ferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.vinner != null) return;
        if (performance.now() - sisteTurbytte < 700) return; // the second tap of a double tap
        sisteTurbytte = performance.now();
        sp.hist.push({ t: "ferdig", tur: sp.tur });
        sp.tur = 1 - sp.tur;
        sp.melding = { tekst: `${LAG[sp.tur].navn} sin tur. Kodemesteren gir ett ord og et tall.`, type: "tur" };
        R.si(sp.melding.tekst);
        R.lyd.pop();
        R.vis();
        startTur(S);
      },

      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || performance.now() - sisteAngring < 400) return; // a double tap undoes one step
        sisteAngring = performance.now();
        const h = sp.hist.pop();
        if (!h) return;
        sisteTurbytte = -1e9;
        clearTimeout(sluttId);
        if (h.t === "kort") {
          sp.vist = sp.vist.filter((i) => i !== h.i);
          if (sp.vinner != null) {
            sp.stilling[sp.vinner] = Math.max(0, sp.stilling[sp.vinner] - 1);
            sp.vinner = null;
            sp.grunn = null;
          }
        }
        const byttet = sp.tur !== h.tur;
        sp.tur = h.tur;
        sp.melding = { tekst: h.t === "kort" ? `Angret – «${sp.ord[h.i]}» er skjult igjen. ${LAG[sp.tur].navn} sin tur.` : `Angret – ${LAG[sp.tur].navn} sin tur igjen.`, type: "angre" };
        R.si(sp.melding.tekst);
        if (S.skjerm !== "brett") {
          R.gaTil("brett");
          return;
        }
        R.vis();
        if (byttet) startTur(S);
      },

      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Avslutte spillet?", "Brettet og stillingen forsvinner. Dere kan alltid starte et nytt.", "Avslutt", "Fortsett")) || !fortsatt()) return;
        clearTimeout(sluttId);
        R.stoppTimere();
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },

      // The code master's phone
      tatt(el, e, S) {
        const g = S.gjest;
        const i = Number(el.dataset.v);
        if (!g || !(i >= 0 && i < ANTALL)) return;
        g.tatt = g.tatt.includes(i) ? g.tatt.filter((x) => x !== i) : [...g.tatt, i];
        R.vis();
      },
      skjul(el, e, S) {
        S.gjest.skjult = !S.gjest.skjult;
        R.vis();
      },
      async "gjest-neste"(el, e, S) {
        const g = S.gjest;
        if (g.brett >= MAKS_BRETT) {
          R.toast("Skann den nye koden fra brettet");
          return;
        }
        const fortsatt = R.vakt();
        if (!(await R.bekreft(`Gå til brett ${g.brett + 2}?`, `Gjør det når skjermen med brettet viser «Brett ${g.brett + 2}».`, "Neste brett", "Avbryt")) || !fortsatt()) return;
        g.brett += 1;
        g.start = 1 - g.start;
        g.tatt = [];
        g.skjult = false;
        R.lyd.snu();
        R.vis();
        window.scrollTo(0, 0);
        R.toast(`Brett ${g.brett + 1} – sjekk at ordene stemmer med brettet`);
      },
      "gjest-forrige"(el, e, S) {
        const g = S.gjest;
        if (g.brett <= 0) return;
        g.brett -= 1;
        g.start = 1 - g.start;
        g.tatt = [];
        R.vis();
        window.scrollTo(0, 0);
        R.toast(`Tilbake til brett ${g.brett + 1}`);
      },
    }),
  });
})();
