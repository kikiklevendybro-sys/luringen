/* Sauen — "Tenk som flokken": 3–12 players. A question ("En frukt som er gul"), everyone gives one
   answer in secret, and everyone in the single biggest group of equal answers scores. Whoever
   stands completely alone gets the black sheep — and while you hold it, you can't win. First to
   the target without it wins. Two ways to answer:
   · «Én mobil»: the phone goes round and everyone types. The app groups equal answers (also
     banan/bananer and a doubled letter), the players merge answers that mean the same, and a
     reveal shows who thought alike.
   · «Alle samtidig»: everyone writes on a note or on their own phone while this phone shows the
     question and a 20-second ring. After «3 – 2 – 1 – vis!» the players tap who is in the flock
     and, when it can matter, who stood alone. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const D = window.RUSJ_DATA.sporsmal;

  // =====================================================================================
  // Answer matching and scoring — pure functions, exposed as window.SauenSvar for the tests.
  // =====================================================================================

  // Irregular noun forms → base form (the regular ones are handled by ENDELSER).
  const UREGELRETT = {
    menn: "mann", mennene: "mann", bøker: "bok", bøkene: "bok", føtter: "fot", føttene: "fot",
    hender: "hånd", hendene: "hånd", tenner: "tann", tennene: "tann", netter: "natt", nettene: "natt",
    røtter: "rot", røttene: "rot", bønder: "bonde", bøndene: "bonde", kyr: "ku", kyrne: "ku",
    gjess: "gås", gjessene: "gås", tær: "tå", tærne: "tå", knær: "kne", knærne: "kne", trær: "tre",
    trærne: "tre", strender: "strand", strendene: "strand", øyne: "øye", øynene: "øye", brødre: "bror",
    brødrene: "bror", døtre: "datter", døtrene: "datter", mødre: "mor", mødrene: "mor", fedre: "far",
    fedrene: "far", søstre: "søster", søstrene: "søster", ender: "and", endene: "and", stenger: "stang",
    tenger: "tang",
  };
  // Endings of definite and plural nouns (bilen, biler, bilene, huset, jenta), adjectives (rødt,
  // røde, blått) and verbs (kaster, kastet). Longest first. Past tense -te/-de is left out on
  // purpose: it would make bilde match bil and matte match mat.
  const ENDELSER = ["ene", "ane", "er", "ar", "en", "et", "tt", "a", "e", "t", "r", "n"];

  // The key a single word is compared by: lower case, accents and punctuation gone, no spaces.
  const nokkel = (tekst) => R.normaliser(tekst).replace(/ /g, "");

  // Possible base forms of one key: the key itself, an irregular base and the key minus one ending.
  function stammer(ord) {
    const ut = new Set([ord]);
    if (UREGELRETT[ord]) ut.add(UREGELRETT[ord]);
    // støvel → støvler, sykkel → sykler, finger → fingre: the e before a final l or r drops out.
    const el = /^(.*[^aeiouyæøå])e([lr])$/.exec(ord);
    if (el) {
      const uten = el[1] + el[2];
      ut.add(uten);
      ut.add(uten.replace(/([^aeiouyæøå])\1([lr])$/, "$1$2"));
    }
    for (const e of ENDELSER) {
      if (!ord.endsWith(e) || ord.length - e.length < 2) continue;
      const rest = ord.slice(0, -e.length);
      // A one-letter ending never splits a double letter (katt is not kat + t, mann is not man + n),
      // and leaves at least three letters unless it's -a (kua → ku): kur is not ku + r.
      if (e.length === 1 && (rest.endsWith(e) || (rest.length < 3 && e !== "a"))) continue;
      // -tt only after a short vowel word: blå → blått, ny → nytt (not kassett → kasse).
      if (e === "tt" && (rest.length > 3 || !/[aeiouyæøå]$/.test(rest))) continue;
      ut.add(rest);
      // dam → dammen, rom → rommet: the m is doubled before an ending.
      if (rest.endsWith("mm") && e.length >= 2) ut.add(rest.slice(0, -1));
      // grønn → grønt, trygg → trygt: the double letter is dropped before the t.
      if (e === "t" && /[ng]$/.test(rest) && !/(nn|gg)$/.test(rest)) ut.add(rest + rest.slice(-1));
    }
    return ut;
  }

  // The same word with one letter doubled or not (bannan/banan, kafe/kaffe): the most common slip
  // on a phone keyboard. Wider typo rules made real words match (Island/Irland, bjørn/bjørk).
  function dobbel(a, b) {
    if (Math.abs(a.length - b.length) !== 1) return false;
    const [kort, lang] = a.length < b.length ? [a, b] : [b, a];
    for (let i = 0; i < lang.length - 1; i++) {
      if (lang[i] === lang[i + 1] && lang.slice(0, i) + lang.slice(i + 1) === kort) return true;
    }
    return false;
  }

  // Two single-word keys mean the same: equal, a shared base form (banan/bananer, katt/kattene,
  // mann/menn) or the same word with one letter doubled (banan/bannan).
  function likeOrd(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const sa = stammer(a);
    for (const s of stammer(b)) if (sa.has(s) && (s.length >= 3 || s === a || s === b)) return true;
    return Math.min(a.length, b.length) >= 4 && dobbel(a, b);
  }

  // The words of an answer, without a leading article: "en banan" → ["banan"].
  const ARTIKLER = new Set(["en", "ei", "et", "den", "det", "de", "noen"]);
  function ordene(tekst) {
    const ord = R.normaliser(tekst).split(" ").filter(Boolean);
    return ord.length > 1 && ARTIKLER.has(ord[0]) ? ord.slice(1) : ord;
  }

  // Two answers mean the same: the same word(s) in some form, also with or without spaces
  // ("is krem" / "iskrem") and with or without an article ("en banan" / "banan").
  function likeSvar(a, b) {
    const oa = ordene(a);
    const ob = ordene(b);
    if (!oa.length || !ob.length) return false;
    if (likeOrd(oa.join(""), ob.join(""))) return true;
    return oa.length === ob.length && oa.length > 1 && oa.every((o, i) => likeOrd(o, ob[i]));
  }

  // Groups typed answers. Answers that are exactly the same after normalising form one unit that
  // can never be split; units that count as the same are grouped. → { enheter, grupper }
  // enheter: arrays of answer indexes · grupper: arrays of unit indexes.
  function grupperSvar(tekster) {
    const enheter = [];
    const nokler = [];
    tekster.forEach((t, n) => {
      const k = ordene(t).join(" ");
      const i = nokler.indexOf(k);
      if (i >= 0) enheter[i].push(n);
      else {
        nokler.push(k);
        enheter.push([n]);
      }
    });
    const mor = enheter.map((_, i) => i);
    const finn = (x) => (mor[x] === x ? x : (mor[x] = finn(mor[x])));
    for (let a = 0; a < enheter.length; a++) {
      for (let b = a + 1; b < enheter.length; b++) {
        if (likeSvar(tekster[enheter[a][0]], tekster[enheter[b][0]])) mor[finn(b)] = finn(a);
      }
    }
    const grupper = [];
    const plass = {};
    enheter.forEach((_, i) => {
      const rot = finn(i);
      if (plass[rot] == null) {
        plass[rot] = grupper.length;
        grupper.push([]);
      }
      grupper[plass[rot]].push(i);
    });
    return { enheter, grupper };
  }

  // Scores one round. grupper: arrays of player indexes; sau: who holds the black sheep (−1 = nobody).
  // The single biggest group is the flock (a tie for biggest → no flock). If exactly one player is
  // alone, the black sheep moves to them; otherwise it stays where it is.
  function regnUt(grupper, sau) {
    const storst = Math.max(0, ...grupper.map((g) => g.length));
    const topp = grupper.filter((g) => g.length === storst);
    const flokk = topp.length === 1 && storst > 1 ? topp[0].slice() : null;
    const alene = grupper.filter((g) => g.length === 1).map((g) => g[0]);
    return { flokk, uavgjort: !flokk && storst > 1, alene, sau: alene.length === 1 ? alene[0] : sau };
  }

  // Winners: everyone with at least `mal` points who doesn't hold the black sheep.
  const vinnere = (poeng, sau, mal) => poeng.map((p, i) => (p >= mal && i !== sau ? i : -1)).filter((i) => i >= 0);

  // «Alle samtidig»: the players tap the result instead of typing. utfall is "flokk" (flokk = the
  // players in the single biggest group), "uavgjort" (the biggest groups are equally big) or
  // "ingen" (everyone answered something different). What follows from the taps:
  // sporr = the phone has to ask whether exactly one player stood alone, kandidater = who that
  // can be, alene = the players known to be alone without asking.
  function aleneSporsmal(antall, utfall, flokk) {
    const alle = Array.from({ length: antall }, (_, i) => i);
    if (utfall === "ingen") return { sporr: false, kandidater: [], alene: alle };
    // A tie is between groups of two or more: someone can only be alone when five or more play.
    if (utfall === "uavgjort") return { sporr: antall >= 5, kandidater: antall >= 5 ? alle : [], alene: [] };
    const andre = alle.filter((i) => !flokk.includes(i));
    // A flock of two beats only single answers, so everyone else is alone. One player left over
    // is alone too.
    if (flokk.length === 2 || andre.length <= 1) return { sporr: false, kandidater: [], alene: andre };
    return { sporr: true, kandidater: andre, alene: [] };
  }

  // The same result as regnUt, from the taps. enslig: the one player who stood alone when the
  // phone had to ask (−1 = nobody, or more than one).
  function regnUtAlle(antall, utfall, flokk, enslig, sau) {
    const a = aleneSporsmal(antall, utfall, flokk);
    const alene = a.sporr ? (a.kandidater.includes(enslig) ? [enslig] : []) : a.alene;
    return {
      flokk: utfall === "flokk" ? flokk.slice().sort((x, y) => x - y) : null,
      uavgjort: utfall === "uavgjort",
      alene,
      sau: alene.length === 1 ? alene[0] : sau,
    };
  }

  // «Jul» is in season from 1 November to 6 January (Oslo time). → the year the season started
  // (2026 also in January 2027), 0 outside it. dag: "YYYY-MM-DD".
  function julesesong(dag) {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(dag));
    if (!m) return 0;
    const [ar, mnd, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mnd >= 11 && mnd <= 12) return ar;
    return mnd === 1 && d <= 6 ? ar - 1 : 0;
  }

  // The target follows the group until the players choose one themselves: a small group needs
  // more questions to tell a winner, a big group takes longer per question.
  const standardMal = (antall) => (antall <= 4 ? 8 : antall <= 7 ? 6 : 5);

  // About how many minutes a game takes, in steps of five. A game needs about 1.6 questions per
  // point of the target. One phone: about 11 s per player to hand over and type, plus the reveal.
  // Everyone at once: 20 s to write, the countdown and a couple of taps.
  function anslag(antall, mal, modus) {
    const sekunder = modus === "alle" ? 50 + antall * 1.5 : 40 + antall * 11;
    return Math.max(5, Math.round((mal * 1.6 * sekunder) / 60 / 5) * 5);
  }

  window.SauenSvar = { nokkel, stammer, likeOrd, ordene, likeSvar, grupperSvar, regnUt, vinnere, aleneSporsmal, regnUtAlle, julesesong, standardMal, anslag };

  // =====================================================================================
  // Questions and packs
  // =====================================================================================

  // A question is a string, or { t, bred: true } for the widest ones («Et tall mellom 1 og 100»),
  // which rarely give a flock when three or four play. The deck remembers questions by number, so
  // the order of the data file is fixed: new packs go last, and the setup screen moves «Jul»
  // first while it is the season.
  const ALLE = [];
  D.pakker.forEach((p) => p.sporsmal.forEach((q) => ALLE.push({ p: p.id, t: String(typeof q === "string" ? q : q.t), bred: !!(q && q.bred) })));
  const PAKKER = D.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  const ALLE_PAKKER = PAKKER.map((p) => p.id);
  const STANDARD_PAKKER = ALLE_PAKKER.filter((id) => id !== "jul"); // «Jul» follows the season
  // The packs a setup knew when it was saved before `kjent` existed.
  const FORSTE_PAKKER = ["mat", "dyr", "hverdag", "norsk", "fritid", "reise", "tenk", "jobb", "voksen", "rart", "aaret", "barn"];
  const MAL = [5, 6, 8, 12];
  const TID = 20; // seconds to write an answer in «Alle samtidig»
  const MODUSER = [
    { v: "en", tittel: "Én mobil", tekst: "Send den rundt, og skriv etter tur", ikon: "📱" },
    { v: "alle", tittel: "Alle samtidig", tekst: "På lapper eller hver sin mobil", ikon: "📝" },
  ];
  // The screens a game can be on, by the way of answering.
  const SPILLSKJERMER = { en: ["sporsmal", "skriv", "avslor", "poeng"], alle: ["klar", "sporsmal", "flokk", "alene", "poeng"] };
  const TALL = ["null", "én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve", "tolv"];
  const stokk = R.kortstokk("sporsmal", ALLE.length);

  function nyttSporsmal(S) {
    const sp = S.spill;
    const valgt = new Set(S.oppsett.pakker);
    const forrige = sp.r ? sp.r.q : -1;
    const smal = sp.antall <= 4; // the widest questions are saved for bigger groups
    let i = stokk.neste((n) => n !== forrige && valgt.has(ALLE[n].p) && !(smal && ALLE[n].bred));
    if (i < 0) i = stokk.neste((n) => n !== forrige && valgt.has(ALLE[n].p));
    if (i < 0) i = stokk.neste((n) => n !== forrige);
    return i;
  }

  const sesong = () => (pakke("jul") ? julesesong(R.dag().tekst) : 0);
  // In the season «Jul» is switched on once (a player who switches it off again keeps it off).
  // After the season it is switched off (a player who switches it on by hand in June keeps it).
  function julRegel(S) {
    const ar = sesong();
    const o = S.oppsett;
    if (ar && S.jul !== ar) {
      o.pakker = ALLE_PAKKER.filter((id) => id === "jul" || o.pakker.includes(id));
      S.jul = ar;
    } else if (!ar && S.jul) {
      o.pakker = o.pakker.filter((id) => id !== "jul");
      if (!o.pakker.length) o.pakker = STANDARD_PAKKER.slice();
      S.jul = 0;
    }
  }

  const malFor = (S) => (MAL.includes(S.oppsett.mal) ? S.oppsett.mal : standardMal(R.klamp(S.antall || 4, 3, 12)));

  // =====================================================================================
  // Saved state: everything is checked on load, so a damaged save can never give a blank page.
  // =====================================================================================

  const erHeltall = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  const erListe = (a, test) => Array.isArray(a) && a.every(test);
  // Every number from 0 to n − 1 exactly once, spread over the lists in any order.
  function dekker(lister, n) {
    if (!erListe(lister, Array.isArray)) return false;
    const alle = lister.flat();
    return alle.length === n && new Set(alle).size === n && alle.every((x) => erHeltall(x, 0, n - 1));
  }
  const erGruppering = (g, n) => erListe(g, (x) => Array.isArray(x) && x.length > 0) && dekker(g, n);

  function gyldigRes(res, n) {
    const spiller = (x) => erHeltall(x, 0, n - 1);
    const tall = (a) => Array.isArray(a) && a.length === n && a.every((x) => erHeltall(x, 0, 9999));
    const f = res && res.for;
    return (
      !!res &&
      typeof res === "object" &&
      (res.flokk === null || (erListe(res.flokk, spiller) && res.flokk.length >= 2)) &&
      erListe(res.alene, spiller) &&
      erHeltall(res.forrigeSau, -1, n - 1) &&
      erHeltall(res.sau, -1, n - 1) &&
      typeof res.tekst === "string" &&
      erListe(res.like, (t) => typeof t === "string") &&
      typeof res.aleneTekst === "string" &&
      !!f &&
      typeof f === "object" &&
      tall(f.poeng) &&
      tall(f.iFlokk) &&
      tall(f.alene) &&
      erHeltall(f.sau, -1, n - 1) &&
      erHeltall(f.logg, 0, 99999)
    );
  }

  // Is this a game the screens can draw? Small things are repaired in place.
  function gyldigSpill(sp) {
    if (!sp || typeof sp !== "object") return false;
    const n = sp.antall;
    if (!erHeltall(n, 3, 12) || !erHeltall(sp.mal, 1, 99)) return false;
    const spiller = (x) => erHeltall(x, 0, n - 1);
    const tall = (a) => Array.isArray(a) && a.length === n && a.every((x) => erHeltall(x, 0, 9999));
    if (!tall(sp.poeng) || !tall(sp.iFlokk) || !tall(sp.alene)) return false;
    if (!erHeltall(sp.sau, -1, n - 1) || !spiller(sp.start) || !erHeltall(sp.nr, 1, 99999)) return false;
    if (!Array.isArray(sp.logg) || !erListe(sp.vinnere, spiller)) return false;
    if ((sp.modus !== "en" && sp.modus !== "alle") || !SPILLSKJERMER[sp.modus].includes(sp.skjerm)) return false;
    for (const felt of ["ferdig", "tidlig", "feiret", "sauUte"]) sp[felt] = !!sp[felt];
    if (sp.sauUte && sp.sau !== -1) return false;
    const r = sp.r;
    if (!r || typeof r !== "object" || !erHeltall(r.q, 0, ALLE.length - 1)) return false;
    if (r.res != null && !gyldigRes(r.res, n)) return false;
    if (sp.skjerm === "poeng" && !r.res) return false;
    if (sp.modus === "en") {
      if (!dekker([r.rekke], n)) return false;
      if (!erListe(r.svar, (s) => !!s && typeof s === "object" && spiller(s.i) && typeof s.t === "string" && s.t.length <= 200 && !!R.normaliser(s.t))) return false;
      if (r.svar.length > n || r.na !== r.svar.length || r.svar.some((s, k) => s.i !== r.rekke[k])) return false;
      const alleHarSvart = r.svar.length === n;
      if (sp.skjerm === "skriv" ? alleHarSvart : sp.skjerm !== "sporsmal" && !alleHarSvart) return false;
      if (alleHarSvart) {
        if (!erGruppering(r.enheter, n) || !erGruppering(r.grupper, r.enheter.length)) return false;
        r.avslort = !!r.avslort;
        if (!Array.isArray(r.rekkefolge)) return false;
        if (!r.avslort && !(dekker([r.rekkefolge], r.grupper.length) && erHeltall(r.vist, 0, r.grupper.length))) return false;
        if (!erHeltall(r.valgt, -1, r.grupper.length - 1)) r.valgt = -1;
        r.angre = Array.isArray(r.angre) ? r.angre.filter((g) => erGruppering(g, r.enheter.length)) : [];
      }
    } else {
      if (typeof r.tid !== "number" || !(r.tid >= 0 && r.tid <= TID)) r.tid = TID;
      if (!erListe(r.flokk, spiller) || new Set(r.flokk).size !== r.flokk.length) return false;
      if (!["", "flokk", "uavgjort", "ingen"].includes(r.utfall) || !erHeltall(r.enslig, -1, n - 1)) return false;
      if (sp.skjerm === "alene") {
        // The question about standing alone only exists for some results: otherwise back to the flock.
        const kan = !sp.sauUte && (r.utfall === "uavgjort" || (r.utfall === "flokk" && r.flokk.length >= 2)) && aleneSporsmal(n, r.utfall, r.flokk).sporr;
        if (!kan) {
          sp.skjerm = "flokk";
          r.utfall = "";
        }
      }
    }
    return true;
  }

  // The last winners, for the home screen: { v: [names as they were] }.
  const gyldigSist = (x) =>
    x && typeof x === "object" && Array.isArray(x.v) && x.v.length >= 1 && x.v.length <= 12 && x.v.every((n) => typeof n === "string" && n.trim()) ? { v: x.v.map((n) => R.kutt(n.trim(), 16)) } : null;

  // =====================================================================================
  // Game flow
  // =====================================================================================

  let H; // the actions, so one can call another
  let opptatt = false; // a reveal animation is running
  let puls = -1; // the group that was just merged (animated once)
  let nyttKort = -1; // the group revealed last (slides in once)
  let ring = null; // the clock on the question in «Alle samtidig»
  let teller = false; // «3 – 2 – 1 – vis!» is running

  const alleSpillere = (n) => Array.from({ length: n }, (_, i) => i);
  // A game is in progress until «Kåringen» has been shown.
  const pagar = (S) => !!(S.spill && !S.spill.feiret);

  function nyttSpill(S) {
    const antall = R.klamp(Math.round(S.antall) || 4, 3, 12);
    S.antall = antall;
    S.spill = {
      antall,
      modus: S.oppsett.modus,
      mal: malFor(S),
      sauUte: antall === 3, // three players: the black sheep would change hands on every 2–1 split
      poeng: Array(antall).fill(0),
      iFlokk: Array(antall).fill(0),
      alene: Array(antall).fill(0),
      sau: -1,
      start: R.heltall(0, antall - 1),
      nr: 0,
      logg: [],
      r: null,
      skjerm: "sporsmal",
      ferdig: false,
      tidlig: false,
      feiret: false,
      vinnere: [],
    };
    nyRunde(S);
    R.statistikk("start", { modus: S.spill.modus, spillere: antall });
  }

  function nyRunde(S) {
    const sp = S.spill;
    const forste = (sp.start + sp.nr) % sp.antall;
    sp.nr += 1;
    sp.r = {
      q: -1,
      // «Én mobil»: who answers in which order, the answers and how they are grouped
      rekke: Array.from({ length: sp.antall }, (_, k) => (forste + k) % sp.antall),
      na: 0,
      svar: [],
      enheter: [],
      grupper: [],
      valgt: -1,
      angre: [],
      rekkefolge: [],
      vist: 0,
      avslort: false,
      // «Alle samtidig»: seconds left on the clock and what the players tapped
      tid: TID,
      flokk: [],
      utfall: "",
      enslig: -1,
      res: null,
    };
    sp.r.q = nyttSporsmal(S);
  }

  // Players in a merge group, and the texts that group stands for.
  const spillereI = (r, g) => g.flatMap((u) => r.enheter[u].map((k) => r.svar[k].i));
  const forStor = (t) => (t ? t.charAt(0).toLocaleUpperCase("nb") + t.slice(1) : t);
  function teksterI(r, svarIdx) {
    // Distinct spellings (by normalised key), most common first.
    const telling = new Map();
    svarIdx.forEach((k) => {
      const t = r.svar[k].t.trim();
      const n = R.normaliser(t);
      const f = telling.get(n);
      if (f) f.antall += 1;
      else telling.set(n, { t, antall: 1 });
    });
    return Array.from(telling.values())
      .sort((a, b) => b.antall - a.antall || a.t.length - b.t.length)
      .map((f) => forStor(f.t));
  }
  const gruppeSvar = (r, g) => g.flatMap((u) => r.enheter[u]);
  const storrelse = (r, n) => gruppeSvar(r, r.grupper[n]).length;
  // «A», «A og B», «A, B og C» (the kit's shared wording)
  const liste = (deler) => R.ramsOpp(deler);
  const navnene = (spillere) =>
    liste(
      spillere
        .slice()
        .sort((a, b) => a - b)
        .map((i) => R.navn(i)),
    );

  // Gives the points of a round and remembers what is needed to take them back («Angre»).
  // ut: the result from regnUt / regnUtAlle; tekster: the typed answers behind it («Én mobil»).
  function delUt(S, ut, tekster) {
    const sp = S.spill;
    const r = sp.r;
    const sau = sp.sauUte ? -1 : ut.sau; // three players: the sheep is at pasture
    r.res = {
      flokk: ut.flokk,
      uavgjort: !!ut.uavgjort,
      alene: ut.alene,
      forrigeSau: sp.sau,
      sau,
      tekst: tekster.tekst || "",
      like: tekster.like || [],
      aleneTekst: tekster.aleneTekst || "",
      for: { poeng: sp.poeng.slice(), iFlokk: sp.iFlokk.slice(), alene: sp.alene.slice(), sau: sp.sau, logg: sp.logg.length },
    };
    (ut.flokk || []).forEach((i) => {
      sp.poeng[i] += 1;
      sp.iFlokk[i] += 1;
    });
    ut.alene.forEach((i) => (sp.alene[i] += 1));
    sp.sau = sau;
    sp.logg.push({ q: r.q, n: ut.flokk ? ut.flokk.length : 0, sau });
    const v = vinnere(sp.poeng, sp.sau, sp.mal);
    if (v.length) {
      sp.ferdig = true;
      sp.vinnere = v;
    }
    R.gaTil("poeng");
    if (sau >= 0 && sau !== r.res.forrigeSau) {
      R.lyd.latter();
      R.vibrer([60, 50, 60]);
    } else if (ut.flokk) R.lyd.pling();
  }

  // «Alle samtidig»: from the flock straight to the points, or by way of «Sto noen helt alene?».
  function videreFraFlokk(S) {
    const sp = S.spill;
    const r = sp.r;
    r.enslig = -1;
    if (!sp.sauUte && aleneSporsmal(sp.antall, r.utfall, r.flokk).sporr) R.gaTil("alene");
    else delUt(S, regnUtAlle(sp.antall, r.utfall, r.flokk, -1, sp.sau), {});
  }

  // ---------- The clock in «Alle samtidig» ----------

  function startRing(S) {
    const r = S.spill.r;
    if (ring) ring.stopp();
    ring = null;
    if (!(r.tid > 0)) return;
    ring = new R.Timer({
      id: "sau-ring",
      sekunder: r.tid,
      visning: "sek",
      alarm: false, // the countdown that follows is the signal
      vedTikk(sek) {
        r.tid = sek;
        const el = document.getElementById("sau-ring");
        if (el) el.classList.toggle("snart", sek <= 5);
        R.lagre(); // a reload carries on from here
      },
      vedSlutt() {
        r.tid = 0;
        if (!R.arkApent()) H["vis-na"](null, null, S);
      },
    });
    ring.total = TID; // after a reload the ring shows what is left of the whole time
    ring.start();
  }
  const pauseRing = () => {
    if (ring && ring.kjorer) ring.pause();
  };
  // Never count down behind a locked phone or another tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseRing();
  });

  // ---------- The end of a game ----------

  // The fun titles: who was in the flock most often, who stood alone most often.
  function priser(sp) {
    const mest = (tall) => {
      const maks = Math.max(0, ...tall);
      const hvem = tall.map((n, i) => (n === maks ? i : -1)).filter((i) => i >= 0);
      return maks > 0 && hvem.length <= 2 ? { navn: liste(hvem.map((i) => R.navn(i))), hvem, n: maks } : null;
    };
    const ulv = mest(sp.alene);
    return {
      flokkdyr: mest(sp.iFlokk),
      // (not when the same player is left with the black sheep: that title says it already)
      ulv: ulv && !(ulv.hvem.length === 1 && ulv.hvem[0] === sp.sau) ? ulv : null,
    };
  }

  // Rows for «Kveldens gjeng»: the winners first — also when the holder of the black sheep has
  // more points than them — then the others by points.
  function kveldRader(sp) {
    const topp = Math.max(...sp.poeng);
    return sp.poeng.map((p, i) => ({ i, poeng: sp.vinnere.includes(i) ? topp + 1 : p }));
  }

  // One or two short lines to share. Names of winners and title holders only — never an answer.
  function delTekst(sp) {
    const v = sp.vinnere;
    const deler = [v.length ? `Sauen 🐑 ${navnene(v)} vant med ${R.flertall(Math.max(...v.map((i) => sp.poeng[i])), "poeng", "poeng")}.` : "Sauen 🐑 Ingen vinner denne gangen."];
    const p = priser(sp);
    if (p.flokkdyr) deler.push(`Flokkdyret i kveld: ${p.flokkdyr.navn}.`);
    if (sp.sau >= 0) deler.push(`Kveldens svarte sau: ${R.navn(sp.sau)} 🖤`);
    return deler.join(" ");
  }

  const sistTekst = (sist) => (sist.v.length > 2 ? `${sist.v.length} delte seieren` : `${liste(sist.v)} vant`);

  // ---------- Markup helpers ----------

  const svartSau = (klasse) => R.figur("sauen", "sau-merke " + (klasse || ""), { svart: true });
  const medSau = (S, i, storrelse) =>
    `<span class="sau-ramme ${storrelse || ""}">${R.avatar(i, storrelse)}${S.spill && S.spill.sau === i ? svartSau(storrelse) : ""}</span>`;

  function poengtavle(S, pluss) {
    const sp = S.spill;
    const rekke = alleSpillere(sp.antall).sort((a, b) => sp.poeng[b] - sp.poeng[a] || a - b);
    const topp = Math.max(...sp.poeng);
    return `<ol class="sau-tavle">${rekke
      .map((i) => {
        const p = sp.poeng[i];
        const pips = Array.from({ length: sp.mal }, (_, n) => `<i class="${n < p ? "fylt" : ""}"></i>`).join("");
        return `<li class="${sp.sau === i ? "har-sau" : ""} ${p === topp && p > 0 ? "leder" : ""}">
          ${medSau(S, i)}
          <span class="sau-tavle-navn"><b>${esc(R.navn(i))}</b>${sp.sau === i ? '<span class="vh">, har den svarte sauen</span>' : ""}<span class="sau-tavle-linje"><span class="sau-pips" aria-hidden="true">${pips}</span>${
            (pluss || []).includes(i) ? '<span class="pluss">+1</span>' : ""
          }</span></span>
          <span class="sum">${p}<span class="vh"> poeng</span></span>
        </li>`;
      })
      .join("")}</ol>`;
  }

  // One group of answers as a card; n = index in r.grupper. o: { spot (the newest during the reveal),
  // inn (slide in), ferdig, flokk, uavgjort, svart, knapp (tap to merge, ✂ to split) }.
  function gruppekort(S, n, o) {
    const r = S.spill.r;
    const svar = gruppeSvar(r, r.grupper[n]);
    const spillere = svar.map((k) => r.svar[k].i).sort((a, b) => a - b);
    const tekster = teksterI(r, svar);
    const kanDeles = o.knapp && r.grupper[n].length > 1;
    const klasse = [
      "sau-gruppe",
      spillere.length === 1 ? "alene" : "",
      o.flokk ? "flokk" : "",
      o.uavgjort ? "uavgjort" : "",
      o.svart ? "svart" : "",
      o.spot && !o.svart && !o.flokk ? "spot" : "",
      o.inn ? "inn" : "",
      o.knapp && r.valgt === n ? "valgt" : "",
      o.knapp && n === puls ? "puls" : "",
      kanDeles ? "kan-deles" : "",
    ].filter(Boolean);
    const merke = o.flokk
      ? '<span class="sau-gruppe-stempel">Flokken!</span>'
      : o.uavgjort
        ? '<span class="sau-gruppe-stempel lampe">Uavgjort</span>'
        : o.svart
          ? `<span class="sau-gruppe-svartsau">${R.figur("sauen", "", { svart: true })}Svart sau!</span>`
          : "";
    const antall = R.flertall(spillere.length, "spiller", "spillere");
    return `<li class="${klasse.join(" ")}">
      <span class="sau-gruppe-topp">
        <b class="sau-gruppe-svar">${esc(tekster[0])}</b>
        ${spillere.length === 1 && o.ferdig && !o.svart ? '<span class="sau-gruppe-alene">Alene</span>' : ""}
        <span class="sau-gruppe-antall"><span aria-hidden="true">${spillere.length}</span><span class="vh">${antall}</span></span>
      </span>
      ${tekster.length > 1 ? `<span class="sau-varianter">${tekster.slice(1).map(esc).join(" · ")}</span>` : ""}
      <span class="sau-gruppe-hvem">${spillere.map((i) => `<span class="sau-hvem">${R.avatar(i)}<span>${esc(R.navn(i))}</span></span>`).join("")}</span>
      ${merke}
      ${o.knapp ? `<button class="sau-gruppeknapp" data-h="velg" data-v="${n}" aria-pressed="${r.valgt === n}" aria-label="«${esc(tekster[0])}», ${antall}"></button>` : ""}
      ${kanDeles ? `<button class="sau-del" data-h="del-opp" data-v="${n}" aria-label="Del opp «${esc(tekster.join(", "))}»"><span aria-hidden="true">✂</span></button>` : ""}
    </li>`;
  }

  function prikker(S) {
    const r = S.spill.r;
    return R.ui.fremdrift(S.spill.antall, r.rekke[r.na], r.rekke.slice(0, r.na));
  }

  // Players to tap («Hvem er i flokken?», «Sto noen helt alene?»). valgt: the pressed ones, or
  // null when a tap is an answer by itself.
  const velgere = (h, spillere, valgt, etikett) =>
    `<div class="sau-velg" role="group" aria-label="${esc(etikett)}">${spillere
      .map((i) => `<button class="velger" data-h="${h}" data-v="${i}"${valgt ? ` aria-pressed="${valgt.includes(i)}"` : ""}>${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`)
      .join("")}</div>`;

  const sporsmalsbrikke = (S) => `<p class="sau-minne liten">${esc(ALLE[S.spill.r.q].t)}</p>`;

  // The headline of a scored round: { etikett, tittel, tekst }.
  function rundetekst(sp) {
    const res = sp.r.res;
    const skrevet = sp.modus === "en"; // the phone knows the answers
    if (res.flokk) {
      const antall = res.flokk.length;
      if (antall === sp.antall) return { etikett: "Hele flokken!", tittel: skrevet ? `«${res.tekst}»` : "Alle tenkte likt", tekst: "Alle svarte det samme – alle får poeng!" };
      return {
        etikett: skrevet ? "Flokken svarte" : "Flokken er funnet",
        tittel: skrevet ? `«${res.tekst}»` : `${forStor(TALL[antall])} tenkte likt`,
        tekst: antall > 3 ? `+1 til alle ${TALL[antall]} i flokken` : `+1 til ${navnene(res.flokk)}`,
      };
    }
    if (res.uavgjort) {
      return { etikett: "Uavgjort i flokken", tittel: "Ingen poeng", tekst: res.like.length > 1 ? `${liste(res.like.map((t) => `«${t}»`))} var like store.` : "De største gruppene var like store." };
    }
    return { etikett: "Ingen tenkte likt", tittel: "Ingen poeng", tekst: "Alle svarte noe forskjellig. For en sprø flokk!" };
  }

  // ---------- The game ----------

  R.start({
    id: "sauen",
    versjon: 1,
    pagar, // true while a game runs: the front page's «Fortsett» badge and the wake lock use it

    tilstand: () => ({
      // A fresh setup starts from the group that is already saved on this phone.
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, 3, 12),
      // mal 0 = the target follows the group size · kjent = the packs this setup has seen
      oppsett: { modus: "en", pakker: STANDARD_PAKKER.slice(), kjent: ALLE_PAKKER.slice(), mal: 0 },
      jul: 0, // the season «Jul» was last switched on for
      sist: null, // the last winners, for the home screen
      spill: null,
    }),

    lastet(S) {
      // ----- Setup -----
      const lagret = S.oppsett && typeof S.oppsett === "object" && !Array.isArray(S.oppsett) ? S.oppsett : {};
      const gammelt = lagret.modus === undefined; // saved before «Alle samtidig» and «Jul» existed
      const kjent = Array.isArray(lagret.kjent) ? lagret.kjent : gammelt && Array.isArray(lagret.pakker) ? FORSTE_PAKKER : ALLE_PAKKER;
      let pakker = Array.isArray(lagret.pakker) ? ALLE_PAKKER.filter((id) => lagret.pakker.includes(id)) : STANDARD_PAKKER.slice();
      // Packs that are new since this phone saved its setup are switched on if every pack was on then.
      const nye = STANDARD_PAKKER.filter((id) => !kjent.includes(id));
      if (nye.length && STANDARD_PAKKER.every((id) => nye.includes(id) || pakker.includes(id))) pakker = ALLE_PAKKER.filter((id) => pakker.includes(id) || nye.includes(id));
      S.oppsett = {
        modus: lagret.modus === "alle" ? "alle" : "en",
        pakker,
        kjent: ALLE_PAKKER.slice(),
        // 0 = the target follows the group. The 8 of an old setup was the default, not a choice.
        mal: MAL.includes(lagret.mal) && !(gammelt && lagret.mal === 8) ? lagret.mal : 0,
      };
      S.antall = R.klamp(Math.round(Number(S.antall)) || 4, 3, 12);
      S.jul = erHeltall(S.jul, 1, 9999) ? S.jul : 0;
      julRegel(S);
      S.sist = gyldigSist(S.sist);

      // ----- Game -----
      const sp = S.spill;
      if (sp && typeof sp === "object" && sp.modus === undefined) {
        // A game saved by the earlier version: one phone, the sheep in play also with three
        // players, and «Gi mobilen til» as a screen of its own.
        sp.modus = "en";
        sp.sauUte = false;
        sp.feiret = !!sp.ferdig;
        if (sp.skjerm === "gi") sp.skjerm = "skriv";
        if (sp.r && typeof sp.r === "object") Object.assign(sp.r, { tid: TID, flokk: [], utfall: "", enslig: -1 });
      }
      let gyldig = false;
      try {
        gyldig = gyldigSpill(sp);
      } catch (e) {
        gyldig = false;
      }
      if (!gyldig) S.spill = null;
      // The screen to resume: only one that fits the game.
      if (!S.spill) {
        if (S.skjerm !== "oppsett") S.skjerm = "hjem";
      } else if (S.skjerm === "vinner") {
        if (!S.spill.ferdig) S.skjerm = "hjem";
      } else if (S.skjerm !== "hjem" && S.skjerm !== "oppsett") {
        S.skjerm = S.spill.feiret ? "hjem" : S.spill.skjerm;
      }
    },

    regler: {
      intro: "Svar det samme som flest mulig – men ikke bli den eneste som tenker annerledes.",
      steg: [
        ["Les spørsmålet", "Alle ser spørsmålet sammen, for eksempel «En frukt som er gul»."],
        ["Svar i hemmelighet", "Send mobilen rundt og skriv etter tur – eller velg «Alle samtidig» og skriv på hver sin lapp."],
        ["Følg flokken", "Alle i den største gruppen får ett poeng. Står du helt alene, får du den svarte sauen."],
      ],
      tips: [
        "Har du den svarte sauen, kan du ikke vinne. Den går videre neste gang én person står alene.",
        "Er de største gruppene like store, får ingen poeng.",
        "Én mobil: Etter avsløringen kan dere slå sammen svar som betyr det samme, som «Sitron» og «Gul sitron» – før poengene deles ut.",
        `Alle samtidig: Mobilen teller ned ${TID} s mens alle skriver. På «vis!» viser alle svaret sitt, og dere trykker på hvem som er i flokken.`,
        "Den første som når målet uten den svarte sauen, vinner. Målet følger hvor mange dere er, og dere kan endre det før start.",
        "Med tre spillere er sauen på beite: da gjelder det bare å følge flokken.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) => `
          <div class="spillhjem">
            <div class="sau-duo">${R.figur("sauen")}${R.figur("sauen", "sau-svart", { svart: true })}</div>
            <h1 id="skjerm-tittel">Sauen</h1>
            <span class="undertittel">Tenk som flokken</span>
            <p class="slagord">Svar det samme som de andre.<br><em>Ikke bli den svarte sauen!</em></p>
          </div>
          <div class="hjem-knapper">${R.ui.startKnapper({
            pagar: pagar(S),
            fortsettTekst: pagar(S) ? `Fortsett · runde ${S.spill.nr}` : "",
            // (in the middle of a round the way to «Kåringen» is here: back, then «Avslutt»)
            ekstraHtml: R.ui.lenkerad(R.ui.lenke("Slik spiller du", "regler"), pagar(S) ? R.ui.lenke("Avslutt", "avslutt") : ""),
          })}</div>
          <ul class="merker" aria-label="Om spillet">
            ${S.sist ? `<li class="sau-sist"><b>SIST</b> ${esc(sistTekst(S.sist))}</li>` : ""}
            <li><b>3–12</b> spillere</li><li><b>${ALLE.length}</b> spørsmål</li><li class="sau-merke-sau"><b>1</b> svart sau</li>
          </ul>`,
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => {
          const o = S.oppsett;
          const antall = R.klamp(S.antall || 4, 3, 12);
          const n = ALLE.filter((q) => o.pakker.includes(q.p)).length;
          const mal = malFor(S);
          // «Jul» first while it is the season, last the rest of the year.
          const uten = PAKKER.filter((p) => p.id !== "jul");
          const jul = pakke("jul");
          const pakker = !jul ? uten : sesong() ? [jul, ...uten] : [...uten, jul];
          return `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Hvordan svarer dere?</h2></div>
            ${R.ui.fliser("modus", MODUSER, o.modus)}
            ${o.modus === "en" && antall >= 8 ? '<p class="hjelp">Er dere mange? Da går «Alle samtidig» mye raskere.</p>' : ""}
          </section>
          ${R.ui.spillere({
            min: 3,
            max: 12,
            hjelp: antall === 3 ? "Med tre spillere er sauen på beite: ingen får den svarte sauen." : "Alle svarer på hvert spørsmål.",
          })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Spørsmål</h2><span class="tall">${n} spørsmål</span></div>
            ${R.ui.brikker(
              "pakke",
              pakker.map((p) => ({ v: p.id, tekst: p.navn, ikon: p.ikon })),
              o.pakker,
              { alle: true, etikett: "Spørsmålspakker" },
            )}
          </section>
          <section class="seksjon sau-mal">
            <div class="seksjon-hode"><h2>Først til</h2><span class="tall">ca. ${anslag(antall, mal, o.modus)} min</span></div>
            ${R.ui.seg(
              "mal",
              MAL.map((m) => [String(m), `${m} poeng`]),
              String(mal),
              { etikett: "Poeng for å vinne" },
            )}
          </section>
          ${R.ui.dokk(R.ui.knapp(n ? "Start" : "Velg minst én pakke", "start", { av: !n }))}`;
        },
      },

      // «Alle samtidig», once per game: what everyone needs before the first question.
      klar: {
        tittel: "Alle samtidig",
        tilbake: "hjem",
        vis: () => `
          <div class="sau-avslor-hode">
            <div class="sau-klar-figur">${R.figur()}</div>
            <h1 id="skjerm-tittel">Finn fram lapper</h1>
            <p class="ingress">Alle skriver svarene sine selv – på en lapp eller i notatappen på sin egen mobil.</p>
          </div>
          <ol class="steg sau-klar">
            <li><b>Les spørsmålet høyt</b><span>Denne mobilen viser spørsmålet og teller ned ${TID} s.</span></li>
            <li><b>Skriv i hemmelighet</b><span>Alle skriver ett svar: det de tror de fleste svarer.</span></li>
            <li><b>3 – 2 – 1 – vis!</b><span>Alle viser svaret samtidig. Så trykker dere på hvem som er i flokken.</span></li>
          </ol>
          ${R.ui.dokk(R.ui.knapp("Vi er klare", "klar"))}`,
        inn(S) {
          S.spill.skjerm = "klar";
        },
      },

      sporsmal: {
        tittel: (S) => `Runde ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const q = ALLE[r.q];
          const p = pakke(q.p) || { ikon: "🐑", navn: "Spørsmål" };
          const alle = sp.modus === "alle";
          // «Alle samtidig»: the clock is part of the card, so the question and the time are one thing.
          // (The kit's timer writes «Pause» / «Fortsett» on the button, which must be inside the timer.)
          const fot = alle
            ? `<div class="sau-klokke">${R.ui.timer({
                id: "sau-ring",
                sekunder: r.tid,
                visning: "sek",
                kontrollHtml: `<p>Skriv ett svar i hemmelighet – det du tror de <em>andre</em> svarer.</p>${
                  r.tid > 0 ? '<button class="knapp-2 liten" data-h="timer-veksle" data-v="sau-ring" data-timer-pause>Pause</button>' : ""
                }`,
              })}</div>`
            : '<p class="storkort-fot">Alle svarer i hemmelighet. Svar det du tror de <em>andre</em> svarer!</p>';
          return `
            <div class="bunke"><article class="storkort sau-kort">
              <div class="storkort-topp"><span class="storkort-etikett">${esc(p.ikon + " " + p.navn)}</span><span class="storkort-nr">Først til ${sp.mal}</span></div>
              <h1 class="storkort-tekst ${q.t.length > 34 ? "lang" : ""}" id="skjerm-tittel">${esc(q.t)}</h1>
              ${fot}
            </article></div>
            ${
              sp.sau >= 0
                ? `<p class="sau-holder">${medSau(S, sp.sau)}<span><b>${esc(R.navn(sp.sau))}</b> har den svarte sauen</span></p>`
                : ""
            }
            ${R.ui.dokk(
              alle ? R.ui.knapp("Vis nå", "vis-na") : R.ui.knapp("Send mobilen rundt", "send-rundt"),
              R.ui.lenkerad(R.ui.lenke("Bytt spørsmål", "bytt-sporsmal"), R.ui.lenke("Stillingen", "stilling"), R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "sporsmal";
          if (S.spill.modus === "alle") startRing(S);
        },
        etter() {
          if (ring) ring.tegn(); // a redraw gives a fresh ring: show the time and «Pause» as they are
        },
        ut() {
          if (ring) ring.stopp();
          ring = null;
        },
      },

      // «Én mobil»: one screen per player. «Ferdig» shows the next player's name and an empty
      // field — the answer before is gone with the old screen — and after a reload the same
      // player gets the same empty field.
      skriv: {
        tittel: (S) => `Svar ${S.spill.r.na + 1} av ${S.spill.antall}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const i = r.rekke[r.na];
          const navn = R.navn(i);
          return `
            ${prikker(S)}
            <form class="sau-skriv" data-skjema="svar" autocomplete="off" novalidate>
              <div class="sau-tur">
                ${medSau(S, i, "mid")}
                <div class="sau-tur-tekst"><p class="etikett">Gi mobilen til</p><h1 id="skjerm-tittel">${esc(navn)}</h1></div>
              </div>
              <p class="sau-minne" id="svar-sporsmal">${esc(ALLE[r.q].t)}</p>
              <input id="svar-felt" class="tekstfelt sau-felt" name="svar-${sp.nr}-${r.na}" data-felt="svar" maxlength="40" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" placeholder="${esc(
                Array.from(navn).length > 10 ? "Skriv svaret ditt her …" : `${navn} skriver her …`,
              )}" aria-label="${esc(`Svaret til ${navn}`)}" aria-describedby="svar-sporsmal svar-feil">
              <p class="feil" id="svar-feil" aria-live="assertive"></p>
              <button class="knapp" type="submit">Ferdig</button>
            </form>
            <p class="hjelp">De andre ser bort. Tenk som flokken: hva svarer de fleste?</p>`;
        },
        inn(S) {
          S.spill.skjerm = "skriv";
          const f = R.$("#svar-felt");
          if (f) {
            try {
              f.focus({ preventScroll: true });
            } catch (e) {
              f.focus();
            }
          }
        },
      },

      avslor: {
        tittel: "Avsløringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const total = r.rekkefolge.length;
          const hode = (h1, tekst) => `
            <div class="sau-avslor-hode">
              ${sporsmalsbrikke(S)}
              <h1 id="skjerm-tittel">${esc(h1)}</h1>
              ${tekst ? `<p class="ingress">${esc(tekst)}</p>` : ""}
            </div>`;
          if (!r.avslort) {
            // The reveal: one group at a time, smallest first, newest on top.
            const siste = r.vist === total - 1;
            const kort = r.rekkefolge
              .slice(0, r.vist)
              .map((n, k) => gruppekort(S, n, { spot: k === r.vist - 1, inn: k === r.vist - 1 }))
              .reverse()
              .join("");
            return `
              ${r.vist ? hode(`Svar ${r.vist} av ${total}`) : hode("Alle har svart!", "Samle dere rundt mobilen. Svarene vises ett og ett – den største gruppen kommer til slutt.")}
              ${r.vist ? `<ol class="sau-avslorte">${kort}</ol>` : `<div class="sau-venter">${R.figur()}</div>`}
              ${R.ui.dokk(R.ui.knapp(r.vist === 0 ? "Avslør svarene" : siste ? "Vis den største gruppen" : "Vis neste svar", "neste-svar"))}`;
          }
          // Everything is out: biggest group first. Tap two groups that mean the same to merge them.
          const rekke = r.grupper.map((g, n) => n).sort((a, b) => storrelse(r, b) - storrelse(r, a));
          const ut = regnUt(
            r.grupper.map((g) => spillereI(r, g)),
            sp.sau,
          );
          const storst = Math.max(...rekke.map((n) => storrelse(r, n)));
          const flokkN = ut.flokk ? rekke[0] : -1;
          // (with three players the sheep is at pasture: the one alone is just «Alene»)
          const svartN = !sp.sauUte && ut.alene.length === 1 ? r.grupper.findIndex((g) => spillereI(r, g).length === 1 && spillereI(r, g)[0] === ut.alene[0]) : -1;
          const flere = r.grupper.length > 1;
          const forklaring = ut.flokk ? "" : ut.uavgjort ? "De største gruppene er like store. " : "Alle svarte noe forskjellig. ";
          return `
            ${hode(ut.flokk ? "Flokken er funnet!" : ut.uavgjort ? "Uavgjort!" : "Ingen tenkte likt!", flere ? `${forklaring}Betyr to svar egentlig det samme? Trykk på begge for å slå dem sammen før poengene deles ut.` : "Hele flokken tenkte det samme!")}
            <ol class="sau-avslorte">${rekke
              .map((n) =>
                gruppekort(S, n, {
                  ferdig: true,
                  knapp: flere,
                  inn: n === nyttKort,
                  flokk: n === flokkN,
                  uavgjort: ut.uavgjort && storrelse(r, n) === storst,
                  svart: n === svartN,
                }),
              )
              .join("")}</ol>
            ${R.ui.dokk(
              r.valgt >= 0 ? '<p class="sau-tips">Trykk på svaret som betyr det samme – eller på det samme igjen for å angre.</p>' : "",
              R.ui.knapp("Del ut poengene", "del-ut"),
              r.angre.length ? R.ui.lenkerad(R.ui.lenke("Angre", "angre")) : "",
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "avslor";
        },
        etter() {
          puls = -1;
          nyttKort = -1;
        },
      },

      // «Alle samtidig»: everyone has shown their answer. Who is in the biggest group?
      flokk: {
        tittel: (S) => `Runde ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          return `
            <div class="sau-avslor-hode">
              ${sporsmalsbrikke(S)}
              <h1 id="skjerm-tittel">Hvem er i flokken?</h1>
              <p class="ingress">Trykk på alle i den største gruppen.</p>
            </div>
            ${velgere("flokk-velg", alleSpillere(sp.antall), r.flokk, "Spillere i den største gruppen")}
            <div class="sau-utfall">
              <button data-h="flokk-ingen"><b>Ingen flokk</b><span>Alle svarte forskjellig</span></button>
              <button data-h="flokk-uavgjort"><b>Uavgjort</b><span>Like store grupper</span></button>
            </div>
            ${R.ui.dokk(R.ui.knapp(r.flokk.length < 2 ? "Velg minst to" : "Flokken er klar", "flokk-klar", { av: r.flokk.length < 2 }))}`;
        },
        inn(S) {
          S.spill.skjerm = "flokk";
        },
      },

      // «Alle samtidig»: asked only when the taps so far can't tell (see aleneSporsmal).
      alene: {
        tittel: (S) => `Runde ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          return `
            <div class="sau-avslor-hode">
              ${svartSau("stor")}
              <h1 id="skjerm-tittel">Sto noen helt alene?</h1>
              <p class="ingress">Var akkurat én alene om svaret sitt? Trykk på den spilleren – ellers «Nei».</p>
            </div>
            ${velgere("alene-velg", aleneSporsmal(sp.antall, r.utfall, r.flokk).kandidater, null, "Spilleren som sto alene")}
            <p class="sau-holder">${
              sp.sau >= 0 ? `${medSau(S, sp.sau)}<span><b>${esc(R.navn(sp.sau))}</b> har den svarte sauen nå</span>` : "<span>Den som sto alene, får den svarte sauen.</span>"
            }</p>
            ${R.ui.dokk(R.ui.knapp("Nei", "alene-velg", { v: -1 }), R.ui.lenkerad(R.ui.lenke("Angre", "alene-angre")))}`;
        },
        inn(S) {
          S.spill.skjerm = "alene";
        },
      },

      poeng: {
        tittel: (S) => `Runde ${S.spill.nr}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const res = sp.r.res;
          const t = rundetekst(sp);
          const nyhet = (klasse, html) => `<div class="sau-nyhet ${klasse}">${svartSau("stor")}<div><p class="etikett">Den svarte sauen</p><p>${html}</p></div></div>`;
          const navn = res.sau >= 0 ? `<b>${esc(R.navn(res.sau))}</b>` : "";
          let sauTekst = "";
          if (res.sau >= 0 && res.sau !== res.forrigeSau) {
            const kvitt = res.forrigeSau >= 0 ? ` ${esc(R.navn(res.forrigeSau))} er kvitt den.` : "";
            sauTekst = nyhet("ny", `${navn} ${res.aleneTekst ? `var den eneste som svarte «${esc(res.aleneTekst)}»` : "sto helt alene"} og får den svarte sauen!${kvitt}`);
          } else if (res.sau >= 0 && res.alene.length === 1) {
            sauTekst = nyhet("ny", `${navn} står alene igjen og beholder den svarte sauen.`);
          } else if (res.sau >= 0) {
            sauTekst = nyhet("", `${navn} har den fortsatt.`);
          }
          return `
            ${R.ui.banner({ etikett: t.etikett, tittel: t.tittel, tekst: t.tekst, klasse: res.flokk ? "aksent" : "", utenFigur: true })}
            ${sauTekst}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Stillingen</h2><span class="tall">Først til ${sp.mal}</span></div>
              ${poengtavle(S, res.flokk || [])}
            </section>
            ${R.ui.dokk(
              sp.ferdig ? R.ui.knapp("Til kåringen", "til-vinner") : R.ui.knapp("Neste spørsmål", "neste-runde"),
              R.ui.lenkerad(R.ui.lenke("Angre", "angre-poeng"), sp.ferdig ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "poeng";
        },
      },

      vinner: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.vinnere;
          const rader = alleSpillere(sp.antall).map((i) => ({ i, poeng: sp.poeng[i] }));
          const topp = Math.max(...sp.poeng);
          // The podium goes by points: left out when the holder of the black sheep has the most.
          const pall = v.length && sp.poeng.every((p, i) => p < topp || v.includes(i)) ? R.ui.pall(rader) : "";
          const ganger = (n) => R.flertall(n, "gang", "ganger");
          const p = priser(sp);
          const titler = [
            p.flokkdyr && ["🐑", "Flokkdyret", p.flokkdyr.navn, `Med i flokken ${ganger(p.flokkdyr.n)}`],
            p.ulv && ["🐺", "Ensom ulv", p.ulv.navn, `Sto helt alene ${ganger(p.ulv.n)}`],
            sp.sau >= 0 && ["🖤", "Den svarte sauen", R.navn(sp.sau), sp.alene[sp.sau] > 1 ? `Sto alene ${ganger(sp.alene[sp.sau])} – og satt igjen med sauen` : "Satt igjen med sauen til slutt"],
          ].filter(Boolean);
          const runder = sp.logg.length;
          return `
            ${R.ui.banner({
              etikett: v.length > 1 ? "Flokkens ledere" : v.length ? "Flokkens leder" : "Spillet ble avsluttet",
              tittel: v.length ? `${navnene(v)} vinner!` : "Ingen vinner",
              tekst: sp.tidlig ? (runder ? `Etter ${R.flertall(runder, "runde", "runder")}.` : "Ingen runder ble spilt ferdig.") : `Først til ${sp.mal} poeng${sp.sauUte ? "" : " – uten den svarte sauen"}.`,
              klasse: "aksent",
              stemning: v.length ? "jubel" : "",
            })}
            ${pall}
            ${poengtavle(S, [])}
            ${titler.length ? `<ul class="sau-titler">${titler.map(([ikon, t, n, x]) => `<li><span aria-hidden="true">${ikon}</span><div><small>${esc(t)}</small><b>${esc(n)}</b><span>${esc(x)}</span></div></li>`).join("")}</ul>` : ""}
            ${R.ui.knapp2("Del resultatet", "del")}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          const forste = !sp.feiret; // not again after a reload
          sp.ferdig = true;
          sp.feiret = true;
          R.slippVaken();
          if (!forste) return;
          R.statistikk("ferdig", { runder: sp.logg.length, avbrutt: sp.tidlig });
          // «Kveldens gjeng»: also a game that was ended early, when at least one round was scored.
          if (sp.logg.length) R.kveld.registrer(kveldRader(sp));
          if (sp.vinnere.length) {
            S.sist = { v: sp.vinnere.map((i) => R.kutt(R.navn(i), 16)) };
            R.lyd.fanfare();
            R.konfetti(["--aksent", "--papir", "--mynte", "--lampe", "--lilla"]);
          } else R.lyd.pling();
        },
      },
    },

    skjema: {
      svar(S, form) {
        const sp = S.spill;
        const r = sp.r;
        if (!pagar(S) || S.skjerm !== "skriv" || r.na >= r.rekke.length) return;
        const felt = form.querySelector("input");
        const tekst = felt.value.trim().replace(/\s+/g, " ");
        if (!R.normaliser(tekst)) {
          R.$("#svar-feil").textContent = tekst ? "Svaret må ha bokstaver eller tall." : "Skriv et svar først.";
          felt.classList.remove("risting");
          void felt.offsetWidth;
          felt.classList.add("risting");
          felt.setAttribute("aria-invalid", "true");
          felt.focus();
          R.lyd.feil();
          R.vibrer(60);
          return;
        }
        r.svar.push({ i: r.rekke[r.na], t: R.kutt(tekst, 40) });
        r.na += 1;
        R.lyd.pop();
        R.vibrer(15);
        if (r.na < r.rekke.length) {
          // The next player: a new screen, so nothing of this answer is left on the page.
          R.gaTil("skriv");
          return;
        }
        // Everyone has answered: group the answers and get the reveal ready (smallest group first,
        // equal sizes in random order, so the biggest group comes last).
        const g = grupperSvar(r.svar.map((s) => s.t));
        r.enheter = g.enheter;
        r.grupper = g.grupper;
        r.rekkefolge = R.stokk(r.grupper.map((x, n) => n)).sort((a, b) => storrelse(r, a) - storrelse(r, b));
        r.vist = 0;
        r.avslort = false;
        r.valgt = -1;
        r.angre = [];
        R.lyd.pling();
        R.gaTil("avslor");
      },
    },

    felt: {
      svar(S, el) {
        el.removeAttribute("aria-invalid");
        const feil = R.$("#svar-feil");
        if (feil && feil.textContent) feil.textContent = "";
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) {
          S.spill = null;
          R.slippVaken();
        }
        julRegel(S); // the season may have started since the page was opened
        R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        if (!pagar(S)) return R.gaTil("oppsett");
        R.gaTil(S.spill.skjerm);
      },
      // The «?» in the top bar: the clock waits while the rules are open.
      regler() {
        pauseRing();
        R.visRegler();
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "alle" ? "alle" : "en";
        R.vis();
      },
      pakke(el, e, S) {
        const v = el.dataset.v;
        const valgt = S.oppsett.pakker;
        if (v === "*") S.oppsett.pakker = valgt.length === PAKKER.length ? [] : ALLE_PAKKER.slice();
        else S.oppsett.pakker = valgt.includes(v) ? valgt.filter((x) => x !== v) : ALLE_PAKKER.filter((x) => x === v || valgt.includes(x));
        R.vis();
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 0; // from now on the players' own choice
        R.vis();
      },
      start(el, e, S) {
        if (!ALLE.some((q) => S.oppsett.pakker.includes(q.p))) return;
        nyttSpill(S);
        R.gaTil(S.spill.modus === "alle" ? "klar" : "sporsmal");
      },
      klar(el, e, S) {
        if (pagar(S)) R.gaTil("sporsmal");
      },
      "bytt-sporsmal"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || teller) return;
        sp.r.q = nyttSporsmal(S);
        R.lyd.sveip();
        if (sp.modus === "alle") sp.r.tid = TID; // a new question gets the whole time
        R.vis();
        if (sp.modus === "alle") startRing(S);
      },
      stilling(el, e, S) {
        const sp = S.spill;
        pauseRing();
        R.ark(`
          <h2 id="ark-tittel">Stillingen</h2>
          <p class="ingress">Først til ${sp.mal} poeng${sp.sauUte ? "" : " – uten den svarte sauen"}.</p>
          ${poengtavle(S, [])}
          <button class="knapp" data-h="lukk-ark">Lukk</button>`);
      },

      // ----- «Én mobil» -----
      "send-rundt"(el, e, S) {
        const r = S.spill.r;
        r.na = 0;
        r.svar = [];
        R.gaTil("skriv");
      },
      velg(el, e, S) {
        const r = S.spill.r;
        const g = Number(el.dataset.v);
        if (!r.avslort || r.res || !r.grupper[g]) return;
        if (r.valgt < 0 || r.valgt >= r.grupper.length) {
          r.valgt = g;
          R.lyd.klikk();
          R.si("Valgt. Trykk på svaret som betyr det samme, eller på det samme igjen for å angre.");
        } else if (r.valgt === g) {
          r.valgt = -1;
        } else {
          r.angre.push(r.grupper.map((x) => x.slice()));
          const [a, b] = [Math.min(r.valgt, g), Math.max(r.valgt, g)];
          r.grupper[a] = r.grupper[a].concat(r.grupper[b]);
          r.grupper.splice(b, 1);
          r.valgt = -1;
          puls = a;
          R.lyd.pop();
          R.vibrer(20);
          R.si("Slått sammen");
        }
        R.vis();
      },
      // ✂ on a merged group («del» is «Del resultatet» on «Kåringen»)
      "del-opp"(el, e, S) {
        const r = S.spill.r;
        const g = Number(el.dataset.v);
        if (!r.avslort || r.res || !r.grupper[g] || r.grupper[g].length < 2) return;
        r.angre.push(r.grupper.map((x) => x.slice()));
        const deler = r.grupper[g].map((u) => [u]);
        r.grupper.splice(g, 1, ...deler);
        r.valgt = -1;
        R.lyd.sveip();
        R.si("Delt opp");
        R.vis();
      },
      angre(el, e, S) {
        const r = S.spill.r;
        if (!r.angre.length) return;
        r.grupper = r.angre.pop();
        r.valgt = -1;
        R.vis();
      },
      async "neste-svar"(el, e, S) {
        const r = S.spill.r;
        const total = r.rekkefolge.length;
        if (opptatt || r.avslort) return;
        if (r.vist >= total - 1) {
          // The biggest group: drum roll first.
          opptatt = true;
          el.disabled = true;
          R.lyd.trommevirvel(1.1);
          const fortsatt = R.vakt();
          await R.vent(R.rolig() ? 300 : 1150);
          opptatt = false;
          if (!fortsatt()) return; // they left the screen during the drum roll: reveal it next time
          r.vist = total;
          r.avslort = true;
          const storste = r.rekkefolge[total - 1];
          nyttKort = storste; // slides in on the next render only
          R.vis();
          const ut = regnUt(
            r.grupper.map((g) => spillereI(r, g)),
            S.spill.sau,
          );
          if (ut.flokk) {
            R.lyd.riktig();
            R.vibrer([40, 40, 120]);
            R.si(`Flokken svarte ${teksterI(r, gruppeSvar(r, r.grupper[storste]))[0]}`);
          } else {
            R.lyd.buu();
            R.si("Ingen flokk denne gangen");
          }
          // The button that was pressed is gone: put the keyboard and screen readers on the next one.
          const neste = R.$('#skjerm [data-h="del-ut"]');
          if (neste) neste.focus({ preventScroll: true });
          window.scrollTo({ top: 0, behavior: R.rolig() ? "auto" : "smooth" });
          return;
        }
        r.vist += 1;
        R.lyd.snu();
        R.vibrer(12);
        R.vis();
        const n = r.rekkefolge[r.vist - 1];
        R.si(`${teksterI(r, gruppeSvar(r, r.grupper[n]))[0]}: ${spillereI(r, r.grupper[n]).map((i) => R.navn(i)).join(", ")}`);
        window.scrollTo({ top: 0, behavior: R.rolig() ? "auto" : "smooth" });
      },
      "del-ut"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        if (!r.avslort) return;
        if (r.res) return R.gaTil("poeng");
        const info = r.grupper.map((g) => {
          const svar = gruppeSvar(r, g);
          return { spillere: svar.map((k) => r.svar[k].i), tekst: teksterI(r, svar)[0] };
        });
        const ut = regnUt(
          info.map((x) => x.spillere),
          sp.sau,
        );
        const storst = Math.max(...info.map((x) => x.spillere.length));
        r.valgt = -1;
        delUt(S, ut, {
          tekst: ut.flokk ? info.find((x) => x.spillere.length === storst).tekst : "",
          like: ut.uavgjort ? info.filter((x) => x.spillere.length === storst).map((x) => x.tekst) : [],
          aleneTekst: ut.alene.length === 1 ? info.find((x) => x.spillere.length === 1 && x.spillere[0] === ut.alene[0]).tekst : "",
        });
      },

      // ----- «Alle samtidig» -----
      // «Vis nå», or the clock ran out: «3 – 2 – 1 – vis!», then the players tap the result.
      async "vis-na"(el, e, S) {
        const sp = S.spill;
        if (teller || !pagar(S) || sp.modus !== "alle" || S.skjerm !== "sporsmal") return;
        teller = true;
        pauseRing();
        const ferdig = await R.nedtelling(["3", "2", "1", "VIS!"], 700);
        teller = false;
        if (!ferdig) return; // they left the screen during the countdown
        R.lyd.riktig();
        R.vibrer([60, 40, 120]);
        R.gaTil("flokk");
      },
      "flokk-velg"(el, e, S) {
        const r = S.spill.r;
        const i = Number(el.dataset.v);
        if (S.skjerm !== "flokk" || !erHeltall(i, 0, S.spill.antall - 1)) return;
        r.flokk = r.flokk.includes(i) ? r.flokk.filter((x) => x !== i) : r.flokk.concat(i);
        R.vis();
        R.si(`${R.navn(i)} ${r.flokk.includes(i) ? "er med" : "er ikke med"}. ${r.flokk.length} valgt.`);
      },
      "flokk-klar"(el, e, S) {
        const r = S.spill.r;
        if (S.skjerm !== "flokk" || r.flokk.length < 2) return;
        r.utfall = "flokk";
        videreFraFlokk(S);
      },
      "flokk-ingen"(el, e, S) {
        if (S.skjerm !== "flokk") return;
        S.spill.r.utfall = "ingen";
        videreFraFlokk(S);
      },
      "flokk-uavgjort"(el, e, S) {
        if (S.skjerm !== "flokk") return;
        S.spill.r.utfall = "uavgjort";
        videreFraFlokk(S);
      },
      "alene-velg"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        const i = Number(el.dataset.v);
        if (S.skjerm !== "alene") return;
        r.enslig = aleneSporsmal(sp.antall, r.utfall, r.flokk).kandidater.includes(i) ? i : -1;
        delUt(S, regnUtAlle(sp.antall, r.utfall, r.flokk, r.enslig, sp.sau), {});
      },
      "alene-angre"(el, e, S) {
        if (S.skjerm !== "alene") return;
        S.spill.r.utfall = "";
        R.gaTil("flokk");
      },

      // ----- Both -----
      "angre-poeng"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        if (!r.res) return;
        const f = r.res.for;
        sp.poeng = f.poeng;
        sp.iFlokk = f.iFlokk;
        sp.alene = f.alene;
        sp.sau = f.sau;
        sp.logg.length = f.logg;
        sp.ferdig = false;
        sp.vinnere = [];
        r.res = null;
        if (sp.modus === "alle") {
          // Back to the taps, with the flock still marked.
          r.utfall = "";
          r.enslig = -1;
          R.gaTil("flokk");
        } else R.gaTil("avslor");
      },
      "neste-runde"(el, e, S) {
        if (!pagar(S) || S.spill.ferdig) return;
        nyRunde(S);
        R.gaTil("sporsmal");
      },
      "til-vinner": () => R.gaTil("vinner"),
      async avslutt(el, e, S) {
        const klokkaGikk = !!(ring && ring.kjorer);
        pauseRing();
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", "Dere går til kåringen med stillingen så langt.", "Avslutt", "Spill videre");
        if (!fortsatt() || !pagar(S)) return;
        if (!ja) {
          if (klokkaGikk && ring) ring.start(); // «Spill videre»: the clock carries on
          return;
        }
        const sp = S.spill;
        if (!sp.ferdig) {
          // The leaders so far win — but nobody wins with the black sheep, or without a point.
          const kandidater = sp.poeng.map((p, i) => (i !== sp.sau ? p : -1));
          const topp = Math.max(...kandidater);
          sp.vinnere = topp > 0 ? kandidater.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
          sp.ferdig = true;
          sp.tidlig = true;
        }
        R.gaTil("vinner");
      },
      del(el, e, S) {
        if (S.spill) R.del("Sauen", delTekst(S.spill), location.origin + "/sauen/");
      },
      // «Spill igjen»: the same setup, and no need to find the notes again.
      igjen(el, e, S) {
        if (!ALLE.some((q) => S.oppsett.pakker.includes(q.p))) return R.gaTil("oppsett");
        nyttSpill(S);
        R.gaTil("sporsmal");
      },
    }),
  });
})();
