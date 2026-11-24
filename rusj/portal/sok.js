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

   A game is an entry of window.RUSJ_SPILLISTE: { id, navn, undertittel, kort, sok, tagger, spillere,
   minutter, mobiler, rekkefolge, topp?, nett?, motMobilen?, alder18?, varianter?: [{ id, navn,
   undertittel?, sok, spillere?, minutter?, nett? }] } – a variant's own facts only where they differ
   from the game's. */
(function (root) {
  "use strict";

  // Lower case, æ ø å kept, other accents dropped, everything else to single spaces.
  function ren(tekst) {
    return String(tekst == null ? "" : tekst)
      .toLocaleLowerCase("nb")
      .replace(/[æøå]/g, (c) => ({ æ: "\u0001", ø: "\u0002", å: "\u0003" })[c])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[\u0001-\u0003]/g, (c) => ({ "\u0001": "æ", "\u0002": "ø", "\u0003": "å" })[c])
      .replace(/[^a-z0-9æøå ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------- What each edition's words mean ----------
  // All of it as the text looks after ren(): no accents but æøå, no punctuation.
  //   tall      the number words one to twelve (forms of one number split by |)
  //   folk      nouns that make a number a head count: «4 spillere», «to stykker»
  //   vi        «vi er 5»
  //   til       «for to», «til fire» – unless an age follows (ikkeEtter): «for 5 åringer»
  //   to        words that mean the two of us
  //   kjapt     a quick game (the finder's «Kjapt»: a round can be done in under ten minutes)
  //   min       «5 min»: ten or less is «kjapt», more is «a round fits in that time»
  //   nett      played online, each on their own phone (games with "nett")
  //   hver      a phone each: online or around the table
  //   enMobil, flere, alene, mot   the facts on the cards, as before
  //   fyll      little words that say nothing in a search; spill: the word «game» itself
  const REGLER = {
    nb: {
      tall: ["en|ett", "to", "tre", "fire", "fem", "seks", "sju|syv", "åtte", "ni", "ti", "elleve", "tolv"],
      folk: "spillere|spiller|personer|person|stk|stykker|stykk|folk|mann|deltakere|deltagere|venner|voksne|av oss",
      vi: "vi er|vi blir|dere er",
      til: "for|til",
      ikkeEtter: "år|års|åring|åringer|åringen|årige|klasse|trinn",
      to: "par|paret|date|daten|datekveld|date night|kjæreste|kjæresten|kjærester|kjærestepar|tomannsspill",
      kjapt: "kjapt|kjappe|kjapp|raskt|raske|rask|hurtig|lynraskt|kort tid|liten tid|dårlig tid|korte spill|korte runder",
      min: "min|minutt|minutter",
      nett: "på nett|på nettet|online|nettspill|over nett|over nettet|på internett|på avstand",
      hver: "hver sin mobil|hver sin telefon|hver vår mobil|hver sin skjerm|egen mobil",
      enMobil: "(?:en|1|samme) mobil",
      flere: "flere mobiler",
      alene: "alene|solo|en spiller|1 spiller",
      mot: "mot (?:mobilen|maskinen|datamaskinen|datamaskin|data|pc|pcen)",
      fyll: "og i på for med til en et ei som av å vi er det den de gratis regler spille",
      spill: "spill spillet spillene",
    },
    en: {
      tall: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
      folk: "players|player|people|persons|person|of us|friends|adults|guests",
      vi: "we are|we re|there are|there s",
      til: "for",
      ikkeEtter: "year|years|yo|yr|yrs",
      to: "couple|couples|date|date night|partner|girlfriend|boyfriend|husband|wife",
      kjapt: "quick|quickly|fast|short|in a hurry|short on time|little time",
      min: "min|mins|minute|minutes",
      nett: "online|on the net|over the internet|remote|remotely|long distance",
      hver: "own phones|their own phones|our own phones|own phone|a phone each|phone each|separate phones",
      enMobil: "(?:one|1|same) (?:phone|mobile)",
      flere: "(?:several|more) (?:phones|mobiles)",
      alene: "alone|solo|single player|one player|1 player|by myself|on my own",
      mot: "(?:against|vs|versus) (?:the )?(?:phone|computer|cpu|ai|machine)",
      fyll: "and in on for with to a an the of we are is it free rules play",
      spill: "game games",
    },
    da: {
      tall: ["en|et", "to", "tre", "fire", "fem", "seks", "syv", "otte", "ni", "ti", "elleve", "tolv"],
      folk: "spillere|spiller|personer|person|stk|styk|mennesker|mand|deltagere|venner|voksne|af os",
      vi: "vi er|vi bliver",
      til: "for|til",
      ikkeEtter: "år|års|årig|årige|klasse",
      to: "par|parret|date|daten|dateaften|date night|kæreste|kæresten|kærester|kærestepar",
      kjapt: "hurtigt|hurtig|hurtige|lynhurtigt|kort tid|lidt tid|korte spil|korte runder",
      min: "min|minut|minutter",
      nett: "online|på nettet|på net|over nettet|på internettet|på afstand",
      hver: "hver sin mobil|hver sin telefon|hver vores mobil|egen mobil",
      enMobil: "(?:en|1|samme) (?:mobil|telefon)",
      flere: "flere mobiler",
      alene: "alene|solo|en spiller|1 spiller",
      mot: "mod (?:mobilen|computeren|maskinen|pc en|pc)",
      fyll: "og i på for med til en et som af at vi er det den de gratis regler spille",
      spill: "spil spillet spillene",
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

  // ---------- The index of one edition ----------
  // o: { spill: the game list, taggsok: { tag: [words] } (window.RUSJ_TAGGSOK), sprak: "nb" | "en" |
  //      "da", F: the finder (rusj/portal/finner.js), for the bands of «Hvor mange er dere?» }
  function lag(o) {
    const spill = o.spill || [];
    const taggsok = o.taggsok || {};
    const R = REGLER[o.sprak] || REGLER.nb;
    const BAND = o.F.SPILLERE;
    const band = o.F.naermesteBand;

    // An entry: a game, or a variant inside one. ord: [word, tier] (0 name, 1 genre, 2 its own search
    // words and one-liner, 3 the words for its kind of game); fraser: its name, genre and search
    // words whole.
    const oppforinger = [];
    const alleOrd = new Set(); // every word a token can meet
    const vokab = new Map(); // the words a typo may be corrected to → their best tier
    const synlig = new Set(); // the words the page itself shows (names, genres, one-liners, kinds of game)
    function oppforing(s, variant, nr) {
      const ord = new Map();
      const fraser = [];
      const legg = (tekst, trinn, egen, retting, vises) => {
        const r = ren(tekst);
        if (!r) return;
        if (egen) fraser.push(r);
        for (const x of r.split(" ")) {
          if (vises) synlig.add(x);
          if (!ord.has(x) || ord.get(x) > trinn) ord.set(x, trinn);
          alleOrd.add(x);
          if (retting && x.length >= 3 && !/^\d+$/.test(x) && !(vokab.get(x) <= trinn)) vokab.set(x, trinn);
        }
      };
      const k = variant || s;
      legg(k.navn, 0, true, true, true);
      legg(k.undertittel, 1, true, true, true);
      for (const x of k.sok || []) legg(x, 2, true, true, false);
      if (!variant) {
        legg(s.kort, 2, false, false, true);
        for (const tg of s.tagger || []) for (const x of taggsok[tg] || []) legg(x, 3, false, true, true);
      }
      // f: the facts a query is held against (a variant's own, where it has them).
      const f = variant ? Object.assign({}, s, variant.spillere ? { spillere: variant.spillere } : null, variant.minutter ? { minutter: variant.minutter } : null, variant.nett === false ? { nett: false } : null) : s;
      return { s, v: variant || null, f, n: variant ? s.id + "#" + variant.id : s.id, ord: Array.from(ord), fraser, nr };
    }
    for (const s of spill) {
      oppforinger.push(oppforing(s, null, 0));
      (s.varianter || []).forEach((v, i) => oppforinger.push(oppforing(s, v, i + 1)));
    }

    // ---------- Reading the query ----------
    const tall = new Map();
    R.tall.forEach((former, i) => former.split("|").forEach((f) => tall.set(f, i + 1)));
    const N = "(\\d{1,2}|" + Array.from(tall.keys()).join("|") + ")";
    const verdi = (x) => (/^\d+$/.test(x) ? Number(x) : tall.get(x));
    // (The text is padded with a space on each side, so a rule is « word(s)» with a space after.)
    const re = (kilde) => new RegExp(" (?:" + kilde + ")(?= )");
    const RE = {
      enMobil: re(R.enMobil),
      flere: re(R.flere),
      hver: re(R.hver),
      mot: re(R.mot),
      alene: re(R.alene),
      nett: re(R.nett),
      kjapt: re(R.kjapt),
      min: re(N + " (?:" + R.min + ")"),
      omrade: re("(\\d{1,2})(?: (?:til|to|eller|or))? (\\d{1,2}) (?:" + R.folk + ")"),
      vi: re("(?:" + R.vi + ") " + N + "(?: (?:" + R.folk + "))?"),
      folk: re(N + " (?:" + R.folk + ")"),
      til: new RegExp(" (?:" + R.til + ") " + N + "(?: (?:" + R.folk + "))?(?= )(?! (?:" + R.ikkeEtter + ") )"),
      to: re(R.to),
    };
    const FYLL = new Set((R.fyll + " " + R.spill).split(" "));

    // What a query asks for: { hele (the text as typed, cleaned), rest (what the rules left), ord
    // (the tokens to look for), krav ([{ passer, myk }]), antall (the finder's band, or ""), kjapt, nett }.
    function tolk(q) {
      const hele = ren(q);
      const ut = { hele, rest: hele, ord: [], krav: [], antall: "", kjapt: false, nett: false };
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
      // The head count, as the finder's «Hvor mange er dere?»: a game fits when every count in the
      // band can play it.
      let omfang = null;
      if ((m = ta(RE.omrade))) omfang = [Math.min(Number(m[1]), Number(m[2])), Math.max(Number(m[1]), Number(m[2]))];
      else if ((m = ta(RE.vi) || ta(RE.folk) || ta(RE.til))) ut.antall = band(verdi(m[1]));
      else if (ta(RE.to)) ut.antall = "2";
      if (ut.antall) omfang = BAND[ut.antall];
      else if (omfang) ut.antall = band(omfang[0]);
      if (omfang) ut.krav.push({ passer: (s) => s.spillere[0] <= omfang[0] && s.spillere[1] >= omfang[1] });
      ut.rest = t.trim();
      const ord = ut.rest ? ut.rest.split(" ") : [];
      const rene = ord.filter((x) => !FYLL.has(x));
      ut.ord = rene.length || ut.krav.length ? rene : ord;
      return ut;
    }

    // ---------- Finding ----------

    // Does any entry have a word this token can meet? (Else it may be a typo.)
    function finnes(token, siste) {
      const start = siste || token.length >= 3;
      for (const x of alleOrd) if (mote(token, x, start) >= 0) return true;
      return false;
    }

    // Best first: the query itself, where the words were found, the whole phrase, a game before a
    // variant, «Mest spilt nå», the site's order.
    const plass = (s) => (typeof s.topp === "number" ? s.topp : Infinity);
    const orden = (s) => (typeof s.rekkefolge === "number" ? s.rekkefolge : Infinity);
    const ranger = (liste) =>
      liste
        .sort((a, b) => a.hel - b.hel || a.poeng - b.poeng || a.frase - b.frase || (a.e.v ? 1 : 0) - (b.e.v ? 1 : 0) || plass(a.e.s) - plass(b.e.s) || orden(a.e.s) - orden(b.e.s) || a.e.nr - b.e.nr)
        .map((x) => x.e);

    // The entries a reading of the query finds.
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
        let poeng = 0; // tier × 3 + how the word was met: the weakest of the tokens counts
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

    // The nearest word we know for a token that finds nothing: one edit away for 4–7 letters, two
    // for 8 or more. Never a word of three letters or fewer (a short word is one edit from almost
    // anything: «fifa» is not «fia»). siste: the token is still being typed, so from six letters the
    // start of a longer word counts too («selksap» on its way to «selskapsleker»).
    function rett(token, siste) {
      const maks = /^\d+$/.test(token) ? 0 : token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0;
      if (!maks) return null;
      let best = null;
      for (const [x, trinn] of vokab) {
        if (x.length < 4) continue;
        let d = avstand(token, x, maks);
        // (half a step behind a whole word at the same distance)
        if (d > maks && siste && token.length >= 6 && x.length > token.length) d = avstand(token, x.slice(0, token.length), maks) + 0.5;
        if (d > maks + 0.5) continue;
        const k = [d, x[0] === token[0] ? 0 : 1, trinn, x];
        if (!best || k[0] < best[0] || (k[0] === best[0] && (k[1] < best[1] || (k[1] === best[1] && (k[2] < best[2] || (k[2] === best[2] && k[3] < best[3])))))) best = k;
      }
      return best ? best[3] : null;
    }

    // A well-known game that is not here: its number in IKKE_ENNA, the nearest games and the room.
    function ikkeEnna(Q) {
      const navn = [Q.hele, Q.rest, Q.ord.join(" ")];
      const nr = IKKE_ENNA.findIndex((x) => x.ord.some((n) => navn.includes(n)));
      if (nr < 0) return null;
      const av = new Map(spill.map((s) => [s.id, s]));
      return { nr, spill: (IKKE_ENNA[nr].spill || []).map((id) => av.get(id)).filter(Boolean), rom: IKKE_ENNA[nr].rom || "" };
    }

    // The search. Returns { tom (nothing typed), treff: [{ s, v, n }] best first (n: the game's id,
    // or «id#variant»), av: Map(n → place), tekst (words were looked for, not only facts), antall,
    // kjapt, nett (what the rules read), rettet (the words shown after a typo was put right, or ""),
    // ikkeEnna (null, or { nr, spill, rom } for a known game that is not here) }.
    function sok(q) {
      const Q = tolk(q);
      const ut = { tom: !Q.hele, treff: [], av: new Map(), tekst: Q.ord.length > 0, antall: Q.antall, kjapt: Q.kjapt, nett: Q.nett, rettet: "", ikkeEnna: null };
      const ferdig = (funn) => {
        ut.treff = funn.map((e) => ({ s: e.s, v: e.v, n: e.n }));
        ut.treff.forEach((x, i) => ut.av.set(x.n, i));
        return ut;
      };
      if (ut.tom) return ferdig(oppforinger.filter((e) => !e.v));
      // A game that carries the query as a name of its own always wins over the «not yet» list.
      const egen = oppforinger.some((e) => e.fraser.includes(Q.hele) || (!!Q.rest && e.fraser.includes(Q.rest)));
      if (!egen) {
        ut.ikkeEnna = ikkeEnna(Q);
        if (ut.ikkeEnna) return ferdig([]);
      }
      let funn = let_(Q, false);
      if (!funn.length && Q.krav.some((k) => k.myk) && Q.ord.length) funn = let_(Q, true);
      if (!funn.length && Q.krav.length) {
        // The rules left nothing: a game that carries the words just as they stand, in its name,
        // its genre or one of its search words («quick fire party game»).
        const hele = " " + Q.hele + " ";
        funn = ranger(oppforinger.filter((e) => e.fraser.some((f) => (" " + f + " ").includes(hele))).map((e) => ({ e, hel: 1, poeng: 0, frase: 0 })));
        if (funn.length) Object.assign(ut, { tekst: true, antall: "", kjapt: false, nett: false });
      }
      if (!funn.length && Q.ord.length) {
        // A typo? Put right the tokens that find nothing on their own, and look again.
        let endret = false;
        const ord = Q.ord.map((x, i) => {
          const siste = i === Q.ord.length - 1;
          if (finnes(x, siste)) return x;
          const r = rett(x, siste);
          if (r) endret = true;
          return r || x;
        });
        // A word that is only a search word may be somebody's brand: it finds the game, but is never
        // written out. «Viser treff for …» is shown only when every word in it is one the page shows.
        const vises = (x) => synlig.has(x) || Array.from(synlig).some((y) => y.startsWith(x));
        const skjult = !ord.every(vises);
        if (endret) {
          const Q2 = Object.assign({}, Q, { ord, rest: ord.join(" "), hele: ord.join(" ") });
          funn = let_(Q2, false);
          if (!funn.length && Q.krav.some((k) => k.myk)) funn = let_(Q2, true);
          if (funn.length) ut.rettet = skjult ? "" : ord.join(" ");
        }
      }
      return ferdig(funn);
    }

    return { sok, tolk, rett, oppforinger: oppforinger.length, viser: (x) => synlig.has(x) };
  }

  const api = { lag, ren, mote, avstand, REGLER, KRAV, IKKE_ENNA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RusjSok = api;
})(typeof self !== "undefined" ? self : this);
