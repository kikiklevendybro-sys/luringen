/* rusj.no – the front-page search, as pure functions.
   A query in, a ranked list of games out. It knows the names people use (the games' own `sok`
   words), forgives a typo, reads head counts («2 spillere», «for to», «vi er 5»), occasions and
   facts («på nett», «kjapt», «én mobil», «alene», «mot mobilen») and says so when a well-known game
   simply is not here yet. Variants inside a game (Edderkoppkabal in Kortkongen) are entries of
   their own. No DOM, no storage and no texts here: the front page (portal.js) draws the rows, so the
   same code runs in the browser (window.RusjSok) and in the tests (CommonJS).

   How a word is met: a token fits a whole word or the start of a word, and – for tokens of four
   letters or more – the end of a compound («spill» finds «kortspill»). Never the middle of a word:
   «lag» does not find «slag».

   Ranking: a game whose name, genre or search word IS the query comes first; then by where the
   words were found – name, genre (undertittel), the game's own search words and one-liner, the words
   for its kind of game (rusj/seo.json «tagger») – then by «Mest spilt nå» and the site's order.

   The 18+ games: found by what they are called and by the words for drinking games – never by the
   words for a party, a birthday or a class trip. While the 18+ door is closed they are never in the
   list: the search only says how many are behind the door (`voksne`), and only when the words are
   the name of one, ask for drinking games as such, or meet the name, genre or a search word of one
   while no ordinary game answers them («gjett», «kort», «bløff» and «party» have their own games).

   A game is an entry of window.RUSJ_SPILLISTE: { id, navn, undertittel, kort, sok, tagger, spillere,
   minutter, mobiler, rekkefolge, topp?, nett?, motMobilen?, alder18?, varianter?: [{ id, navn,
   undertittel?, sok, spillere?, minutter?, nett? }] } – a variant's own facts only where they differ
   from the game's. */
