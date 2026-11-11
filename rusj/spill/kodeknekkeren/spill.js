/* Kodeknekkeren — "Kodeord i lag".
   «Lag mot lag»: two teams (Rosa and Blå) share one 5×5 board of words. Each team has a code master
   who knows which words are the team's agents and gives one word and a number as a hint; the team
   taps words on the board. A match is one board, best of three, or as long as the group likes.
   «Sammen mot fella»: co-op for 2–4. One code master, nine agents, fifteen neutral words, one
   trap and seven hints; the result is a record to beat.
   The code masters see the key either on their own phone (a join code / QR that holds the seed,
   board number, starting team and word level, salted with the word bank's hash) or behind a
   hold-to-reveal card on the board device. No network: the code holds it all. */
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
  const ROSA = 0; // in «Sammen mot fella» type 0 is simply «agent»
  const BLA = 1;
  const NOYTRAL = 2;
  const FELLE = 3;
  const AGENTER = 9; // «Sammen mot fella»: nine agents …
  const HINT = 7; // … and seven hints
  // Teams are always «Lag Rosa» / «Lag Blå» in text (shared wording on rusj.no).
  const LAG = [
    { navn: "Lag Rosa", kort: "Rosa", klasse: "rosa", token: "--rosa", knapp: "rosa" },
    { navn: "Lag Blå", kort: "Blå", klasse: "bla", token: "--himmel", knapp: "himmel" },
  ];
  const KITLAG = [0, 2]; // the kit's own team list is Rosa, Gul, Blå, Grønn (for «Kveldens gjeng»)
  const TID = [0, 60, 120, 180];
  const KAMPER = ["ett", "best3", "fri"];
  const KAMPNAVN = { ett: "Ett brett", best3: "Best av 3", fri: "Fri kamp" };
  const GRENSER = { lag: [4, 20], sammen: [2, 4] }; // players, when the group types its names
  const UENDELIG = 99;
  const TALL = [1, 2, 3, 4, 5, UENDELIG]; // the number in a hint
  const TALLORD = ["null", "ett", "to", "tre", "fire", "fem", "seks"];
  // «Sammen mot fella»: what the group is called for the agents it found.
  const STIGE = [
    { til: 3, omrade: "0–3", tittel: "Spionlærlinger", tekst: "Alle mesterspioner har startet akkurat her." },
    { til: 6, omrade: "4–6", tittel: "Lovende spioner", tekst: "Dere er på sporet. Litt dristigere hint neste gang?" },
    { til: 8, omrade: "7–8", tittel: "Skarpe spioner", tekst: "Så nær! Bare litt igjen til mesterklassen." },
    { til: 9, omrade: "9", tittel: "Mesterspioner", tekst: "Alle ni funnet – fella fikk aldri sjansen." },
  ];

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
  // can't simply be part of a word on the board) and the key. «Lag mot lag»: 9 for the starting
  // team, 8 for the other, 7 neutral and 1 trap. «Sammen mot fella»: 9 agents, 15 neutral, 1 trap.
  function lagBrett(fro, brett, start, lett, sammen) {
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
    if (sammen) {
      for (let i = 0; i < AGENTER; i++) typer.push(ROSA);
      for (let i = 0; i < ANTALL - AGENTER - 1; i++) typer.push(NOYTRAL);
    } else {
      for (let i = 0; i < 9; i++) typer.push(start);
      for (let i = 0; i < 8; i++) typer.push(1 - start);
      for (let i = 0; i < 7; i++) typer.push(NOYTRAL);
    }
    typer.push(FELLE);
    return { ord: valgt.map((v) => v.o), nokkel: R.stokk(typer, tilfeldig) };
  }

  // ---------- Join code ----------
  // seed (27 bits) · board number 0–63 (6) · starting team (1) · easy words (1) = 8 characters.
  // The salt includes the word bank's hash: a code made with another word list is rejected.
  // «Sammen mot fella» has its own salt (the starting-team bit is 0 there), so the code also says
  // which mode the key is for — and an older copy of this page rejects it instead of guessing.
  const BREDDER = [27, 6, 1, 1];
  const SALT = "kodeknekkeren:" + BANK;
  const SALT_SAMMEN = "kodeknekkeren:sammen:" + BANK;
  const MAKS_BRETT = 63;
  const MAKS_FRO = 2 ** 27 - 1;
  const KODELENGDE = R.kode.lengde(BREDDER);
  const erSammen = (x) => !!x && x.modus === "sammen";
  const lagKode = (b) => R.kode.lag([b.fro, b.brett, erSammen(b) ? 0 : b.start, b.lett ? 1 : 0], BREDDER, erSammen(b) ? SALT_SAMMEN : SALT);
  function lesKode(tekst) {
    let v = R.kode.les(tekst, BREDDER, SALT);
    if (v) return { modus: "lag", fro: v[0], brett: v[1], start: v[2], lett: v[3] === 1 };
    v = R.kode.les(tekst, BREDDER, SALT_SAMMEN);
    return v && v[2] === 0 ? { modus: "sammen", fro: v[0], brett: v[1], start: 0, lett: v[3] === 1 } : null;
  }
  const kanLenke = !R.iRamme && /^https?:$/.test(location.protocol);
  // A seed for a new chain of boards. One code in 32 passes the check of the other mode by chance;
  // a co-op seed is only used if none of its 64 codes does, so a key is never read in the wrong mode.
  function nyttFro(sammen, lett) {
    let fro = 0;
    for (let n = 0; n < 400; n++) {
      fro = R.nyttFro() % 2 ** 27;
      if (!sammen) return fro;
      let ok = true;
      for (let b = 0; b <= MAKS_BRETT && ok; b++) ok = !R.kode.les(lagKode({ modus: "sammen", fro, brett: b, lett }), BREDDER, SALT);
      if (ok) return fro;
    }
    return fro;
  }

  // ---------- The game on the board device ----------
  // S.spill is one board plus what belongs to the match around it (score, teams, code masters).
  // Everything that happens on the board is a step in `hist` (the undo stack):
  //   { t: "kort", i, tur }   a card was turned by the team on turn
  //   { t: "ferdig", tur }    «Lag X er ferdig» / «Neste hint»
  //   { t: "tid", tur }       the turn clock ran out
  //   { t: "hint", tur, forrige }  a hint was written on the strip (forrige: the one it replaced)
  // Steps that end a turn also keep the hint that was on the strip (`hint`), so undo brings it back.

  const over = (sp) => sp.grunn != null; // the board is finished: "alle" | "fella" | "hint"
  const igjen = (sp, type) => sp.nokkel.reduce((n, t, i) => n + (t === type && !sp.vist.includes(i) ? 1 : 0), 0);
  const funnet = (sp) => AGENTER - igjen(sp, ROSA); // «Sammen mot fella»
  // Did this step end a turn (in co-op: a hint)?
  const erBytte = (sp, h) => h.t !== "hint" && (h.t !== "kort" || sp.nokkel[h.i] !== (erSammen(sp) ? ROSA : h.tur));
  function turStart(sp) {
    for (let j = sp.hist.length - 1; j >= 0; j--) if (erBytte(sp, sp.hist[j])) return j + 1;
    return 0;
  }
  // The cards turned in the turn that starts at step `fra` (the last one may have ended it).
  function turKort(sp, fra) {
    const ut = [];
    for (let j = fra; j < sp.hist.length; j++) {
      const h = sp.hist[j];
      if (h.t === "kort") ut.push(h.i);
      if (erBytte(sp, h)) break;
    }
    return ut;
  }
  const brukt = (sp) => turKort(sp, turStart(sp)).length; // right guesses so far in this turn
  // «Sammen mot fella»: which hint the group is on (after the end: how many hints it took).
  function hintNr(sp) {
    const bytter = sp.hist.filter((h) => erBytte(sp, h)).length;
    return over(sp) && sp.grunn !== "alle" ? Math.max(1, bytter) : Math.min(HINT, bytter + 1);
  }

  // What the steps on a board add up to. Saved games are checked against this when they are loaded.
  function spillAv(sp) {
    const sammen = erSammen(sp);
    const vist = [];
    const igjenAv = (type) => sp.nokkel.reduce((n, t, i) => n + (t === type && !vist.includes(i) ? 1 : 0), 0);
    let tur = sammen ? 0 : sp.start;
    let vinner = null;
    let grunn = null;
    let bytter = 0;
    for (const h of sp.hist) {
      if (grunn || h.tur !== tur) return null;
      if (h.t === "hint") continue;
      if (h.t === "kort") {
        if (vist.includes(h.i)) return null;
        vist.push(h.i);
        const type = sp.nokkel[h.i];
        if (type === FELLE) {
          grunn = "fella";
          if (!sammen) vinner = 1 - tur;
          continue;
        }
        const ferdig = sammen ? (igjenAv(ROSA) === 0 ? ROSA : null) : igjenAv(ROSA) === 0 ? ROSA : igjenAv(BLA) === 0 ? BLA : null;
        if (ferdig != null) {
          grunn = "alle";
          if (!sammen) vinner = ferdig;
          continue;
        }
        if (type === (sammen ? ROSA : tur)) continue;
      }
      bytter += 1;
      if (!sammen) tur = 1 - tur;
      else if (bytter >= HINT) grunn = "hint";
    }
    return { vist, tur, vinner, grunn };
  }

  const navnPa = (sp, i) => (sp.navn && sp.navn[i]) || `Spiller ${i + 1}`;
  // The code masters of this board when the group has typed its names: one per team, or one in
  // co-op. A new one every board, in turn.
  function mestere(sp) {
    if (!sp.navn) return null;
    if (erSammen(sp)) return [(sp.mstart[0] + sp.mnr) % sp.antall];
    return sp.lag.map((medlemmer, l) => medlemmer[(sp.mstart[l] + sp.mnr) % medlemmer.length]);
  }
  // «Kari» when the game knows who it is, otherwise «Kodemesteren».
  function mesterNavn(sp, lag) {
    const m = mestere(sp);
    return m ? navnPa(sp, m[erSammen(sp) ? 0 : lag]) : "Kodemesteren";
  }

  function startMelding(sp) {
    if (erSammen(sp)) return { tekst: `Hint 1 av ${HINT}. ${mesterNavn(sp)} gir ett ord og et tall.`, type: "tur" };
    return { tekst: `${LAG[sp.start].navn} begynner. ${mesterNavn(sp, sp.start)} gir ett ord og et tall.`, type: "tur" };
  }

  // o: { modus, kamp, fro, brett, start, lett, tid, stilling, spilt, navn, lag, antall, mnr, mstart, beste }
  function nyttBrett(o) {
    const sammen = o.modus === "sammen";
    const start = sammen ? 0 : o.start;
    const b = lagBrett(o.fro, o.brett, start, o.lett, sammen);
    const sp = {
      hash: BANK,
      modus: sammen ? "sammen" : "lag",
      kamp: sammen ? "ett" : o.kamp, // "ett" | "best3" | "fri"
      fro: o.fro,
      brett: o.brett,
      start,
      lett: !!o.lett,
      tid: o.tid,
      ord: b.ord,
      nokkel: b.nokkel,
      vist: [], // revealed cards, in order
      tur: start,
      vinner: null,
      grunn: null, // "alle" (every agent found) | "fella" | "hint" (co-op: the seventh hint is used)
      hist: [],
      hint: null, // the hint on the strip in this turn: { ord, n }
      utkast: "", // the word being typed on the strip
      redigerer: false,
      hintlogg: [], // «Hintene så langt»: { lag, nr, ord, n, fra (the step where that turn starts) }
      stilling: o.stilling || [0, 0], // boards won in the match
      spilt: o.spilt || 0, // boards finished in the match
      beste: o.beste || null, // the best hint of the match so far
      navn: o.navn || null, // the players' names when the group typed them (a copy: the match keeps its names)
      lag: o.lag || null, // the two teams as lists of player numbers
      antall: o.antall || 0,
      mnr: o.mnr || 0, // which turn of code masters this board is
      mstart: o.mstart || [0, 0],
      ferdig: false, // «Kåringen» has been shown: the match is over and registered
      avbrutt: false,
      rekord: "", // co-op, set at «Kåringen»: "forste" | "ny" | ""
      feire: false,
      melding: null,
      sist: null, // the card that was just revealed (animates once)
    };
    sp.melding = startMelding(sp);
    return sp;
  }

  const gjeng = () => R.felles.navn.filter((n) => String(n || "").trim()).length;
  const standardAntall = (modus) => R.klamp(gjeng() || GRENSER[modus][0], GRENSER[modus][0], GRENSER[modus][1]);

  // Keep one team value per player, balanced as players come and go.
  function ordneLag(S) {
    const o = S.oppsett;
    o.lag = (o.lag || []).slice(0, S.antall).map((l) => (l === 1 ? 1 : 0));
    while (o.lag.length < S.antall) {
      const rosa = o.lag.filter((l) => l === 0).length;
      o.lag.push(rosa > o.lag.length - rosa ? 1 : 0);
    }
  }

  function startHindring(S) {
    const o = S.oppsett;
    if (o.modus === "lag" && o.navn) {
      ordneLag(S);
      const rosa = o.lag.filter((l) => l === 0).length;
      if (rosa < 2 || S.antall - rosa < 2) return "Hvert lag trenger minst to spillere.";
    }
    return "";
  }

  // A new match (or co-op game) from the setup.
  function nyKamp(S) {
    const o = S.oppsett;
    const sammen = o.modus === "sammen";
    let navn = null;
    let lag = null;
    let antall = 0;
    if (o.navn) {
      antall = R.klamp(S.antall, GRENSER[o.modus][0], GRENSER[o.modus][1]);
      navn = Array.from({ length: antall }, (_, i) => R.navn(i));
      if (!sammen) {
        ordneLag(S);
        lag = [0, 1].map((l) => o.lag.map((x, i) => (x === l ? i : -1)).filter((i) => i >= 0));
      }
    }
    return nyttBrett({
      modus: o.modus,
      kamp: o.kamp,
      fro: nyttFro(sammen, o.lett),
      brett: 0,
      start: R.nyttFro() % 2,
      lett: o.lett,
      tid: o.tid,
      navn,
      lag,
      antall,
      mstart: [R.nyttFro() % 60, R.nyttFro() % 60],
    });
  }

  // The next board of the same chain (so «Neste brett» on a code master's phone gives its key).
  // nyKampen: the score starts again («Spill igjen»).
  function nesteBrett(sp, nyKampen) {
    let fro = sp.fro;
    let brett = sp.brett + 1;
    if (brett > MAKS_BRETT) {
      fro = nyttFro(erSammen(sp), sp.lett);
      brett = 0;
    }
    return nyttBrett({
      modus: sp.modus,
      kamp: sp.kamp,
      fro,
      brett,
      start: 1 - sp.start,
      lett: sp.lett,
      tid: sp.tid,
      stilling: nyKampen ? [0, 0] : sp.stilling.slice(),
      spilt: nyKampen ? 0 : sp.spilt,
      beste: nyKampen ? null : besteAv(sp),
      navn: sp.navn,
      lag: sp.lag,
      antall: sp.antall,
      mnr: sp.mnr + 1,
      mstart: sp.mstart,
    });
  }

  // Is the match decided by the board that just ended?
  const avgjort = (sp) => over(sp) && (erSammen(sp) || sp.kamp === "ett" || (sp.kamp === "best3" && Math.max(sp.stilling[0], sp.stilling[1]) >= 2));
  const stillingTekst = (sp) => `${LAG[0].navn} ${sp.stilling[0]} – ${sp.stilling[1]} ${LAG[1].navn}`;

  // The best hint of the match: the one the team got most right guesses from in one turn (two or
  // more), the earliest if several did. Looked at when a board is left for good.
  function besteAv(sp) {
    let best = sp.beste;
    const m = mestere(sp);
    for (const p of sp.hintlogg) {
      const treff = turKort(sp, p.fra).filter((i) => sp.nokkel[i] === (erSammen(sp) ? ROSA : p.lag)).length;
      if (treff >= 2 && (!best || treff > best.treff)) best = { treff, ord: p.ord, n: p.n, lag: p.lag, mester: m ? navnPa(sp, m[erSammen(sp) ? 0 : p.lag]) : "" };
    }
    return best;
  }

  // A turn timer (optional). It restarts whenever the turn changes, and waits while the phone is
  // locked or the page is hidden (it used to keep passing the turn on in the pocket).
  let pausetAvSkjul = false;
  function stoppTur() {
    const gammel = R.timer("kk-tid");
    if (gammel) gammel.stopp();
    pausetAvSkjul = false;
  }
  function startTur(S) {
    const sp = S.spill;
    stoppTur();
    if (!sp || !sp.tid || over(sp)) return;
    const t = new R.Timer({ id: "kk-tid", sekunder: sp.tid, vedSlutt: () => tidenUte(S) }).start();
    if (document.hidden) {
      t.pause();
      pausetAvSkjul = true;
    }
  }
  document.addEventListener("visibilitychange", () => {
    const t = R.timer("kk-tid");
    if (document.hidden) {
      if (t && t.kjorer) {
        t.pause();
        pausetAvSkjul = true;
      }
    } else if (pausetAvSkjul) {
      pausetAvSkjul = false;
      if (t && !t.kjorer && !t.ferdig) t.start();
    }
  });

  // A turn (or a co-op hint) is over: the strip is empty for the next hint.
  function tomHint(sp) {
    sp.hint = null;
    sp.utkast = "";
    sp.redigerer = false;
  }

  // «Sammen mot fella»: hint number `nr` is over. The next one starts, or — after the seventh —
  // the board ends. forst: what happened («Tiden er ute!», ««Frost» var nøytralt.»), type: its look.
  function hintSlutt(S, nr, forst, type) {
    const sp = S.spill;
    tomHint(sp);
    if (nr >= HINT) {
      sp.grunn = "hint";
      sp.spilt += 1;
      S.laert = true;
      sp.melding = { tekst: forst ? `${forst.replace(/[.!]$/, "")} – og det var siste hint.` : "Det var siste hint.", type };
      R.si(sp.melding.tekst);
      stoppTur();
      R.vis();
      tilResultatOm(1400);
      return;
    }
    sp.melding = { tekst: forst ? `${forst} Hint ${nr + 1} av ${HINT} – nytt ord og tall.` : `Hint ${nr + 1} av ${HINT}. ${mesterNavn(sp)} gir ett ord og et tall.`, type };
    R.si(sp.melding.tekst);
    R.vis();
    startTur(S);
  }

  function tidenUte(S) {
    const sp = S.spill;
    if (!sp || over(sp) || S.skjerm !== "brett") return;
    const nr = hintNr(sp);
    sp.hist.push({ t: "tid", tur: sp.tur, hint: sp.hint });
    if (erSammen(sp)) {
      hintSlutt(S, nr, "Tiden er ute!", "tid");
      return;
    }
    tomHint(sp);
    sp.tur = 1 - sp.tur;
    sp.melding = { tekst: `Tiden er ute! Nå er det ${LAG[sp.tur].navn} sin tur.`, type: "tid" };
    R.si(sp.melding.tekst);
    R.vis();
    startTur(S);
  }

  let sluttId = null;
  function tilResultatOm(ms) {
    clearTimeout(sluttId);
    const fortsatt = R.vakt();
    sluttId = setTimeout(() => {
      sluttId = null;
      const S = R.S;
      if (fortsatt() && S.spill && over(S.spill) && !S.spill.ferdig && S.skjerm === "brett") R.gaTil("resultat");
    }, R.rolig() ? 500 : ms);
  }

  // The "install as an app" tip at a calm moment – only if the group is still on the end screen.
  // (The kit shows it after R.kveld.registrer; co-op games have no evening score and call it here.)
  function visTipsSnart() {
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.visInstallTips(), 2500);
  }

  // «Kåringen»: the match (or the co-op game) is over. The first time it is registered — in
  // «Kveldens gjeng» for teams, as a record for co-op — and never again after a reload.
  function tilKaring(S, avbrutt) {
    const sp = S.spill;
    clearTimeout(sluttId);
    stoppTur();
    if (!sp.ferdig) {
      sp.ferdig = true;
      sp.avbrutt = !!avbrutt;
      sp.beste = besteAv(sp);
      tomHint(sp);
      const sammen = erSammen(sp);
      R.statistikk("ferdig", Object.assign({ modus: sp.modus, runder: sp.spilt, avbrutt: sp.avbrutt }, sammen ? { funnet: funnet(sp) } : {}));
      if (sammen) {
        // More agents is better, then fewer hints. A game that was ended early sets no record.
        sp.rekord = "";
        if (over(sp)) {
          const ny = { f: funnet(sp), h: hintNr(sp) };
          if (!S.rekord) sp.rekord = "forste";
          else if (ny.f > S.rekord.f || (ny.f === S.rekord.f && ny.h < S.rekord.h)) sp.rekord = "ny";
          if (sp.rekord) S.rekord = ny;
        }
      } else if (sp.spilt > 0) {
        R.kveld.registrer(
          sp.navn
            ? sp.lag.flatMap((medlemmer, l) => medlemmer.map((i) => ({ navn: navnPa(sp, i), poeng: sp.stilling[l] })))
            : [0, 1].map((l) => ({ lag: KITLAG[l], poeng: sp.stilling[l] })),
        );
      }
      sp.feire = true;
    }
    R.gaTil("karing");
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

  const typeNavn = (type, sammen) => (type === FELLE ? "fella" : type === NOYTRAL ? "nøytralt ord" : sammen ? "agent" : `agent for ${LAG[type].navn}`);
  // A letter in the corner, so the key never depends on telling colours apart:
  // R and B for the teams (A for the agents in co-op), ✕ for the trap, nothing for neutral words.
  const bokstav = (type, sammen) => (type === FELLE ? "✕" : type === NOYTRAL ? "" : sammen ? "A" : type === ROSA ? "R" : "B");
  function merke(type, sammen) {
    const b = bokstav(type, sammen);
    return b ? `<i class="kk-b" aria-hidden="true">${b}</i>` : "";
  }

  function kortHtml(sp, i, o) {
    const sammen = erSammen(sp);
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
    const etikett = synlig ? `${ord}: ${typeNavn(type, sammen)}${fasit ? " (ikke tatt)" : ""}` : ord;
    // A taken card stays focusable (aria-disabled, not disabled), so keyboard focus doesn't fall
    // out of the board when the card flips; taps on it are ignored in the «kort» action.
    return `<button class="${klasser.join(" ")}" data-h="kort" data-v="${i}"${synlig || o.fasit ? ' aria-disabled="true" data-stille' : ""} aria-label="${esc(etikett)}">${
      synlig ? `<span class="kk-ikon">${ikonFor(type)}</span>${merke(type, sammen)}` : ""
    }${ordHtml(ord)}</button>`;
  }

  function brettHtml(sp, o = {}) {
    const farge = erSammen(sp) ? "sammen" : `lag-${LAG[sp.vinner != null ? sp.vinner : sp.tur].klasse}`;
    return `<div class="kk-brett ${farge}${o.fasit ? " med-fasit" : ""}" role="group" aria-label="Brettet: 25 ord">${sp.ord.map((_, i) => kortHtml(sp, i, o)).join("")}</div>`;
  }

  function timerHtml(sp) {
    if (!sp.tid || over(sp)) return "";
    const t = R.timer("kk-tid");
    const igjenSek = t ? t.igjen : sp.tid;
    const omkrets = 2 * Math.PI * 54;
    return `<button class="kk-timer${t && !t.kjorer && !t.ferdig ? " pause" : ""}" id="kk-tid" data-h="timer-veksle" data-v="kk-tid" aria-label="Tidsur – trykk for pause">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="spor" cx="60" cy="60" r="54"/><circle class="fyll" cx="60" cy="60" r="54" style="stroke-dasharray:${omkrets};stroke-dashoffset:${omkrets * (1 - igjenSek / sp.tid)}"/></svg>
      <span class="timer-tid">${R.formaterTid(igjenSek)}</span>
    </button>`;
  }

  function statusHtml(sp) {
    if (erSammen(sp)) {
      const nr = hintNr(sp);
      const etter = HINT - nr;
      return `<div class="kk-status sammen">
        <div class="kk-lag agent aktiv">
          <span class="kk-lag-navn">Agenter</span>
          <b class="kk-lag-tall">${igjen(sp, ROSA)}</b>
          <span class="kk-lag-tekst">igjen</span>
        </div>
        <div class="kk-tur">
          <b>${over(sp) ? (sp.grunn === "alle" ? "Alle funnet!" : sp.grunn === "fella" ? "Fella!" : "Siste hint brukt") : `<span class="kk-nb">Hint ${nr}</span> <span class="kk-nb">av ${HINT}</span>`}</b>
          ${timerHtml(sp)}
        </div>
        <div class="kk-lag hintboks${etter ? "" : " tom"}">
          <span class="kk-lag-navn">Hint</span>
          <b class="kk-lag-tall">${etter}</b>
          <span class="kk-lag-tekst">igjen</span>
        </div>
      </div>`;
    }
    const boks = (l) => {
      const aktiv = !over(sp) && sp.tur === l;
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
        ${sp.vinner == null ? `<span class="kk-tur-pil" aria-hidden="true">${sp.tur === ROSA ? "◀" : "▶"}</span><b><span class="kk-nb">${tur.navn}</span> <span class="kk-nb">sin tur</span></b>` : `<b><span class="kk-nb">${LAG[sp.vinner].navn}</span> <span class="kk-nb">tok brettet!</span></b>`}
        ${timerHtml(sp)}
      </div>
      ${boks(BLA)}
    </div>`;
  }

  function meldingHtml(sp) {
    const m = sp.melding || startMelding(sp);
    const ikon = { riktig: "✓", feil: "✗", noytral: "–", felle: "💥", tid: "⏰", tur: "💬", angre: "↶" }[m.type] || "";
    return `<p class="kk-melding ${esc(m.type)}"><span><span class="kk-melding-ikon" aria-hidden="true">${ikon}</span>${esc(m.tekst)}</span></p>`;
  }

  // ---------- The hint strip ----------
  // Optional: the group taps the number the code master said (and may type the word). The board
  // then shows «HAV · 2 – to forsøk igjen (+1)» and counts down as cards are turned.

  const tallTegn = (n) => (n === UENDELIG ? "∞" : String(n));
  const hintHode = (h) => [h.ord ? h.ord.toLocaleUpperCase("nb") : "", h.n == null ? "" : tallTegn(h.n)].filter(Boolean).join(" · ");
  // What is left of the hint on the strip. brukt: the guesses are used (the main button lights up).
  function hintRest(sp) {
    const h = sp.hint;
    if (!h || h.n == null) return { tekst: "", brukt: false };
    if (h.n === UENDELIG) return { tekst: "så mange forsøk dere vil", brukt: false };
    const sammen = erSammen(sp);
    const rest = h.n - brukt(sp);
    if (rest > 0) return { tekst: `${TALLORD[rest]} forsøk igjen${sammen ? "" : " (+1)"}`, brukt: false };
    if (rest === 0 && !sammen) return { tekst: "ekstraforsøket igjen", brukt: false };
    return { tekst: sammen ? "forsøkene er brukt" : `${LAG[sp.tur].navn} er ferdig`, brukt: true };
  }

  function hintHtml(sp) {
    const farge = erSammen(sp) ? "sammen" : `lag-${LAG[sp.tur].klasse}`;
    const h = sp.hint;
    if (h && !sp.redigerer) {
      const rest = hintRest(sp);
      const lest = `Hintet: ${hintHode(h).replace(" · ", ", ").replace("∞", "uendelig")}.${rest.tekst ? ` ${rest.tekst.replace("(+1)", "pluss ett ekstra")}.` : ""} Trykk for å endre.`;
      return `<div class="kk-hint satt ${farge}${rest.brukt ? " brukt" : ""}">
        <button class="kk-hint-vis" id="kk-hint-vis" data-h="hint-endre" aria-label="${esc(lest)}"><b>${esc(hintHode(h))}</b>${rest.tekst ? `<span>${esc(rest.tekst)}</span>` : ""}<i aria-hidden="true">✎</i></button>
      </div>`;
    }
    return `<form class="kk-hint ${farge}" data-skjema="hint" autocomplete="off" novalidate>
      <label class="vh" for="kk-hintfelt">Hintet fra kodemesteren (valgfritt)</label>
      <input class="kk-hintfelt" id="kk-hintfelt" name="hint" data-felt="hint" maxlength="20" placeholder="Hint" autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="done" value="${esc(sp.utkast || "")}">
      <div class="kk-tall" role="group" aria-label="Tallet i hintet">${TALL.map(
        (n) => `<button type="button" data-h="hint-tall" data-v="${n}" aria-pressed="${!!(sp.redigerer && h && h.n === n)}"${n === UENDELIG ? ' aria-label="Uendelig"' : ""}>${tallTegn(n)}</button>`,
      ).join("")}</div>
    </form>`;
  }

  // Write the hint on the strip. o.n: the number that was tapped (without it: the word alone, or
  // a new word for the number that is already there).
  function settHint(S, o) {
    const sp = S.spill;
    if (!sp || over(sp)) return;
    const felt = R.$("#kk-hintfelt");
    const ord = R.kutt(String(felt ? felt.value : sp.utkast || "").replace(/\s+/g, " ").trim(), 20);
    const n = "n" in o ? o.n : sp.hint ? sp.hint.n : null;
    if (!ord && n == null) return;
    const forrige = sp.hint;
    sp.utkast = "";
    sp.redigerer = false;
    if (!forrige || forrige.ord !== ord || forrige.n !== n) {
      sp.hist.push({ t: "hint", tur: sp.tur, forrige });
      sp.hint = { ord, n };
      const post = { lag: sp.tur, nr: hintNr(sp), ord, n, fra: turStart(sp) };
      if (forrige) sp.hintlogg[sp.hintlogg.length - 1] = post;
      else sp.hintlogg.push(post);
      R.si(`Hint: ${hintHode(sp.hint).replace(" · ", ", ").replace("∞", "uendelig")}.`);
      R.lyd.pop();
      // The classic rule: the hint can't be one of the words on the table.
      const norm = R.normaliser(ord);
      if (norm && sp.ord.some((w, i) => !sp.vist.includes(i) && R.normaliser(w) === norm)) R.toast("Hintet kan ikke være et ord på brettet", { topp: true });
    }
    R.vis();
    const vis = R.$("#kk-hint-vis");
    if (vis) vis.focus({ preventScroll: true });
  }

  function visHintArk(S) {
    const sp = S.spill;
    const sammen = erSammen(sp);
    const tegn = (i, p) => {
      const type = sp.nokkel[i];
      if (type === FELLE) return ["💥", "fella"];
      if (type === NOYTRAL) return ["–", "nøytralt"];
      return type === (sammen ? ROSA : p.lag) ? ["✓", "riktig"] : ["✗", `agent for ${LAG[type].navn}`];
    };
    const rader = sp.hintlogg
      .map((p) => {
        const kort = turKort(sp, p.fra);
        return `<li class="${sammen ? "sammen" : LAG[p.lag].klasse}">
          <span class="kk-logg-hvem">${sammen ? `Hint ${p.nr}` : LAG[p.lag].navn}</span>
          <b>${esc(hintHode(p))}</b>
          <span class="kk-logg-kort">${
            kort.length
              ? kort
                  .map((i) => {
                    const [t, lest] = tegn(i, p);
                    return `<span>${esc(sp.ord[i])} <span aria-hidden="true">${t}</span><span class="vh">(${lest})</span></span>`;
                  })
                  .join("")
              : "Ingen kort snudd ennå"
          }</span>
        </li>`;
      })
      .reverse()
      .join("");
    const m = mestere(sp);
    R.ark(`
      <h2 id="ark-tittel">Hintene så langt</h2>
      <p class="ingress">Brett ${sp.brett + 1}${m ? ` · ${sammen ? "kodemester" : "kodemestere"}: ${esc(R.ramsOpp(m.map((i) => navnPa(sp, i))))}` : ""}. Det nyeste står øverst.</p>
      ${rader ? `<ol class="kk-logg" reversed>${rader}</ol>` : '<p class="hjelp">Ingen hint er skrevet inn på dette brettet.</p>'}
      <button class="knapp-2" data-h="lukk-ark">Lukk</button>`);
  }

  // ---------- The first board on this phone: a three-frame example ----------

  const visEksempel = (S) => !S.laert && !!S.spill && !S.spill.hist.length && !over(S.spill);
  function eksempelHtml(sp) {
    const kort = (ord, klasse) => `<i${klasse ? ` class="${klasse}"` : ""}>${ord}</i>`;
    const farge = erSammen(sp) ? "sammen" : `lag-${LAG[sp.tur].klasse}`;
    return `<section class="kk-eks ${farge}" aria-label="Eksempel: slik spiller dere">
      <div class="kk-eks-hode"><span class="etikett">Slik spiller dere</span><button class="kk-eks-lukk" data-h="eks-lukk" aria-label="Lukk eksempelet">✕</button></div>
      <ol>
        <li><span class="kk-eks-bilde" aria-hidden="true"><span class="kk-eks-boble">HAV, 2</span></span><span class="kk-eks-tekst">Kodemesteren sier «HAV, 2»</span></li>
        <li><span class="kk-eks-bilde" aria-hidden="true">${kort("Krabbe", "lys")}${kort("Sykkel")}${kort("Lampe")}${kort("Måke", "lys")}</span><span class="kk-eks-tekst">To av ordene passer</span></li>
        <li><span class="kk-eks-bilde" aria-hidden="true">${kort("Krabbe", "tatt")}${kort("Sykkel")}${kort("Lampe")}${kort("Måke", "tatt")}</span><span class="kk-eks-tekst">Laget trykker Krabbe og Måke</span></li>
      </ol>
    </section>`;
  }

  // The start as three dots: Lag → Nøkkel → Brett.
  const veiHtml = (na) =>
    `<ol class="kk-vei" aria-label="Veien til første hint">${["Lag", "Nøkkel", "Brett"]
      .map((t, i) => `<li class="${i < na ? "ferdig" : i === na ? "na" : ""}"${i === na ? ' aria-current="step"' : ""}><i aria-hidden="true">${i < na ? "✓" : i + 1}</i><span>${t}</span></li>`)
      .join("")}</ol>`;

  // ---------- The key ----------

  // The key as a small grid: used on the code master's phone and inside the hold-to-reveal card.
  function nokkelGrid(ord, nokkel, o = {}) {
    const tatt = o.tatt || [];
    return `<span class="kk-nokkel${o.sammen ? " sammen" : ""}">${ord
      .map((w, i) => {
        const t = tatt.includes(i);
        const klasse = `kk-n t${nokkel[i]} ${lengdeKlasse(w)}${t ? " tatt" : ""}`;
        const innhold = merke(nokkel[i], o.sammen) + ordHtml(w);
        return o.knapper
          ? `<button class="${klasse}" data-h="tatt" data-v="${i}" aria-pressed="${t}" aria-label="${esc(w)}: ${typeNavn(nokkel[i], o.sammen)}">${innhold}</button>`
          : `<span class="${klasse}">${innhold}</span>`;
      })
      .join("")}</span>`;
  }

  function fordeling(sp) {
    const sammen = erSammen(sp);
    const rad = (type, navn, n) => `<span><i class="t${type}">${bokstav(type, sammen)}</i>${navn}: ${n}</span>`;
    return `<span class="kk-fordeling${sammen ? " sammen" : ""}" aria-hidden="true">${
      sammen ? rad(ROSA, "Agenter", AGENTER) + rad(NOYTRAL, "Nøytrale", ANTALL - AGENTER - 1) : rad(sp.start, LAG[sp.start].navn, 9) + rad(1 - sp.start, LAG[1 - sp.start].navn, 8) + rad(NOYTRAL, "Nøytrale", 7)
    }${rad(FELLE, "Fella", 1)}</span>`;
  }

  // How the code masters get the key: join code + QR, or hold-to-reveal on this screen.
  function nokkelHtml(S) {
    const sp = S.spill;
    const sammen = erSammen(sp);
    const modus = S.oppsett.nokkel;
    const bytt = R.ui.lenkerad(
      modus === "mobil"
        ? R.ui.lenke("Ingen mobil? Vis nøkkelen på denne skjermen", "nokkelmodus", { v: "skjerm" })
        : R.ui.lenke(sammen ? "Bruk egen mobil i stedet (QR-kode)" : "Bruk egne mobiler i stedet (QR-kode)", "nokkelmodus", { v: "mobil" }),
    );
    if (modus === "mobil") {
      const kode = lagKode(sp);
      const qr = kanLenke ? R.kode.qr(R.kode.lenke(kode)) : "";
      return `<div class="kodekort kk-kodekort">
          <span class="etikett">Brett ${sp.brett + 1} · bare for ${sammen ? "kodemesteren" : "kodemesterne"}</span>
          ${qr ? `<div class="qr">${qr}</div>` : ""}
          <span class="kode" id="kk-kode" data-kode="${esc(kode)}">${esc(R.kode.formater(kode))}</span>
          <div class="knapprad">${R.ui.knapp2("Kopier kode", "kopier", { variant: "liten" })}${kanLenke ? R.ui.knapp2("Del lenke", "del-lenke", { variant: "liten" }) : ""}</div>
        </div>
        <ol class="steg kk-steg">
          <li><b>${qr ? "Skann QR-koden" : "Åpne Kodeknekkeren"}</b><span>${qr ? "Eller åpne Kodeknekkeren, trykk «Jeg er kodemester» og skriv koden." : "Trykk «Jeg er kodemester» og skriv koden."}</span></li>
          <li><b>${sammen ? "Hold mobilen for deg selv" : "Hold mobilen for dere selv"}</b><span>Nøkkelen viser hvilke ord som er agenter – og hvor fella er.</span></li>
        </ol>
        ${bytt}`;
    }
    return `${R.ui.mappe({ id: "nokkel", etikett: sammen ? "Kun kodemesteren!" : "Kun kodemestere!", tekst: "Hold fingeren på kortet for å se", etikettAria: `Hold fingeren på kortet for å se nøkkelen. Bare for ${sammen ? "kodemesteren" : "kodemestere"}.` })}
      <p class="hjelp">De andre ser bort. Nøkkelen kan åpnes igjen fra brettet med 🔑.</p>
      ${bytt}`;
  }

  // «Kari 🔑, Per og Lise»: the code master first, marked with the key.
  function lagliste(sp, l) {
    const m = mestere(sp)[l];
    return R.ramsOpp([m, ...sp.lag[l].filter((i) => i !== m)].map((i) => esc(navnPa(sp, i)) + (i === m ? ' <span aria-hidden="true">🔑</span><span class="vh">(kodemester)</span>' : "")));
  }

  // Who the code masters are, as a line of HTML ("" when the game doesn't know).
  function mesterLinje(sp) {
    const m = mestere(sp);
    if (!m) return "";
    if (erSammen(sp)) return `Kodemester nå: <b>${esc(navnPa(sp, m[0]))}</b>.`;
    return `Kodemestere nå: <b class="kk-farge rosa">${esc(navnPa(sp, m[0]))}</b> (${LAG[0].navn}) og <b class="kk-farge bla">${esc(navnPa(sp, m[1]))}</b> (${LAG[1].navn}).`;
  }

  function visNokkelArk(S) {
    const linje = mesterLinje(S.spill);
    R.ark(`
      <h2 id="ark-tittel">Nøkkelen · brett ${S.spill.brett + 1}</h2>
      ${linje ? `<p class="ingress">${linje}</p>` : ""}
      ${nokkelHtml(S)}
      <button class="knapp-2" data-h="lukk-ark">Lukk</button>`);
  }

  // ---------- Setup ----------

  function lageneHtml(S) {
    const o = S.oppsett;
    const kol = (l) => {
      const navn = [];
      for (let i = 0; i < S.antall; i++)
        if (o.lag[i] === l) navn.push(`<button class="kk-lagspiller" data-h="bytt-lag" data-v="${i}" aria-label="${esc(R.navn(i))} – flytt til ${LAG[1 - l].navn}">${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`);
      return `<div class="kk-lagkol ${LAG[l].klasse}"><h3>${LAG[l].navn} <span>${navn.length}</span></h3>${navn.join("") || '<p class="hjelp">Ingen ennå</p>'}</div>`;
    };
    return `<section class="seksjon">
      <div class="seksjon-hode"><h2>Lagene</h2><button class="lenke" data-h="stokk-lag">🔀 Stokk lagene</button></div>
      <div class="kk-lagene">${kol(0)}${kol(1)}</div>
      <p class="hjelp">Trykk på et navn for å bytte lag.</p>
    </section>`;
  }

  // ---------- Results ----------

  // Why the board ended («Lag mot lag»).
  function grunnTekst(sp) {
    const v = sp.vinner;
    if (sp.grunn === "fella") return `${LAG[1 - v].navn} trykket på fella.`;
    const siste = sp.hist[sp.hist.length - 1];
    return siste && siste.tur !== v ? `${LAG[1 - v].navn} snudde den siste agenten til ${LAG[v].navn}.` : `${LAG[v].navn} fant alle agentene sine.`;
  }

  const stillingHtml = (sp) =>
    `<p class="kk-stilling" aria-label="Stillingen: ${LAG[0].navn} ${sp.stilling[0]}, ${LAG[1].navn} ${sp.stilling[1]}"><span class="rosa">${LAG[0].navn} <b>${sp.stilling[0]}</b></span><span class="kk-strek">–</span><span class="bla"><b>${sp.stilling[1]}</b> ${LAG[1].navn}</span></p>`;

  const rekordTekst = (r) => (r.f === AGENTER ? `${r.f} av ${AGENTER} på ${r.h} hint` : `${r.f} av ${AGENTER}`);
  const trinnFor = (f) => STIGE.findIndex((t) => f <= t.til);

  // The line that is shared from «Kåringen»: the game, the result in numbers, never typed text.
  function deleTekst(sp) {
    if (erSammen(sp)) {
      const f = funnet(sp);
      return `Kodeknekkeren – Sammen mot fella: ${f} av ${AGENTER}${f === AGENTER ? ` på ${hintNr(sp)} hint` : ""} 🕵️ ${"✅".repeat(f)}${"▫️".repeat(AGENTER - f)}${sp.grunn === "fella" ? " 💥" : ""}`;
    }
    const [a, b] = sp.stilling;
    if (a === b) return `Kodeknekkeren: uavgjort ${a}–${b} mellom ${LAG[0].navn} og ${LAG[1].navn} 🕵️`;
    const v = a > b ? 0 : 1;
    const hvem = sp.navn && sp.lag[v].length <= 6 ? `\n${LAG[v].navn}: ${R.ramsOpp(sp.lag[v].map((i) => navnPa(sp, i)))}` : "";
    return `Kodeknekkeren: ${LAG[v].navn} vant ${sp.kamp === "ett" ? "brettet" : `${sp.stilling[v]}–${sp.stilling[1 - v]}`} 🕵️${hvem}`;
  }

  function prisHtml(sp) {
    const p = sp.beste;
    if (!p) return "";
    const hvem = [p.mester ? `gitt av ${p.mester}` : "", erSammen(sp) ? "" : LAG[p.lag].navn].filter(Boolean).join(", ");
    return `<div class="boks kk-pris">
      <p class="etikett">Beste hint</p>
      <p><b>${esc(hintHode(p))}</b> – ${TALLORD[p.treff] || p.treff} riktige på én tur${hvem ? ` <span>(${esc(hvem)})</span>` : ""}</p>
    </div>`;
  }

  function karingLag(sp) {
    const [a, b] = sp.stilling;
    const v = a === b ? null : a > b ? 0 : 1;
    const etikett = `${KAMPNAVN[sp.kamp]}${sp.avbrutt ? " · avsluttet" : ""}`;
    const antallBrett = `${sp.spilt} brett`;
    let banner;
    if (!sp.spilt) banner = R.ui.banner({ etikett, tittel: "Ingen vinner denne gangen", tekst: "Dere avsluttet før første brett var ferdig.", stemning: "" });
    else if (v == null) banner = R.ui.banner({ etikett, tittel: "Uavgjort!", tekst: `${a}–${b} etter ${antallBrett}. ${LAG[0].navn} og ${LAG[1].navn} deler seieren.`, klasse: "aksent" });
    else
      banner = R.ui.banner({
        etikett,
        tittel: `${LAG[v].navn} vinner!`,
        tekst: sp.spilt === 1 && over(sp) ? grunnTekst(sp) : `${sp.stilling[v]}–${sp.stilling[1 - v]} etter ${antallBrett}.`,
        klasse: `kk-banner ${LAG[v].klasse}`,
      });
    const lagkort = (l) => `<div class="kk-lagkort ${LAG[l].klasse}${v === l ? " vinner" : ""}">
        <h2>${LAG[l].navn}</h2>
        <p class="kk-lagkort-tall"><b>${sp.stilling[l]}</b> brett</p>
        ${sp.navn ? `<p class="kk-lagkort-navn">${esc(R.ramsOpp(sp.lag[l].map((i) => navnPa(sp, i))))}</p>` : ""}
      </div>`;
    return `${banner}
      ${sp.spilt ? `<div class="kk-lagkortene" role="group" aria-label="Stillingen">${lagkort(0)}${lagkort(1)}</div>` : ""}
      ${prisHtml(sp)}
      ${sp.spilt ? R.ui.knapp2("Del resultatet", "del") : ""}`;
  }

  function karingSammen(S, sp) {
    const f = funnet(sp);
    const h = hintNr(sp);
    const trinn = trinnFor(f);
    const ferdigSpilt = over(sp);
    const tall =
      sp.grunn === "alle"
        ? `Alle ${AGENTER} agentene på ${h} hint.`
        : sp.grunn === "fella"
          ? `${f} av ${AGENTER} agenter før fella klappet igjen på hint ${h}.`
          : sp.grunn === "hint"
            ? `${f} av ${AGENTER} agenter på ${HINT} hint.`
            : `${f} av ${AGENTER} agenter da dere avsluttet på hint ${h}.`;
    const m = mestere(sp);
    const rekord =
      sp.rekord === "ny"
        ? '<p class="kk-rekord ny">Ny rekord!</p>'
        : sp.rekord === "forste"
          ? '<p class="kk-rekord">Første runde – nå har dere en rekord å slå!</p>'
          : S.rekord
            ? `<p class="kk-rekord">Rekorden å slå: ${rekordTekst(S.rekord)}.</p>`
            : "";
    return `${R.ui.banner({
      etikett: `Sammen mot fella${sp.avbrutt ? " · avsluttet" : ""}`,
      tittel: ferdigSpilt ? `${STIGE[trinn].tittel}${trinn === STIGE.length - 1 ? "!" : ""}` : "Brettet ble avsluttet",
      tekst: tall,
      klasse: "aksent",
      stemning: !ferdigSpilt ? "" : sp.grunn === "fella" || trinn === 0 ? "lei" : trinn >= 2 ? "jubel" : "",
    })}
      <p class="kk-pips" role="img" aria-label="${f} av ${AGENTER} agenter funnet">${Array.from({ length: AGENTER }, (_, i) => `<i class="${i < f ? "funnet" : ""}"></i>`).join("")}${sp.grunn === "fella" ? '<i class="felle">✕</i>' : ""}</p>
      ${rekord}
      ${
        ferdigSpilt
          ? `<ol class="kk-stige" aria-label="Titlene dere kan få">${STIGE.map((t, i) => `<li class="${i === trinn ? "na" : ""}"${i === trinn ? ' aria-current="true"' : ""}><span>${t.omrade}</span><b>${t.tittel}</b>${i === trinn ? `<small>${t.tekst}</small>` : ""}</li>`).join("")}</ol>`
          : ""
      }
      ${m ? `<p class="hjelp">Kodemester på dette brettet: ${esc(navnPa(sp, m[0]))}.</p>` : ""}
      ${prisHtml(sp)}
      ${R.ui.knapp2("Del resultatet", "del")}`;
  }

  // ---------- The code master's phone ----------

  function nyGjest(k) {
    return { hash: BANK, modus: k.modus === "sammen" ? "sammen" : "lag", fro: k.fro, brett: k.brett, start: k.start, lett: k.lett, tatt: [], skjult: false };
  }

  let gjesteBrett = { nokkel: "", brett: null };
  function gjestensBrett(g) {
    const n = `${g.modus}:${g.fro}:${g.brett}:${g.start}:${g.lett}`;
    if (gjesteBrett.nokkel !== n) gjesteBrett = { nokkel: n, brett: lagBrett(g.fro, g.brett, g.start, g.lett, erSammen(g)) };
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

  // ---------- Saved state ----------

  const erObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const heltall = (x, min, maks) => Number.isInteger(x) && x >= min && x <= maks;
  const hintOk = (x) => erObj(x) && typeof x.ord === "string" && x.ord.length <= 80 && (x.n == null || TALL.includes(x.n));

  // A saved game, checked and tidied — or null when it can't be played on. The board comes from the
  // seed again, and turn, winner and revealed cards from the steps, so a damaged save can never
  // put the game in a state the rules don't allow. (Also brings games from before matches, hints
  // and «Sammen mot fella» up to date.)
  function gyldigSpill(sp) {
    if (!erObj(sp) || sp.hash !== BANK || !heltall(sp.fro, 0, MAKS_FRO) || !heltall(sp.brett, 0, MAKS_BRETT)) return null;
    const sammen = sp.modus === "sammen";
    const hist = Array.isArray(sp.hist) ? sp.hist : null;
    if (
      !hist ||
      hist.length > 200 ||
      !hist.every(
        (h) =>
          erObj(h) &&
          ["kort", "ferdig", "tid", "hint"].includes(h.t) &&
          (h.tur === 0 || h.tur === 1) &&
          (h.t !== "kort" || heltall(h.i, 0, ANTALL - 1)) &&
          (h.hint == null || hintOk(h.hint)) &&
          (h.forrige == null || hintOk(h.forrige)),
      )
    )
      return null;
    const start = sammen ? 0 : sp.start === 1 ? 1 : 0;
    const ny = nyttBrett({
      modus: sammen ? "sammen" : "lag",
      kamp: KAMPER.includes(sp.kamp) ? sp.kamp : "fri", // before matches had an end, they went on until «Avslutt»
      fro: sp.fro,
      brett: sp.brett,
      start,
      lett: sp.lett === true,
      tid: TID.includes(sp.tid) ? sp.tid : 0,
    });
    ny.hist = hist;
    const fasit = spillAv(ny);
    if (!fasit) return null;
    Object.assign(ny, fasit);
    const stilling = Array.isArray(sp.stilling) && sp.stilling.length === 2 && sp.stilling.every((n) => heltall(n, 0, 999)) ? sp.stilling.slice() : [0, 0];
    if (ny.vinner != null && stilling[ny.vinner] < 1) stilling[ny.vinner] = 1;
    ny.stilling = sammen ? [0, 0] : stilling;
    ny.spilt = Math.max(heltall(sp.spilt, 0, 9999) ? sp.spilt : 0, ny.stilling[0] + ny.stilling[1], over(ny) ? 1 : 0);
    // Names and teams: all of it fits, or the match goes on without names.
    const antall = heltall(sp.antall, GRENSER[ny.modus][0], GRENSER[ny.modus][1]) ? sp.antall : 0;
    const navn = antall && Array.isArray(sp.navn) && sp.navn.length === antall && sp.navn.every((n) => typeof n === "string") ? sp.navn.map((n) => R.kutt(n, 16)) : null;
    let lag = null;
    if (navn && !sammen && Array.isArray(sp.lag) && sp.lag.length === 2 && sp.lag.every((l) => Array.isArray(l) && l.length > 0 && l.every((i) => heltall(i, 0, antall - 1)))) {
      const alle = sp.lag[0].concat(sp.lag[1]);
      if (new Set(alle).size === alle.length) lag = sp.lag.map((l) => l.slice());
    }
    if (navn && (sammen || lag)) {
      ny.navn = navn;
      ny.lag = lag;
      ny.antall = antall;
      ny.mnr = heltall(sp.mnr, 0, 99999) ? sp.mnr : 0;
      ny.mstart = Array.isArray(sp.mstart) && sp.mstart.length === 2 && sp.mstart.every((n) => heltall(n, 0, 9999)) ? sp.mstart.slice() : [0, 0];
    }
    ny.ferdig = sp.ferdig === true;
    ny.avbrutt = ny.ferdig && sp.avbrutt === true;
    ny.rekord = ny.ferdig && (sp.rekord === "ny" || sp.rekord === "forste") ? sp.rekord : "";
    ny.feire = false;
    if (!over(ny) && !ny.ferdig) {
      ny.hint = hintOk(sp.hint) ? { ord: R.kutt(sp.hint.ord, 20), n: sp.hint.n == null ? null : sp.hint.n } : null;
      ny.utkast = typeof sp.utkast === "string" ? R.kutt(sp.utkast, 20) : "";
      ny.redigerer = sp.redigerer === true && !!ny.hint;
    }
    ny.hintlogg = Array.isArray(sp.hintlogg) && sp.hintlogg.length <= 60 && sp.hintlogg.every((p) => hintOk(p) && (p.lag === 0 || p.lag === 1) && heltall(p.nr, 1, 99) && heltall(p.fra, 0, hist.length)) ? sp.hintlogg.map((p) => ({ lag: p.lag, nr: p.nr, ord: R.kutt(p.ord, 20), n: p.n == null ? null : p.n, fra: p.fra })) : [];
    const b = sp.beste;
    ny.beste = hintOk(b) && heltall(b.treff, 2, AGENTER) && (b.lag === 0 || b.lag === 1) ? { treff: b.treff, ord: R.kutt(b.ord, 20), n: b.n == null ? null : b.n, lag: b.lag, mester: typeof b.mester === "string" ? R.kutt(b.mester, 16) : "" } : null;
    const m = sp.melding;
    if (erObj(m) && typeof m.tekst === "string" && typeof m.type === "string" && m.tekst.length <= 240) ny.melding = { tekst: m.tekst, type: m.type };
    return ny;
  }

  function gyldigGjest(g) {
    if (!erObj(g) || g.hash !== BANK || !heltall(g.fro, 0, MAKS_FRO) || !heltall(g.brett, 0, MAKS_BRETT)) return null;
    const sammen = g.modus === "sammen";
    const tatt = Array.isArray(g.tatt) ? Array.from(new Set(g.tatt.filter((i) => heltall(i, 0, ANTALL - 1)))) : [];
    return { hash: BANK, modus: sammen ? "sammen" : "lag", fro: g.fro, brett: g.brett, start: sammen ? 0 : g.start === 1 ? 1 : 0, lett: g.lett === true, tatt, skjult: g.skjult === true };
  }

  // In progress on the board device: a board being played, or a match between two boards.
  const pagarSpill = (S) => !!S.spill && !S.spill.ferdig;

  function fortsettTekst(sp) {
    if (erSammen(sp)) return over(sp) ? `Fortsett · ${funnet(sp)} av ${AGENTER} funnet` : `Fortsett · hint ${hintNr(sp)} av ${HINT}`;
    return over(sp) ? `Fortsett · ${stillingTekst(sp)}` : `Fortsett · brett ${sp.brett + 1}`;
  }

  // ---------- The app ----------

  R.start({
    id: "kodeknekkeren",
    versjon: 1,

    // In progress: a match that hasn't reached «Kåringen», or a code master looking at the key
    // (keeps the screen on).
    pagar: (S) => pagarSpill(S) || (S.skjerm === "kodemester" && !!S.gjest),

    tilstand: () => ({
      antall: standardAntall("lag"),
      oppsett: { modus: "lag", kamp: "best3", navn: false, lag: [], nokkel: "mobil", lett: false, tid: 0 },
      spill: null,
      gjest: null,
      kodeUtkast: "",
      kodeFeil: null,
      rekord: null, // «Sammen mot fella»: the best result on this phone, { f: agents found, h: hints }
      laert: false, // the example on the first board has done its job
    }),

    // Check everything that was saved (a damaged save must never give a blank page), and drop
    // saved games that don't fit this version of the word list.
    lastet(S) {
      const o = erObj(S.oppsett) ? S.oppsett : {};
      S.oppsett = {
        modus: o.modus === "sammen" ? "sammen" : "lag",
        kamp: KAMPER.includes(o.kamp) ? o.kamp : "best3",
        navn: o.navn === true,
        lag: Array.isArray(o.lag) ? o.lag.slice(0, 20).map((l) => (l === 1 ? 1 : 0)) : [],
        nokkel: o.nokkel === "skjerm" ? "skjerm" : "mobil",
        lett: o.lett === true,
        tid: TID.includes(o.tid) ? o.tid : 0,
      };
      const [min, maks] = GRENSER[S.oppsett.modus];
      if (!heltall(S.antall, min, maks)) S.antall = standardAntall(S.oppsett.modus);
      S.laert = S.laert === true;
      S.rekord = erObj(S.rekord) && heltall(S.rekord.f, 0, AGENTER) && heltall(S.rekord.h, 1, HINT) ? { f: S.rekord.f, h: S.rekord.h } : null;
      S.kodeUtkast = typeof S.kodeUtkast === "string" ? S.kodeUtkast.slice(0, 12) : "";
      S.kodeFeil = typeof S.kodeFeil === "string" ? S.kodeFeil.slice(0, 200) : null;
      S.spill = gyldigSpill(S.spill);
      S.gjest = gyldigGjest(S.gjest);
      if (S.skjerm === "slutt") S.skjerm = "resultat"; // the board's result had that name before «Kåringen» came
      const sp = S.spill;
      if (!sp && ["nokkel", "brett", "resultat", "karing"].includes(S.skjerm)) S.skjerm = "hjem";
      if (!S.gjest && S.skjerm === "kodemester") S.skjerm = "hjem";
      if (sp && ["nokkel", "brett", "resultat", "karing"].includes(S.skjerm)) {
        if (sp.ferdig) S.skjerm = "karing";
        else if (S.skjerm === "karing" || (S.skjerm === "nokkel" && over(sp))) S.skjerm = over(sp) ? "resultat" : "brett";
        else if (S.skjerm === "resultat" && !over(sp)) S.skjerm = "brett";
      }
    },

    regler: {
      intro: "Lag Rosa og Lag Blå leter etter sine hemmelige agenter blant 25 ord. Bare kodemesterne vet hvilke ord som hører til hvem.",
      steg: [
        ["Velg kodemestere", "Del dere i to lag. Hvert lag har én kodemester, som ser nøkkelen – på egen mobil eller på skjermen med brettet (hold inne for å se)."],
        ["Ett ord og et tall", "Kodemesteren sier ett hint og et tall, for eksempel «Hav, 2». Laget trykker på de ordene de tror hintet peker på."],
        ["Finn agentene – unngå fella", "Rett farge: gjett videre. Nøytralt ord eller motstandernes agent: turen går over. Fella: dere taper brettet med en gang."],
      ],
      tips: [
        "Første lag som finner alle agentene sine, vinner brettet. I «Best av 3» vinner første lag til to brett.",
        "Dere kan gjette én gang mer enn tallet – for å ta igjen et ord dere bommet på tidligere.",
        "Trykk på tallet over brettet når hintet er gitt, så teller mobilen forsøkene. Skriv gjerne ordet også – alle hintene ligger under «Hintene».",
        "Hintet må være ett ord, og ikke et av ordene på brettet.",
        "Kodemesteren får ikke peke, nikke eller himle med øynene. Pokerfjes!",
        "Laget som begynner, har 9 agenter. Det andre har 8.",
        "Trykket feil? «Angre» fikser det.",
      ],
      ekstraHtml: `
        <h3>Sammen mot fella</h3>
        <p class="ingress">For 2–4 spillere, alle på samme lag. Én er kodemester for hvert brett – bytt på.</p>
        <ol class="steg">
          <li><b>Ni agenter, sju hint</b><span>På brettet er det 9 agenter, 15 nøytrale ord og én felle. Kodemesteren har sju hint på seg.</span></li>
          <li><b>Gjett til dere bommer</b><span>En agent: gjett videre. Et nøytralt ord: det hintet er brukt. «Neste hint» avslutter et hint når dere vil.</span></li>
          <li><b>Styr unna fella</b><span>Trykker dere på fella, er brettet over med en gang. Finn så mange agenter dere kan – og slå rekorden deres.</span></li>
        </ol>`,
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp) return { html: "" };
        const sammen = erSammen(sp);
        requestAnimationFrame(() => tilpass(R.$(".mappe.apen .mappe-bakside")));
        return {
          html: `<span class="kk-mappe-topp">${
            sammen ? '<span class="kk-starter sammen">Sammen mot fella</span>' : `<span class="kk-starter ${LAG[sp.start].klasse}">${LAG[sp.start].navn} begynner</span>`
          }<span>Brett ${sp.brett + 1}</span></span>${nokkelGrid(sp.ord, sp.nokkel, { tatt: sp.vist, sammen })}${fordeling(sp)}<span class="kk-tommel" aria-hidden="true">Slipp for å skjule</span>`,
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

    // Players come and go in the setup: keep the two teams in step.
    vedSpillere(S, o) {
      if (o && o.fjernet != null && Array.isArray(S.oppsett.lag)) S.oppsett.lag.splice(o.fjernet, 1);
      ordneLag(S);
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
      // The word on the hint strip, kept while it is typed (a redraw must not lose it).
      hint(S, el) {
        if (S.spill) S.spill.utkast = R.kutt(el.value, 20);
      },
    },

    skjema: {
      kode(S, form) {
        const svar = sjekkKode(form.querySelector("input").value);
        if (!svar.k) return visKodefeil(svar.feil);
        bliMed(S, svar.k);
      },
      // Enter in the hint field: the word alone (or a new word for the number that is there).
      hint(S) {
        settHint(S, {});
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Ett ord. Ett tall.<br><em>Finn agentene – unngå fella.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagarSpill(S),
              fortsettTekst: pagarSpill(S) ? fortsettTekst(S.spill) : "",
              ekstraHtml: R.ui.knapp2("Jeg er kodemester", "bli-med", { ikon: "🔑" }) + R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [...(S.rekord ? [["REKORD", rekordTekst(S.rekord)]] : []), ["2–20", "spillere"], ["2", "lag – eller sammen"], [R.tall(KANDIDATER[2].length), "ord"]],
          }),
        etter: () => bred(false),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const sammen = o.modus === "sammen";
          if (o.navn && !sammen) ordneLag(S);
          const hindring = startHindring(S);
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${veiHtml(0)}
          ${R.ui.fliser(
            "modus",
            [
              { v: "lag", ikon: "⚔️", tittel: "Lag mot lag", tekst: "4 eller flere" },
              { v: "sammen", ikon: "🤝", tittel: "Sammen mot fella", tekst: "2–4 spillere" },
            ],
            o.modus,
          )}
          <p class="ingress">${
            sammen
              ? "Én er kodemester, resten gjetter. Finn alle ni agentene på sju hint – uten å gå i fella."
              : 'Del dere i <b class="kk-farge rosa">Lag Rosa</b> og <b class="kk-farge bla">Lag Blå</b>, og velg én kodemester på hvert lag.'
          }</p>
          ${R.ui.bryter("navn", o.navn, "Skriv inn navn", sammen ? "Mobilen holder styr på hvem som er kodemester." : "Mobilen deler lagene og velger nye kodemestere for hvert brett.")}
          ${o.navn ? R.ui.spillere({ min: GRENSER[o.modus][0], max: GRENSER[o.modus][1], hjelp: sammen ? "Dere bytter på å være kodemester." : "" }) : ""}
          ${o.navn && !sammen ? lageneHtml(S) : ""}
          ${
            sammen
              ? ""
              : `<section class="seksjon">
            <h2>Kampen</h2>
            ${R.ui.seg(
              "kamp",
              KAMPER.map((k) => [k, k === "fri" ? "Fri" : KAMPNAVN[k]]),
              o.kamp,
              { etikett: "Kampen" },
            )}
            <p class="hjelp">${o.kamp === "ett" ? "Ett brett – så er det kåring." : o.kamp === "best3" ? "Første lag til to brett vinner." : "Spill så mange brett dere vil. «Avslutt» gir kåringen."}</p>
          </section>`
          }
          <section class="seksjon">
            <h2>${sammen ? "Hvor ser kodemesteren nøkkelen?" : "Hvor ser kodemesterne nøkkelen?"}</h2>
            ${R.ui.fliser(
              "nokkelmodus",
              [
                { v: "mobil", ikon: "📱", tittel: "På egen mobil", tekst: "Med QR-kode" },
                { v: "skjerm", ikon: "🔒", tittel: "På denne skjermen", tekst: "Hold fingeren på kortet" },
              ],
              o.nokkel,
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
              o.lett ? "lett" : "alle",
              { etikett: "Ordene" },
            )}
          </section>
          <section class="seksjon">
            <h2>${sammen ? "Tidsur for hvert hint" : "Tidsur for hver tur"}</h2>
            ${R.ui.seg(
              "tid",
              TID.map((t) => [t, t ? `${t / 60} min` : "Av"]),
              o.tid,
              { etikett: sammen ? "Tidsur for hvert hint" : "Tidsur for hver tur" },
            )}
          </section>
          <p class="hjelp kk-tips">Tips: åpne brettet på nettbrett eller TV – det fyller skjermen.</p>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !!hindring }), hindring ? `<p class="hjelp">${esc(hindring)}</p>` : "")}`;
        },
        etter: () => bred(false),
      },

      nokkel: {
        tittel: (S) => `Brett ${S.spill.brett + 1}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const sammen = erSammen(sp);
          const linje = mesterLinje(sp);
          const ingress = linje
            ? `${linje} Resten ser bort!`
            : sammen
              ? sp.mnr > 0
                ? "Ny kodemester for hvert brett. Resten ser bort!"
                : "Velg én kodemester. Resten ser bort!"
              : sp.brett > 0 && S.oppsett.nokkel === "mobil"
                ? "Har dere koden fra forrige brett? Trykk «Neste brett» på mobilen – eller skann på nytt."
                : "Én kodemester på hvert lag. Resten av laget ser bort!";
          return `
          <h1 id="skjerm-tittel">${sammen ? "Kodemester, hent nøkkelen" : "Kodemestere, hent nøkkelen"}</h1>
          ${veiHtml(1)}
          <p class="ingress">${ingress}</p>
          ${linje && !sammen ? `<div class="kk-lagliste"><p class="rosa"><b>${LAG[0].navn}</b> ${lagliste(sp, 0)}</p><p class="bla"><b>${LAG[1].navn}</b> ${lagliste(sp, 1)}</p></div>` : ""}
          ${nokkelHtml(S)}
          ${R.ui.dokk(R.ui.knapp("Klar – vis brettet", "til-brett"))}`;
        },
        etter: () => bred(false),
      },

      brett: {
        tittel: (S) => `Brett ${S.spill.brett + 1}`,
        tilbake: "hjem",
        liggende: false, // landscape phones: the board has its own wide layout (html.kk-vid in spill.css)
        vis(S) {
          const sp = S.spill;
          const sammen = erSammen(sp);
          const ferdig = over(sp);
          const na = LAG[sp.tur];
          const nr = hintNr(sp);
          const klar = !ferdig && hintRest(sp).brukt; // the guesses of the hint are used: time to hand over
          const eksempel = visEksempel(S);
          let knapp;
          if (ferdig) knapp = R.ui.knapp("Se resultatet", "til-resultat");
          else if (sammen)
            knapp = R.ui.knapp("", "ferdig", {
              variant: klar ? "kk-klar" : "",
              tekstHtml: `<span class="kk-ferdig"><b>${nr >= HINT ? "Ferdig med siste hint" : "Neste hint"}</b><small>${nr >= HINT ? "Da er brettet over" : `Ferdig med hint ${nr} av ${HINT}`}</small></span>`,
            });
          else
            knapp = R.ui.knapp("", "ferdig", {
              variant: `${na.knapp}${klar ? " kk-klar" : ""}`,
              tekstHtml: `<span class="kk-ferdig"><b>${na.navn} er ferdig</b><small>Turen går til ${LAG[1 - sp.tur].navn}</small></span>`,
            });
          return `
            <h1 class="vh" id="skjerm-tittel">Brett ${sp.brett + 1}: ${
              sammen ? (ferdig ? "brettet er over" : `hint ${nr} av ${HINT}`) : ferdig ? `${LAG[sp.vinner].navn} tok brettet` : `${na.navn} sin tur`
            }</h1>
            ${statusHtml(sp)}
            ${eksempel ? eksempelHtml(sp) : meldingHtml(sp)}
            ${eksempel || ferdig ? "" : hintHtml(sp)}
            ${brettHtml(sp, { sist: sp.sist })}
            ${R.ui.dokk(
              knapp,
              `<div class="lenkerad kk-verktoy">
                <button class="lenke" data-h="angre"${sp.hist.length ? "" : " disabled"}>↶ Angre</button>
                <button class="lenke" data-h="nokkel-ark">🔑 Nøkkelen</button>
                ${sp.hintlogg.length ? '<button class="lenke" data-h="hint-logg">💬 Hintene</button>' : ""}
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

      // A board is over: what happened, the whole key, and on to the next board or «Kåringen».
      resultat: {
        tittel: (S) => `Brett ${S.spill.brett + 1}`,
        tilbake: "hjem",
        liggende: false, // (as the board: its own wide layout)
        vis(S) {
          const sp = S.spill;
          const sammen = erSammen(sp);
          const sist = avgjort(sp);
          let banner;
          if (sammen) {
            const f = funnet(sp);
            banner = `<div class="banner kk-banner sammen">
              ${R.ui.figur(null, { stemning: sp.grunn === "alle" ? "jubel" : sp.grunn === "fella" ? "lei" : "" })}
              <p class="etikett">Brett ${sp.brett + 1} · hint ${hintNr(sp)} av ${HINT}</p>
              <h1 id="skjerm-tittel">${sp.grunn === "alle" ? "Alle ni funnet!" : sp.grunn === "fella" ? "Rett i fella!" : "Hintene er brukt"}</h1>
              <p class="ingress">${sp.grunn === "alle" ? "Fella fikk aldri sjansen." : `${f} av ${AGENTER} agenter funnet.`}</p>
            </div>`;
          } else {
            const v = sp.vinner;
            banner = `<div class="banner kk-banner ${LAG[v].klasse}">
              ${R.ui.figur(null, { stemning: "jubel" })}
              <p class="etikett">Brett ${sp.brett + 1}${sist && sp.kamp === "best3" ? " · kampen er avgjort" : ""}</p>
              <h1 id="skjerm-tittel">${LAG[v].navn} tok brettet!</h1>
              <p class="ingress">${esc(grunnTekst(sp))}</p>
              ${sp.kamp === "ett" ? "" : stillingHtml(sp)}
            </div>`;
          }
          return `
            ${banner}
            ${brettHtml(sp, { fasit: true })}
            <p class="hjelp kk-fasit-hjelp">Kort med bare farget kant rakk ingen å ta.</p>
            ${R.ui.dokk(
              sist ? R.ui.knapp("Til kåringen", "til-karing") : R.ui.knapp("Neste brett", "neste-brett"),
              R.ui.lenkerad('<button class="lenke" data-h="angre" aria-label="Angre siste trykk">↶ Angre</button>', sp.hintlogg.length ? R.ui.lenke("💬 Hintene", "hint-logg") : "", sist ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          if (erSammen(sp)) {
            if (sp.grunn !== "alle") return;
            R.lyd.riktig();
            R.konfetti(["--aksent", "--papir", "--lampe"]);
            return;
          }
          // The board is the moment when the match goes on; when it decides the match, «Kåringen» is.
          if (avgjort(sp)) R.lyd.riktig();
          else R.lyd.fanfare();
          R.vibrer([40, 60, 40]);
          R.konfetti([LAG[sp.vinner].token, "--papir", "--aksent"]);
        },
        etter(S, rot) {
          bred(true);
          tilpass(rot);
        },
      },

      karing: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            ${erSammen(sp) ? karingSammen(S, sp) : karingLag(sp)}
            ${R.ui.flereSpill(sp.antall ? { antall: sp.antall } : {})}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        // Celebrate in proportion, and only the first time the screen is shown.
        inn(S) {
          const sp = S.spill;
          if (!sp.feire) return;
          sp.feire = false;
          if (erSammen(sp)) {
            const topp = over(sp) && (sp.rekord === "ny" || funnet(sp) === AGENTER);
            if (topp) {
              R.lyd.fanfare();
              R.vibrer([40, 60, 40]);
              R.konfetti(["--aksent", "--papir", "--lampe"]);
            } else if (over(sp) && funnet(sp) >= 7) R.lyd.riktig();
            else R.lyd.pling();
            visTipsSnart();
            return;
          }
          const [a, b] = sp.stilling;
          if (!sp.spilt) R.lyd.pling();
          else {
            R.lyd.fanfare();
            R.vibrer([40, 60, 40]);
            R.konfetti(a === b ? undefined : [LAG[a > b ? 0 : 1].token, "--papir", "--aksent"]);
          }
        },
        etter: () => bred(false),
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
            ${R.ui.dokk(g ? `<button class="knapp" type="button" data-h="til-gjest">Vis nøkkelen til brett ${g.brett + 1}</button>` : '<button class="knapp" type="submit">Vis nøkkelen</button>')}
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
          const sammen = erSammen(g);
          const b = gjestensBrett(g);
          const grupper = (sammen ? [ROSA, NOYTRAL, FELLE] : [g.start, 1 - g.start, NOYTRAL, FELLE])
            .map((type) => {
              const ord = b.ord.map((w, i) => ({ w, i })).filter((x) => b.nokkel[x.i] === type);
              const igjenN = ord.filter((x) => !g.tatt.includes(x.i)).length;
              const navn = type === FELLE ? "Fella" : type === NOYTRAL ? "Nøytrale" : sammen ? "Agenter" : LAG[type].navn;
              return `<section class="kk-gruppe t${type}">
                <h2><i aria-hidden="true">${bokstav(type, sammen)}</i>${navn}<span>${type === FELLE ? "" : `${igjenN} igjen`}</span></h2>
                <p>${ord.map((x) => `<span class="${g.tatt.includes(x.i) ? "tatt" : ""}">${esc(x.w)}</span>`).join("")}</p>
              </section>`;
            })
            .join("");
          return `
            <div class="kk-gjest-hode">
              <div><p class="etikett">Nøkkelen</p><h1 id="skjerm-tittel">Brett ${g.brett + 1}</h1></div>
              ${sammen ? '<span class="kk-starter sammen">Sammen mot fella</span>' : `<span class="kk-starter ${LAG[g.start].klasse}">${LAG[g.start].navn} begynner</span>`}
            </div>
            ${
              g.skjult
                ? `<button class="kk-dekke" data-h="skjul"><span aria-hidden="true">🙈</span><b>Nøkkelen er skjult</b><span>Trykk for å vise den igjen</span></button>`
                : `${nokkelGrid(b.ord, b.nokkel, { tatt: g.tatt, knapper: true, sammen })}
                   <p class="hjelp">Gi ett ord og et tall, for eksempel «Hav, 2». Trykk på ord som blir tatt, så krysses de ut her.</p>
                   <div class="kk-grupper${sammen ? " sammen" : ""}">${grupper}</div>`
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
      // «Nytt spill» while a match is running: say what is lost, and keep it if the answer is no.
      async nytt(el, e, S) {
        const sp = S.spill;
        if (pagarSpill(S)) {
          const [a, b] = sp.stilling;
          const poeng = !erSammen(sp) && a + b > 0;
          const tekst = over(sp)
            ? poeng
              ? `Stillingen ${a}–${b} nullstilles.`
              : "Resultatet fra brettet blir ikke kåret."
            : poeng
              ? `Brettet dere holder på med, forsvinner, og stillingen ${a}–${b} nullstilles.`
              : "Brettet dere holder på med, forsvinner.";
          const fortsatt = R.vakt();
          if (!(await R.bekreft("Starte et nytt spill?", tekst, "Start nytt", "Spill videre")) || !fortsatt()) return;
        }
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      hjem: () => R.gaTil("hjem"),
      "bli-med": () => R.gaTil("bli-med"),
      "til-gjest": () => R.gaTil("kodemester"),
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.gaTil(sp.ferdig ? "karing" : over(sp) ? "resultat" : "brett");
      },

      // Setup
      modus(el, e, S) {
        const modus = el.dataset.v === "sammen" ? "sammen" : "lag";
        if (modus !== S.oppsett.modus) {
          S.oppsett.modus = modus;
          S.antall = standardAntall(modus);
          ordneLag(S);
        }
        R.vis();
      },
      navn(el, e, S) {
        S.oppsett.navn = !S.oppsett.navn;
        if (S.oppsett.navn) {
          S.antall = R.klamp(S.antall || 0, GRENSER[S.oppsett.modus][0], GRENSER[S.oppsett.modus][1]);
          ordneLag(S);
        }
        R.vis();
      },
      kamp(el, e, S) {
        S.oppsett.kamp = KAMPER.includes(el.dataset.v) ? el.dataset.v : "best3";
        R.vis();
      },
      "bytt-lag"(el, e, S) {
        const i = Number(el.dataset.v);
        ordneLag(S);
        if (!heltall(i, 0, S.antall - 1)) return;
        S.oppsett.lag[i] = 1 - S.oppsett.lag[i];
        R.vis();
      },
      "stokk-lag"(el, e, S) {
        const rekke = R.stokk(Array.from({ length: S.antall }, (_, i) => i));
        S.oppsett.lag = [];
        rekke.forEach((i, n) => (S.oppsett.lag[i] = n % 2));
        R.lyd.sveip();
        R.vis();
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
        if (startHindring(S)) return;
        S.spill = nyKamp(S);
        R.statistikk("start", { modus: S.spill.modus, spillere: S.spill.antall, kamp: S.spill.kamp });
        R.holdVaken();
        R.gaTil("nokkel");
      },

      // Between boards and after the match
      "neste-brett"(el, e, S) {
        const sp = S.spill;
        if (!sp || !over(sp) || sp.ferdig || avgjort(sp)) return;
        S.spill = nesteBrett(sp, false);
        R.gaTil("nokkel");
      },
      "til-karing"(el, e, S) {
        const sp = S.spill;
        if (sp && avgjort(sp)) tilKaring(S, false);
      },
      // «Spill igjen»: a new match with the same teams and settings.
      igjen(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        S.spill = nesteBrett(sp, true);
        R.statistikk("start", { modus: S.spill.modus, spillere: S.spill.antall, kamp: S.spill.kamp });
        R.holdVaken();
        R.gaTil("nokkel");
      },
      del(el, e, S) {
        if (S.spill) R.del("Kodeknekkeren", deleTekst(S.spill), location.origin + "/kodeknekkeren/");
      },

      "til-brett": () => R.gaTil("brett"),
      "til-resultat": (el, e, S) => S.spill && over(S.spill) && R.gaTil("resultat"),
      "nokkel-ark": (el, e, S) => visNokkelArk(S),
      kopier: (el, e, S) => R.kopier(R.kode.formater(lagKode(S.spill))),
      "del-lenke"(el, e, S) {
        const kode = lagKode(S.spill);
        R.del("Kodeknekkeren", `Nøkkelen til brett ${S.spill.brett + 1} – bare for ${erSammen(S.spill) ? "kodemesteren" : "kodemesterne"}. Koden er ${R.kode.formater(kode)}.`, R.kode.lenke(kode));
      },

      // The hint strip
      "hint-tall"(el, e, S) {
        const n = Number(el.dataset.v);
        if (TALL.includes(n)) settHint(S, { n });
      },
      "hint-endre"(el, e, S) {
        const sp = S.spill;
        if (!sp || over(sp) || !sp.hint) return;
        sp.redigerer = true;
        sp.utkast = sp.hint.ord;
        R.vis();
        const felt = R.$("#kk-hintfelt");
        if (felt) felt.focus({ preventScroll: true });
      },
      "hint-logg": (el, e, S) => S.spill && visHintArk(S),
      "eks-lukk"(el, e, S) {
        S.laert = true;
        R.vis();
        const h = R.$("#skjerm-tittel");
        if (h) {
          h.setAttribute("tabindex", "-1");
          h.focus({ preventScroll: true });
        }
      },

      kort(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!sp || over(sp) || !heltall(i, 0, ANTALL - 1) || sp.vist.includes(i)) return;
        const sammen = erSammen(sp);
        const lag = sp.tur;
        const type = sp.nokkel[i];
        const ord = sp.ord[i];
        const nr = hintNr(sp);
        const egen = type === (sammen ? ROSA : lag);
        // A card that ends the turn or the board also remembers the hint on the strip (for undo).
        const steg = { t: "kort", i, tur: lag };
        const slutt = () => {
          steg.hint = sp.hint;
          tomHint(sp);
        };
        sp.hist.push(steg);
        sp.vist.push(i);
        sp.sist = i;

        if (type === FELLE) {
          sp.grunn = "fella";
          sp.spilt += 1;
          S.laert = true;
          if (!sammen) {
            sp.vinner = 1 - lag;
            sp.stilling[sp.vinner] += 1;
          }
          slutt();
          sp.melding = { tekst: sammen ? `«${ord}» var fella! Brettet er over.` : `«${ord}» var fella! ${LAG[lag].navn} taper brettet.`, type: "felle" };
          R.si(sp.melding.tekst);
          R.lyd.bom();
          R.vibrer([90, 60, 260]);
          stoppTur();
          R.vis();
          const brett = R.$(".kk-brett");
          if (brett) brett.classList.add("kk-smell");
          blits();
          tilResultatOm(1700);
          return;
        }

        const vinner = sammen ? null : igjen(sp, ROSA) === 0 ? ROSA : igjen(sp, BLA) === 0 ? BLA : null;
        if (vinner != null || (sammen && igjen(sp, ROSA) === 0)) {
          sp.grunn = "alle";
          sp.spilt += 1;
          S.laert = true;
          if (!sammen) {
            sp.vinner = vinner;
            sp.stilling[vinner] += 1;
          }
          slutt();
          sp.melding = {
            tekst: sammen ? "Alle ni agentene er funnet!" : vinner === lag ? `${LAG[vinner].navn} har funnet alle agentene!` : `Oi! «${ord}» var den siste agenten til ${LAG[vinner].navn} – brettet er deres.`,
            type: sammen || vinner === lag ? "riktig" : "feil",
          };
          R.si(sp.melding.tekst);
          R.lyd.riktig();
          R.vibrer(30);
          stoppTur();
          R.vis();
          tilResultatOm(1200);
          return;
        }

        if (egen) {
          const knapp = sammen ? (nr >= HINT ? "Ferdig med siste hint" : "Neste hint") : `${LAG[lag].navn} er ferdig`;
          sp.melding = { tekst: hintRest(sp).brukt ? `Riktig! Forsøkene er brukt – trykk «${knapp}».` : `Riktig! Gjett videre – eller trykk «${knapp}».`, type: "riktig" };
          R.lyd.riktig();
          R.vibrer(20);
          R.si(sp.melding.tekst);
          R.vis();
          return;
        }
        steg.hint = sp.hint;
        if (sammen) {
          R.lyd.takk();
          hintSlutt(S, nr, `«${ord}» var nøytralt.`, "noytral");
          return;
        }
        tomHint(sp);
        sp.tur = 1 - lag;
        if (type === NOYTRAL) {
          sp.melding = { tekst: `«${ord}» var nøytralt. Nå er det ${LAG[sp.tur].navn} sin tur.`, type: "noytral" };
          R.lyd.takk();
        } else {
          sp.melding = { tekst: `Oi! «${ord}» tilhørte ${LAG[type].navn} – og nå er det deres tur.`, type: "feil" };
          R.lyd.feil();
          R.vibrer([30, 40, 30]);
        }
        R.si(sp.melding.tekst);
        R.vis();
        startTur(S);
      },

      // «Lag X er ferdig» / «Neste hint»
      ferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || over(sp)) return;
        if (performance.now() - sisteTurbytte < 700) return; // the second tap of a double tap
        sisteTurbytte = performance.now();
        const nr = hintNr(sp);
        sp.hist.push({ t: "ferdig", tur: sp.tur, hint: sp.hint });
        R.lyd.pop();
        if (erSammen(sp)) {
          hintSlutt(S, nr, "", "tur");
          return;
        }
        tomHint(sp);
        sp.tur = 1 - sp.tur;
        sp.melding = { tekst: `${LAG[sp.tur].navn} sin tur. ${mesterNavn(sp, sp.tur)} gir ett ord og et tall.`, type: "tur" };
        R.si(sp.melding.tekst);
        R.vis();
        startTur(S);
      },

      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || performance.now() - sisteAngring < 400) return; // a double tap undoes one step
        sisteAngring = performance.now();
        const h = sp.hist.pop();
        if (!h) return;
        sisteTurbytte = -1e9;
        clearTimeout(sluttId);
        if (h.t === "hint") {
          // The hint on the strip goes back to what it was (or away).
          sp.hint = h.forrige || null;
          sp.redigerer = false;
          sp.utkast = "";
          if (sp.hint) Object.assign(sp.hintlogg[sp.hintlogg.length - 1] || {}, { ord: sp.hint.ord, n: sp.hint.n });
          else sp.hintlogg.pop();
          sp.melding = { tekst: sp.hint ? `Angret – hintet er ${hintHode(sp.hint)} igjen.` : "Angret – hintet er tatt bort.", type: "angre" };
          R.si(sp.melding.tekst);
          R.vis();
          return;
        }
        if (h.t === "kort") sp.vist = sp.vist.filter((i) => i !== h.i);
        if (over(sp)) {
          // The step ended the board: the board is on again, and the win is taken back.
          if (sp.vinner != null) sp.stilling[sp.vinner] = Math.max(0, sp.stilling[sp.vinner] - 1);
          sp.vinner = null;
          sp.grunn = null;
          sp.spilt = Math.max(0, sp.spilt - 1);
        }
        const byttet = "hint" in h || sp.tur !== h.tur; // the step ended a turn: the turn and its hint come back
        sp.tur = h.tur;
        if (byttet) {
          sp.hint = h.hint || null;
          sp.utkast = "";
          sp.redigerer = false;
        }
        const hvor = erSammen(sp) ? `Hint ${hintNr(sp)} av ${HINT}.` : `${LAG[sp.tur].navn} sin tur.`;
        sp.melding = { tekst: h.t === "kort" ? `Angret – «${sp.ord[h.i]}» er skjult igjen. ${hvor}` : `Angret – ${erSammen(sp) ? `tilbake til hint ${hintNr(sp)} av ${HINT}.` : `${LAG[sp.tur].navn} sin tur igjen.`}`, type: "angre" };
        R.si(sp.melding.tekst);
        if (S.skjerm !== "brett") {
          R.gaTil("brett");
          return;
        }
        R.vis();
        if (byttet) startTur(S);
      },

      // «Avslutt» never throws the match away: it goes to «Kåringen» with the result so far.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const [a, b] = sp.stilling;
        const tekst = erSammen(sp)
          ? "Dere går til kåringen med agentene dere har funnet så langt."
          : over(sp)
            ? `Dere går til kåringen med stillingen ${a}–${b}.`
            : sp.spilt
              ? `Brettet dere holder på med, teller ikke. Dere går til kåringen med stillingen ${a}–${b}.`
              : "Brettet teller ikke, så kåringen blir uten vinner.";
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Avslutte spillet?", tekst, "Avslutt", "Spill videre")) || !fortsatt() || S.spill !== sp || sp.ferdig) return;
        // Ended early: in the middle of a board, or before a «Best av 3» was decided.
        tilKaring(S, !over(sp) || (sp.kamp === "best3" && !avgjort(sp)));
      },

      // The code master's phone
      tatt(el, e, S) {
        const g = S.gjest;
        const i = Number(el.dataset.v);
        if (!g || !heltall(i, 0, ANTALL - 1)) return;
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
        if (!(await R.bekreft(`Gå til brett ${g.brett + 2}?`, `Gjør det når skjermen med brettet viser «Brett ${g.brett + 2}».`, "Neste brett", "Ikke ennå")) || !fortsatt()) return;
        g.brett += 1;
        g.start = erSammen(g) ? 0 : 1 - g.start;
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
        g.start = erSammen(g) ? 0 : 1 - g.start;
        g.tatt = [];
        R.vis();
        window.scrollTo(0, 0);
        R.toast(`Tilbake til brett ${g.brett + 1}`);
      },
    }),
  });
})();
