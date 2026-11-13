/* rusj.no – «Hva skal vi spille?»: the finder's choice of games, as pure functions.
   Three answers in («Hvor mange er dere?», the youngest player's age, «Hva har dere lyst på?»), a
   ranked list out: the games that fit, best first, mixed so the short list is not five of a kind.
   No DOM, no storage and no texts here: the front page (portal.js) draws the questions and the cards,
   so the same code runs in the browser (window.RusjFinner) and in the tests (CommonJS).
   A game is an entry of window.RUSJ_SPILLISTE: { id, spillere, alder, minutter, mobiler, tagger,
   rekkefolge, alder18?, motMobilen?, topp? } – topp is its place in «Mest spilt nå» (1 = most played). */
(function (root) {
  "use strict";

  // «Hvor mange er dere?»: a chip and the counts it stands for. A game fits when it can be played by
  // every count in the band (3–4: both by three and by four). «9+»: at least nine and ten.
  const SPILLERE = { 1: [1, 1], 2: [2, 2], "3-4": [3, 4], "5-8": [5, 8], "9+": [9, 10] };

  // «Hvem er yngst?»: an age from 3 to 17, then «voksen». «fest» (adults, 18+ games welcome) is only
  // there once someone has confirmed being 18 (rusj.felles.over18).
  const ALDER_MIN = 3;
  const ALDER_MAKS = 17;
  const VOKSEN = 18;

  // Games acted out with the body. No tag says that, so they are named here.
  const MIME = ["mimen", "hatten"];

  // «Hva har dere lyst på?»: the tags that answer each wish. «alt» (the default) takes everything;
  // «kjapt» is about time, not tags: a round can be done in under ten minutes.
  const LYST = {
    alt: null,
    tull: ["fest", "blof", "sporsmal", "tegning", "lag"],
    tenke: ["tenke", "klassiker", "kort", "hukommelse"],
    ord: ["ord", "quiz"],
    tegne: ["tegning"],
    kjapt: null,
  };

  // Never a suggestion: tools are not games, and a calendar that only opens in December.
  const IKKE = (s, maned) => s.tagger.includes("verktoy") || (s.id === "julekalenderen" && maned != null && maned !== 12);

  // The kind of game, for the mix: at most one of each kind first, then two, then the rest.
  // Checked in this order, so a drawing game is «mime» even when it is also a party game.
  function slag(s) {
    const t = s.tagger;
    if (t.includes("drikke") || s.alder18) return "drikke";
    if (t.includes("tegning") || MIME.includes(s.id)) return "mime";
    if (t.includes("quiz")) return "quiz";
    if (t.includes("blof") && !t.includes("klassiker")) return "blof";
    if (t.includes("ord")) return "ord";
    if (t.includes("hukommelse")) return "huske";
    if (t.includes("kort")) return "kort";
    if (t.includes("klassiker") && s.spillere[1] > 1) return "brett";
    if (t.includes("tenke") || t.includes("daglig") || t.includes("alene") || t.includes("klassiker")) return "puslespill";
    if (t.includes("lag")) return "lag";
    if (t.includes("sporsmal")) return "prat";
    if (t.includes("fest")) return "fest";
    return "annet";
  }

  // Stored or tapped answers made safe: anything unknown becomes the default, and «fest» only
  // stays while the 18+ door is open.
  function normaliser(v, over18) {
    const o = v && typeof v === "object" ? v : {};
    const antall = typeof o.antall === "string" && Object.prototype.hasOwnProperty.call(SPILLERE, o.antall) ? o.antall : "";
    let yngst = o.yngst;
    if (typeof yngst === "string" && /^\d{1,2}$/.test(yngst)) yngst = Number(yngst);
    const alder = Number.isInteger(yngst) && yngst >= ALDER_MIN && yngst <= ALDER_MAKS;
    if (!alder && yngst !== "voksen" && !(yngst === "fest" && over18)) yngst = "voksen";
    const lyst = typeof o.lyst === "string" && Object.prototype.hasOwnProperty.call(LYST, o.lyst) ? o.lyst : "alt";
    return { antall, yngst, lyst };
  }

  // The steps of the age stepper, youngest first.
  function alderTrinn(over18) {
    const ut = [];
    for (let a = ALDER_MIN; a <= ALDER_MAKS; a++) ut.push(a);
    ut.push("voksen");
    if (over18) ut.push("fest");
    return ut;
  }

  // Does the game fit the answers at all? (Age, players and wish; 18+ only when «fest» is chosen.)
  function passer(s, valg, o) {
    const maned = o && o.maned;
    if (IKKE(s, maned)) return false;
    const fest = valg.yngst === "fest";
    if (s.alder18 && !fest) return false;
    const grense = typeof valg.yngst === "number" ? valg.yngst : VOKSEN;
    if (!(s.alder <= grense)) return false;
    const band = SPILLERE[valg.antall];
    if (band && !(s.spillere[0] <= band[0] && s.spillere[1] >= band[1])) return false;
    const tagger = LYST[valg.lyst];
    if (valg.lyst === "kjapt" && !(s.minutter[0] < 10)) return false;
    if (valg.lyst === "tegne" && !(s.tagger.includes("tegning") || MIME.includes(s.id))) return false;
    if (tagger && valg.lyst !== "tegne" && !s.tagger.some((t) => tagger.includes(t))) return false;
    return true;
  }

  // How well a fitting game fits (higher is better): the wish, the age and the group.
  function poeng(s, valg) {
    let p = 0;
    // The wish: the game's main thing (its first tag) answers it, or only one of its tags does.
    const tagger = LYST[valg.lyst];
    if (valg.lyst === "kjapt") p += s.minutter[1] <= 15 ? 2 : 1;
    else if (valg.lyst === "tegne") p += s.tagger[0] === "tegning" || MIME.includes(s.id) ? 2 : 1;
    else if (tagger) p += tagger.includes(s.tagger[0]) ? 2 : 1;
    // The age: made for about this age, not for much younger children (the eldest want to play too).
    const grense = typeof valg.yngst === "number" ? valg.yngst : VOKSEN;
    const mal = Math.min(grense, 10);
    if (s.alder >= mal - 3) p += 1;
    else if (s.alder < mal - 5) p -= 2;
    // Young children seldom have a phone each.
    if (typeof valg.yngst === "number" && valg.yngst < 10 && s.mobiler === "hver") p -= 1;
    // «Voksen fest (18+)»: the party games and the drinking games first.
    if (valg.yngst === "fest") p += s.alder18 ? 2 : s.tagger.includes("fest") ? 1 : 0;
    // The group: one alone gets the games made for one; two get the games made for a few.
    if (valg.antall === "1" && (s.tagger.includes("alene") || s.motMobilen)) p += 1;
    if (valg.antall === "2" && s.spillere[1] <= 6) p += 1;
    return p;
  }

  // Every game that fits, in the order to show them. spill: the edition's list; valg: the answers
  // (normalised); o.maned: this month (1–12), for the seasonal rule.
  // Ranked by how well it fits, then by its place in «Mest spilt nå», then by the site's own order;
  // then mixed: among the games that fit well (at most one point below the best), the best of each
  // kind first and a second of each kind next; then the others that lost no points (made for much
  // younger children, a phone each for small ones), still at most two of a kind; the rest last.
  function finn(spill, valg, o) {
    const v = normaliser(valg, valg && valg.yngst === "fest");
    const orden = (k) => (typeof k.s.rekkefolge === "number" ? k.s.rekkefolge : k.n);
    const kandidater = (spill || [])
      .filter((s) => passer(s, v, o))
      .map((s, n) => ({ s, n, p: poeng(s, v), slag: slag(s) }))
      .sort((a, b) => b.p - a.p || (a.s.topp || Infinity) - (b.s.topp || Infinity) || orden(a) - orden(b) || a.n - b.n);
    const ut = [];
    const tatt = new Set();
    const antall = new Map();
    const godt = kandidater.length ? kandidater[0].p - 1 : 0;
    for (const [tak, minst] of [[1, godt], [2, godt], [2, 0], [Infinity, -Infinity]]) {
      for (const k of kandidater) {
        if (tatt.has(k.s.id) || k.p < minst || (antall.get(k.slag) || 0) >= tak) continue;
        tatt.add(k.s.id);
        antall.set(k.slag, (antall.get(k.slag) || 0) + 1);
        ut.push(k.s);
      }
    }
    return ut;
  }

  const api = { finn, passer, poeng, slag, normaliser, alderTrinn, SPILLERE, LYST, MIME, ALDER_MIN, ALDER_MAKS, VOKSEN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RusjFinner = api;
})(typeof self !== "undefined" ? self : this);