(function (root) {
  "use strict";

  // Lower case, æ ø å kept, other accents dropped, everything else to single spaces. (Composed
  // first: an «å» typed as a + ring is the same letter.)
  function ren(tekst) {
    return String(tekst == null ? "" : tekst)
      .normalize("NFC")
      .toLocaleLowerCase("nb")
      .replace(/[^a-z0-9æøå ]/g, (c) => c.normalize("NFD").replace(/[̀-ͯ]/g, ""))
      .replace(/[^a-z0-9æøå ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // A word as it is typed without a Nordic keyboard: «paa», «pa» and «på» are one word, «gaater»,
  // «gater» and «gåter» another. Two words with the same flat form are the same word typed two ways.
  const flat = (x) => x.replace(/aa/g, "a").replace(/å/g, "a").replace(/ø/g, "o").replace(/æ/g, "ae");

  // ---------- What each edition's words mean ----------
  // All of it as the text looks after ren(): no accents but æøå, no punctuation.
  //   tall      the number words one to twelve (forms of one number split by |)
  //   ikkeVi, ikkeTil   forms of «one» that are also an article: no head count after «vi er» / «for»
  //             («vi er en gjeng», «leker til en fest») – only before a people noun («én spiller»)
  //   folk      nouns that make a number a head count: «4 spillere», «to stykker»
  //   vi        «vi er 5»
  //   til       «for to», «til fire» – when the number ends the query («leker til 17. mai» is a day)
  //   to        words that mean the two of us; toAlene: the word «two», when it is all that is typed
  //   kjapt     a quick game (the finder's «Kjapt»: a round can be done in under ten minutes)
  //   min       «5 min»: ten or less is «kjapt», more is «a round fits in that time»
  //   nett      played online, each on their own phone (games with "nett")
  //   hver      a phone each: online or around the table
  //   enMobil, flere, alene, mot   the facts on the cards, as before
  //   fyll      little words that say nothing in a search; spill: the word «game» itself
  //   ender     the last part of a compound («hestespill»): a typo is measured in the first part
  const REGLER = {
    nb: {
      tall: ["en|ett", "to", "tre", "fire", "fem", "seks", "sju|syv", "åtte", "ni", "ti", "elleve", "tolv"],
      ikkeVi: "en|ett",
      ikkeTil: "en|ett",
      folk: "spillere|spiller|personer|person|stk|stykker|stykk|folk|mann|deltakere|deltagere|venner|voksne|av oss",
      vi: "vi er|vi blir|dere er",
      til: "for|til|på",
      to: "par|paret|date|daten|datekveld|date night|kjæreste|kjæresten|kjærester|kjærestepar|tomannsspill",
      toAlene: "to",
      kjapt: "kjapt|kjappe|kjapp|raskt|raske|rask|hurtig|lynraskt|kort tid|liten tid|dårlig tid|korte spill|korte runder",
      min: "min|minutt|minutter|minutters",
      nett: "på nett|på nettet|online|nettspill|over nett|over nettet|på internett|på avstand|nett",
      hver: "hver sin mobil|hver sin telefon|hver vår mobil|hver sin skjerm|egen mobil",
      enMobil: "(?:en|1|samme) mobil",
      flere: "flere mobiler",
      alene: "alene|solo|en spiller|1 spiller",
      mot: "mot (?:mobilen|maskinen|datamaskinen|datamaskin|data|pc|pcen)",
      fyll: "og i på for med til en et ett ei som av å vi er det den de gratis regler spille",
      spill: "spill spillet spillene",
      ender: "spillene|spillet|spill|lekene|leker|leken|lek",
    },
    en: {
      tall: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
      ikkeVi: "one",
      ikkeTil: "",
      folk: "players|player|people|persons|person|of us|friends|adults|guests",
      vi: "we are|we re|there are|there s",
      til: "for",
      to: "couple|couples|date|date night|partner|girlfriend|boyfriend|husband|wife",
      toAlene: "two",
      kjapt: "quick|quickly|fast|short|in a hurry|short on time|little time",
      min: "min|mins|minute|minutes",
      nett: "online|on the net|over the internet|remote|remotely|long distance",
      hver: "own phones|their own phones|our own phones|own phone|a phone each|phone each|separate phones",
      enMobil: "(?:one|1|same) (?:phone|mobile)",
      flere: "(?:several|more) (?:phones|mobiles)",
      alene: "alone|solo|single player|one player|1 player|by myself|on my own",
      mot: "(?:against|vs|versus) (?:the )?(?:phone|computer|cpu|ai|machine)",
      fyll: "and in on for with to a an one the of we are is it free rules play",
      spill: "game games",
      ender: "games|game",
    },
    da: {
      tall: ["en|et", "to", "tre", "fire", "fem", "seks", "syv", "otte", "ni", "ti", "elleve", "tolv"],
      ikkeVi: "en|et",
      ikkeTil: "en|et",
      folk: "spillere|spiller|personer|person|stk|styk|mennesker|mand|deltagere|venner|voksne|af os",
      vi: "vi er|vi bliver",
      til: "for|til|på",
      to: "par|parret|date|daten|dateaften|date night|kæreste|kæresten|kærester|kærestepar",
      toAlene: "to",
      kjapt: "hurtigt|hurtig|hurtige|lynhurtigt|kort tid|lidt tid|korte spil|korte runder",
      min: "min|minut|minutter|minutters",
      nett: "online|på nettet|på net|over nettet|på internettet|på afstand",
      hver: "hver sin mobil|hver sin telefon|hver vores mobil|egen mobil",
      enMobil: "(?:en|1|samme) (?:mobil|telefon)",
      flere: "flere mobiler",
      alene: "alene|solo|en spiller|1 spiller",
      mot: "mod (?:mobilen|computeren|maskinen|pc en|pc)",
      fyll: "og i på for med til en et som af at vi er det den de gratis regler spille",
      spill: "spil spillet spillene",
      ender: "spillene|spillet|spil|legene|legen|lege|leg",
    },
  };

  // The facts a query can ask for. `myk`: dropped again when it leaves nothing (everything on
  // rusj.no is «på nett» in the wide sense: «kabal online» still finds the patience game).
  const KRAV = {
    enMobil: { passer: (s) => s.mobiler !== "hver" },
    flere: { passer: (s) => s.mobiler !== "en" },
    hver: { passer: (s) => !!s.nett || s.mobiler !== "en" },
    alene: { passer: (s) => s.spillere[0] === 1 },
    mot: { passer: (s) => !!s.motMobilen },
    nett: { passer: (s) => !!s.nett, myk: true },
    kjapt: { passer: (s) => s.minutter[0] < 10 },
  };

  // ---------- Well-known games with no relative here yet ----------
  // Only names: never shown by the page (it echoes what the visitor typed). `spill`: the nearest
  // kind of game we do have, `rom`: the room to look in. The place in the list is the entry's number.
  const IKKE_ENNA = [
    { ord: ["monopol", "monopoly"], rom: "klassikere" },
    { ord: ["scrabble", "wordfeud", "words with friends"], spill: ["sjongloren", "humla", "edderkoppen"], rom: "ord" },
    { ord: ["risk"], spill: ["sjakkhesten", "dam", "reversi"], rom: "klassikere" },
    { ord: ["catan", "settlers", "settlers of catan"], rom: "klassikere" },
    { ord: ["sims", "the sims"] },
    { ord: ["fortnite"] },
    { ord: ["roblox"] },
    { ord: ["minecraft"] },
    { ord: ["among us"], spill: ["luringen", "spionen", "varulven"], rom: "fest" },
    { ord: ["geoguessr", "geoguesser"], spill: ["globetrotteren"], rom: "ord" },
    { ord: ["poker", "texas holdem", "texas hold em"], rom: "kort" },
    { ord: ["bridge"], spill: ["makkeren", "hjerteknuseren"], rom: "kort" },
    { ord: ["tetris"], spill: ["blokka"], rom: "arkade" },
    { ord: ["pacman", "pac man"], rom: "arkade" },
    { ord: ["cluedo"], rom: "klassikere" },
    { ord: ["rummikub"], spill: ["samleren"], rom: "kort" },
    { ord: ["dobble", "spot it"], rom: "familie" },
  ];

  // ---------- Words ----------

  // How a token meets a word: 0 the whole word, 1 its start, 2 the end of a compound; -1 not at all.
  // start: the token may be the start of a word (not the tiny words in the middle of a query).
  function mote(token, ord, start) {
    if (ord === token) return 0;
    if (ord.length <= token.length) return -1;
    if (start && ord.startsWith(token)) return 1;
    if (token.length >= 4 && ord.endsWith(token)) return 2;
    return -1;
  }

  // Damerau–Levenshtein (neighbours swapped count as one), given up above `maks`.
  function avstand(a, b, maks) {
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > maks) return maks + 1;
    let for2 = null;
    let forrige = [];
    for (let j = 0; j <= lb; j++) forrige.push(j);
    for (let i = 1; i <= la; i++) {
      const rad = [i];
      let minst = i;
      for (let j = 1; j <= lb; j++) {
        let v = Math.min(forrige[j] + 1, rad[j - 1] + 1, forrige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, for2[j - 2] + 1);
        rad.push(v);
        if (v < minst) minst = v;
      }
      if (minst > maks) return maks + 1;
      for2 = forrige;
      forrige = rad;
    }
    return forrige[lb];
  }

  // The alternatives of a rule, the longest first: «date night» before «date» (the shorter one
  // would be taken first, and «night» left over as a word to look for).
  function lengstForst(kilde) {
    const deler = [];
    let dybde = 0;
    let start = 0;
    for (let i = 0; i < kilde.length; i++) {
      const c = kilde[i];
      if (c === "(") dybde++;
      else if (c === ")") dybde--;
      else if (c === "|" && dybde === 0) {
        deler.push(kilde.slice(start, i));
        start = i + 1;
      }
    }
    deler.push(kilde.slice(start));
    return deler.sort((a, b) => b.length - a.length).join("|");
  }

  // A well-known game inside a game, as a game: the game's own facts, but for what the variant says
  // differently – and never «ny oppgave hver dag» (the daily is the game's own). The rooms, the
  // finder's answers and the facts in a search are held against this.
  function somVariant(s, v) {
    return Object.assign({}, s, { tagger: (s.tagger || []).filter((x) => x !== "daglig") }, v.spillere ? { spillere: v.spillere } : null, v.minutter ? { minutter: v.minutter } : null, v.nett === false ? { nett: false } : null);
  }

  // How many games the closed 18+ door says a search has behind it (funn: what sok() returned).
  // Never while a room is chosen (no room but the 18+ one holds such a game) or the youngest player
  // has an age – «Med barna» is a six-year-old.
  function bakDora(funn, o) {
    if (!funn || !o || o.over18 || o.rom || typeof o.yngst === "number") return 0;
    return funn.voksne.length;
  }

  // ---------- The index of one edition ----------
  // o: { spill: the game list, taggsok: { tag: [words] } (window.RUSJ_TAGGSOK), sprak: "nb" | "en" |
  //      "da", F: the finder (rusj/portal/finner.js), for the bands of «Hvor mange er dere?» }
  function lag(o) {
    const spill = o.spill || [];
    const taggsok = o.taggsok || {};
    const R = REGLER[o.sprak] || REGLER.nb;
    const band = o.F.naermesteBand;

    // An entry: a game, or a variant inside one. ord: [word, tier] (0 name, 1 genre, 2 its own search
    // words and one-liner, 3 the words for its kind of game); fraser: its name, genre and search
    // words whole. Of everything below there are two: what a visitor may meet while the 18+ door is
    // closed (apen), and all of it.
    const oppforinger = [];
    const ordApen = new Set(); // every word a token can meet
    const ordAlle = new Set();
    const synligApen = new Set(); // the words the page itself shows (names, genres, one-liners, kinds of game)
    const synligAlle = new Set();
    // The words a typo may be put right to: those that are a whole name, genre, search word or word
    // for a kind of game («yatzy», «sudoku», «selskapsleker») → the best tier they are that at.
    const helApen = new Map();
    const helAlle = new Map();
    function oppforing(s, variant, nr) {
      const voksen = !!s.alder18;
      const ord = new Map();
      const fraser = [];
      const legg = (tekst, trinn, egen, hel, vises) => {
        const r = ren(tekst);
        if (!r) return;
        if (egen) fraser.push(r);
        if (hel && r.length >= 4 && !r.includes(" ") && !/^\d+$/.test(r)) {
          if (!(helAlle.get(r) <= trinn)) helAlle.set(r, trinn);
          if (!voksen && !(helApen.get(r) <= trinn)) helApen.set(r, trinn);
        }
        for (const x of r.split(" ")) {
          if (!ord.has(x) || ord.get(x) > trinn) ord.set(x, trinn);
          ordAlle.add(x);
          if (!voksen) ordApen.add(x);
          if (vises) {
            synligAlle.add(x);
            if (!voksen) synligApen.add(x);
          }
        }
      };
      const k = variant || s;
      legg(k.navn, 0, true, true, true);
      legg(k.undertittel, 1, true, true, true);
      for (const x of k.sok || []) legg(x, 2, true, true, false);
      if (!variant) {
        // An 18+ game carries the words for drinking games and no other kind's: «klassetur»,
        // «bursdag» and «venner» never lead to it. (Nor does its one-liner open the door.)
        legg(s.kort, voksen ? 3 : 2, false, false, true);
        for (const tg of voksen ? ["drikke"] : s.tagger || []) for (const x of taggsok[tg] || []) legg(x, 3, false, true, true);
      }
      // f: the facts a query is held against (a variant's own, where it has them).
      return { s, v: variant || null, f: variant ? somVariant(s, variant) : s, voksen, n: variant ? s.id + "#" + variant.id : s.id, ord: Array.from(ord), fraser, nr };
    }
    for (const s of spill) {
      oppforinger.push(oppforing(s, null, 0));
      (s.varianter || []).forEach((v, i) => oppforinger.push(oppforing(s, v, i + 1)));
    }
    // The words for drinking games as such («drikkeleker», «vors»): asking for them is asking for
    // what is behind the door.
    const DRIKKEORD = (taggsok.drikke || []).map(ren).filter(Boolean);

    // ---------- Reading the query ----------
    const alt = (kilde) => "(?:" + lengstForst(kilde) + ")";
    const tall = new Map();
    R.tall.forEach((former, i) => former.split("|").forEach((f) => tall.set(f, i + 1)));
    const tallord = (uten) => Array.from(tall.keys()).filter((x) => !(uten ? uten.split("|") : []).includes(x));
    const N = (uten) => "(\\d{1,2}|" + lengstForst(tallord(uten).join("|")) + ")";
    const verdi = (x) => (/^\d+$/.test(x) ? Number(x) : tall.get(x));
    // (The text is padded with a space on each side, so a rule is « word(s)» with a space after.)
    const re = (kilde) => new RegExp(" " + alt(kilde) + "(?= )");
    const RE = {
      enMobil: re(R.enMobil),
      flere: re(R.flere),
      hver: re(R.hver),
      mot: re(R.mot),
      alene: re(R.alene),
      nett: re(R.nett),
      kjapt: re(R.kjapt),
      min: new RegExp(" " + N("") + " " + alt(R.min) + "(?= )"),
      omrade: new RegExp(" (\\d{1,2})(?: (?:til|to|eller|or))? (\\d{1,2}) " + alt(R.folk) + "(?= )"),
      vi: new RegExp(" " + alt(R.vi) + " " + N(R.ikkeVi) + "(?: " + alt(R.folk) + ")?(?= )"),
      folk: new RegExp(" " + N("") + " " + alt(R.folk) + "(?= )"),
      // («for to», «til 4», «på 8»: only when nothing follows – «til 17. mai», «for 2 lag» are not counts)
      til: new RegExp(" " + alt(R.til) + " " + N(R.ikkeTil) + "(?= $)"),
      to: re(R.to),
    };
    const FYLL = new Set((R.fyll + " " + R.spill).split(" "));
    const ENDER = lengstForst(R.ender).split("|");
    // Every word the rules themselves know («på», «nett», «kjæreste»).
    const REGELORD = new Set();
    for (const v of Object.values(R)) for (const x of ren(Array.isArray(v) ? v.join(" ") : v.replace(/[^a-zæøå0-9 ]+/g, " ")).split(" ")) if (x) REGELORD.add(x);

    // Without a Nordic keyboard: a word that finds nothing as it is typed, but is one of ours when
    // a, o and ae (and aa) may stand for å, ø and æ, is read as ours: «pa nett», «gaater», «vri atter».
    const flatApen = new Map();
    const flatAlle = new Map();
    for (const x of REGELORD) {
      if (!flatAlle.has(flat(x))) flatAlle.set(flat(x), x);
      if (!flatApen.has(flat(x))) flatApen.set(flat(x), x);
    }
    for (const x of ordApen) if (!flatApen.has(flat(x))) flatApen.set(flat(x), x);
    for (const x of ordAlle) if (!flatAlle.has(flat(x))) flatAlle.set(flat(x), x);

    // Does any entry have a word this token can meet? (Else it may be a typo.)
    function finnes(token, siste, ordsett) {
      const start = siste || token.length >= 3;
      for (const x of ordsett) if (mote(token, x, start) >= 0) return true;
      return false;
    }
    function nordisk(tekst, over18) {
      const ordsett = over18 ? ordAlle : ordApen;
      const kart = over18 ? flatAlle : flatApen;
      const ord = tekst.split(" ");
      return ord
        .map((x, i) => {
          if (REGELORD.has(x) || /^\d+$/.test(x) || finnes(x, i === ord.length - 1, ordsett)) return x;
          return kart.get(flat(x)) || x;
        })
        .join(" ");
    }

    // What a query asks for: { hele (the text, cleaned), rest (what the rules left), ord (the tokens
    // to look for), krav ([{ passer, myk }]), n (the head count, or 0), antall (the finder's band for
    // it, or ""), kjapt, nett, bareFyll (nothing but little words and «spill» is left to look for) }.
    function tolk(hele) {
      const ut = { hele, rest: hele, ord: [], krav: [], n: 0, antall: "", kjapt: false, nett: false, bareFyll: false };
      let t = " " + hele + " ";
      const ta = (r) => {
        const m = r.exec(t);
        if (m) t = t.slice(0, m.index) + t.slice(m.index + m[0].length);
        return m;
      };
      for (const navn of ["enMobil", "flere", "hver", "mot", "alene", "nett", "kjapt"]) {
        if (!ta(RE[navn])) continue;
        ut.krav.push(KRAV[navn]);
        if (navn === "nett") ut.nett = true;
        if (navn === "kjapt") ut.kjapt = true;
      }
      let m = ta(RE.min);
      if (m) {
        const min = verdi(m[1]);
        if (min <= 10) {
          if (!ut.kjapt) ut.krav.push(KRAV.kjapt);
          ut.kjapt = true;
        } else ut.krav.push({ passer: (s) => s.minutter[0] <= min });
      }
      // The head count: the games that many can play. («3–4 spillere»: both three and four.)
      // Nought is no head count; the words are taken, and nothing is asked.
      let n = 0;
      let omfang = null;
      if (hele === R.toAlene) {
        n = 2;
        t = " ";
      } else if ((m = ta(RE.omrade))) omfang = [Math.min(Number(m[1]), Number(m[2])), Math.max(Number(m[1]), Number(m[2]))];
      else if ((m = ta(RE.vi) || ta(RE.folk) || ta(RE.til))) n = verdi(m[1]);
      else if (ta(RE.to)) n = 2;
      if (n > 0) omfang = [n, n];
      if (omfang && omfang[0] > 0) {
        ut.n = omfang[0];
        ut.antall = band(omfang[0]);
        ut.krav.push({ passer: (s) => s.spillere[0] <= omfang[0] && omfang[1] <= s.spillere[1] });
      }
      ut.rest = t.trim();
      const ord = ut.rest ? ut.rest.split(" ") : [];
      const rene = ord.filter((x) => !FYLL.has(x));
      ut.ord = rene.length || ut.krav.length ? rene : ord;
      ut.bareFyll = !rene.length;
      return ut;
    }

    // ---------- Finding ----------

    // Best first: the query itself, where the words were found, the whole phrase, a game before a
    // variant, «Mest spilt nå», the site's order.
    const plass = (s) => (typeof s.topp === "number" ? s.topp : Infinity);
    const orden = (s) => (typeof s.rekkefolge === "number" ? s.rekkefolge : Infinity);
    const ranger = (liste) => liste.sort((a, b) => a.hel - b.hel || a.poeng - b.poeng || a.frase - b.frase || (a.e.v ? 1 : 0) - (b.e.v ? 1 : 0) || plass(a.e.s) - plass(b.e.s) || orden(a.e.s) - orden(b.e.s) || a.e.nr - b.e.nr);

    // The entries a reading of the query finds: [{ e, poeng (tier × 3 + how the word was met: the
    // weakest of the tokens counts) }], best first.
    function let_(Q, utenMyke) {
      const krav = utenMyke ? Q.krav.filter((k) => !k.myk) : Q.krav;
      const ord = Q.ord;
      const flere = ord.length > 1 ? " " + ord.join(" ") : "";
      const ut = [];
      for (const e of oppforinger) {
        if (e.v && !ord.length) continue; // a variant is found by its words, never by the facts alone
        // Its name, genre or one of its search words is the query itself.
        const hel = e.fraser.includes(Q.hele) || (!!Q.rest && e.fraser.includes(Q.rest));
        const noyaktig = Q.hele !== Q.rest && e.fraser.includes(Q.hele); // … whatever the rules read into it
        let poeng = 0;
        let ok = true;
        for (let i = 0; i < ord.length && ok; i++) {
          const start = i === ord.length - 1 || ord[i].length >= 3;
          let best = -1;
          for (const [x, trinn] of e.ord) {
            const m = mote(ord[i], x, start);
            if (m >= 0 && (best < 0 || trinn * 3 + m < best)) best = trinn * 3 + m;
          }
          if (best < 0) ok = false;
          else if (best > poeng) poeng = best;
        }
        if (ok && !krav.every((k) => k.passer(e.f))) ok = false;
        if (!ok && !noyaktig) continue;
        if (!ok) poeng = 6;
        const frase = flere && e.fraser.some((f) => (" " + f).includes(flere));
        ut.push({ e, hel: hel ? 0 : 1, poeng, frase: frase ? 0 : 1 });
      }
      return ranger(ut);
    }
    // … with what may give way when nothing is found: «på nett» (everything here is online in the
    // wide sense), then a bare number among the words («for 2 lag», «30-årsdag»).
    const erTall = (x) => /^\d+$/.test(x);
    function finn(Q) {
      let funn = let_(Q, false);
      if (!funn.length && Q.krav.some((k) => k.myk) && Q.ord.length) funn = let_(Q, true);
      if (!funn.length && Q.ord.some(erTall) && !Q.ord.every(erTall)) {
        const uten = Q.ord.filter((x) => !erTall(x));
        const Q2 = Object.assign({}, Q, { ord: uten, rest: uten.join(" ") });
        funn = let_(Q2, false);
        if (!funn.length && Q.krav.some((k) => k.myk)) funn = let_(Q2, true);
      }
      return funn;
    }

    // The nearest word we know for a token that finds nothing. Strict, so a real word is not turned
    // into another game: the same first letter, and only to a word that is a whole name, genre,
    // search word or word for a kind of game. One edit for 6–9 letters, two from 10; a word of 4–5
    // letters only to a name or a genre («yatsy» → «yatzy», not «hest» → «helst»). A compound is
    // measured in its first part («hestespill» is not «hermespill»). siste: the token is still being
    // typed, so from seven letters the start of a longer word counts too («selksap» → «selskapsleker»).
    function rett(token, siste, over18) {
      if (token.length < 4 || erTall(token)) return null;
      const hele = over18 ? helAlle : helApen;
      const ende = ENDER.find((e) => token.length > e.length && token.endsWith(e)) || "";
      let best = null;
      for (const [x, trinn] of hele) {
        if (x[0] !== token[0] || x === token) continue;
        const felles = !!ende && x.length > ende.length && x.endsWith(ende);
        const a = felles ? token.slice(0, -ende.length) : token;
        const b = felles ? x.slice(0, -ende.length) : x;
        const maks = a.length >= 10 ? 2 : a.length >= 4 ? 1 : 0;
        if (!maks || (a.length <= 5 && trinn > 1)) continue;
        let d = avstand(a, b, maks);
        // (half a step behind a whole word at the same distance)
        if (d > maks && siste && !felles && token.length >= 7 && x.length > token.length) d = avstand(token, x.slice(0, token.length), 1) <= 1 ? 1.5 : 9;
        if (d > maks + 0.5) continue;
        if (!best || d < best[0] || (d === best[0] && (trinn < best[1] || (trinn === best[1] && x < best[2])))) best = [d, trinn, x];
      }
      return best ? best[2] : null;
    }

    // A well-known game that is not here: its number in IKKE_ENNA, the nearest games and the room.
    function ikkeEnna(Q) {
      const navn = [Q.hele, Q.rest, Q.ord.join(" ")];
      const nr = IKKE_ENNA.findIndex((x) => x.ord.some((n) => navn.includes(n)));
      if (nr < 0) return null;
      const av = new Map(spill.map((s) => [s.id, s]));
      return { nr, spill: (IKKE_ENNA[nr].spill || []).map((id) => av.get(id)).filter(Boolean), rom: IKKE_ENNA[nr].rom || "" };
    }

    // The search. valg.over18: the 18+ door is open (default: closed).
    // Returns { tom (nothing typed), treff: [{ s, v, n }] the rows, best first (n: the game's id, or
    // «id#variant») – never an 18+ game while the door is closed –, av: Map(n → place), voksne: the
    // 18+ games the closed door has behind it for these words, drikke (the words ask for drinking
    // games as such), tekst (words were looked for, not only facts), n and antall (the head count and
    // the finder's band for it), kjapt, nett (what the rules read), rettet (the words shown after a
    // typo was put right, or ""), ikkeEnna (null, or { nr, spill, rom } for a known game that is
    // not here) }.
    function sok(q, valg) {
      const over18 = !!(valg && valg.over18);
      const Q = tolk(nordisk(ren(q), over18));
      const ut = { tom: !Q.hele, treff: [], av: new Map(), voksne: [], drikke: false, tekst: Q.ord.length > 0, n: Q.n, antall: Q.antall, kjapt: Q.kjapt, nett: Q.nett, rettet: "", ikkeEnna: null };
      const med = (e) => over18 || !e.voksen;
      const ferdig = (rader, voksne) => {
        ut.treff = rader.map((e) => ({ s: e.s, v: e.v, n: e.n }));
        ut.treff.forEach((x, i) => ut.av.set(x.n, i));
        ut.voksne = (voksne || []).map((e) => e.s);
        return ut;
      };
      if (ut.tom) return ferdig(oppforinger.filter((e) => !e.v && med(e)));
      // The words ask for drinking games as such: every 18+ game they find is behind the door.
      const sagt = [Q.rest, Q.ord.join(" ")].filter(Boolean);
      ut.drikke = sagt.some((x) => DRIKKEORD.some((d) => d === x || (x.length >= 4 && d.startsWith(x))));
      // What a list of matches is to the visitor: the rows, and – behind a closed door – the 18+
      // games the words asked for: the one whose name they are; those whose name, genre or own
      // search word they meet when no ordinary game answers them (a drinking game's «Gjett kortet»
      // must not put the door under the guessing games, nor «Party Bus» under the party games); all
      // of them for the words for drinking games. Never by a fact alone, and never by «spill» or
      // another little word alone.
      const del = (funn, harOrd) => {
        const rader = funn.filter((x) => med(x.e)).map((x) => x.e);
        const navnet = (e) => e.fraser[0] === Q.hele || (!!Q.rest && e.fraser[0] === Q.rest);
        const voksne = over18 || !harOrd ? [] : funn.filter((x) => x.e.voksen && (ut.drikke || navnet(x.e) || (x.poeng < 9 && !rader.length))).map((x) => x.e);
        return { rader, voksne };
      };
      const fant = (d) => d.rader.length + d.voksne.length > 0;
      // A game that carries the query as a name of its own always wins over the «not yet» list.
      const egen = oppforinger.some((e) => e.fraser.includes(Q.hele) || (!!Q.rest && e.fraser.includes(Q.rest)));
      if (!egen) {
        ut.ikkeEnna = ikkeEnna(Q);
        if (ut.ikkeEnna) return ferdig([]);
      }
      let d = del(finn(Q), Q.ord.length > 0 && !Q.bareFyll);
      if (!fant(d) && Q.krav.length) {
        // The rules left nothing: a game that carries the words just as they stand, in its name,
        // its genre or one of its search words («quick fire party game»).
        const hele = " " + Q.hele + " ";
        d = del(ranger(oppforinger.filter((e) => e.fraser.some((f) => (" " + f + " ").includes(hele))).map((e) => ({ e, hel: 1, poeng: 0, frase: 0 }))), true);
        if (fant(d)) Object.assign(ut, { tekst: true, n: 0, antall: "", kjapt: false, nett: false });
      }
      if (!fant(d) && Q.ord.length) {
        // A typo? Put right the tokens that find nothing on their own, and look again. (Behind a
        // closed door: never towards a word only an 18+ game carries.)
        const ordsett = over18 ? ordAlle : ordApen;
        let endret = false;
        const ord = Q.ord.map((x, i) => {
          const siste = i === Q.ord.length - 1;
          if (finnes(x, siste, ordsett)) return x;
          const r = rett(x, siste, over18);
          if (r) endret = true;
          return r || x;
        });
        if (endret) {
          d = del(finn(Object.assign({}, Q, { ord, rest: ord.join(" "), hele: ord.join(" ") })), true);
          // A word that is only a search word may be somebody's brand: it finds the game, but is never
          // written out. «Viser treff for …» is said only when every word in it is one the page shows
          // – and only when there is a row to show for it.
          const synlig = over18 ? synligAlle : synligApen;
          const vises = (x) => synlig.has(x) || Array.from(synlig).some((y) => y.startsWith(x));
          if (d.rader.length && ord.every(vises)) ut.rettet = ord.join(" ");
        }
      }
      return ferdig(d.rader, d.voksne);
    }

    return { sok, tolk: (q) => tolk(ren(q)), rett, oppforinger: oppforinger.length, viser: (x) => synligAlle.has(x) };
  }

  const api = { lag, ren, flat, mote, avstand, lengstForst, somVariant, bakDora, REGLER, KRAV, IKKE_ENNA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RusjSok = api;
})(typeof self !== "undefined" ? self : this);
