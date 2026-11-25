/* Flinkisen — «Kategorier på bokstav», the pen-and-paper classic («navn, by, land»). A letter is
   drawn, five or six categories come up, and everyone writes one answer per category at the same
   time. The first to finish says «Stopp», and the others get ten seconds. Then category by
   category: an answer nobody else has gives 10 points, a shared one 5, an empty or wrong one 0.
   Most points after the last round wins.
   On one phone: the phone draws the letter, keeps the time and the points; people write on paper
   and the group tells the phone what each answer was worth.
   On the net: a phone each, the answers are typed, and the phones do the scoring – everyone can
   mark another player's answer as «teller ikke», and the majority of the others decides.
   (Friends level on the net: the answers are in the room's list before the round is closed, and
   the ten seconds after «Stopp» are counted by each phone itself – a modified phone could read
   the list, or take more time than the others.)
   The rules at the top are pure; test/flinkisen.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- The rules (no kit needed) ----------

  const MAKS_TEGN = 30; // characters in one answer
  const NEDTELLING = 10; // seconds the others get after «Stopp»
  const RUNDER = [3, 5, 7];
  const KATEGORIER = [5, 6];
  const TIDER = [0, 60, 90, 120]; // one phone: seconds per round (0: until someone says stop)
  const ALENE = 10; // points for a valid answer nobody else has
  const DELT = 5; // points for a valid answer someone else has too
  const VERDIER = [0, DELT, ALENE];
  const MIN = 2;
  const MAKS = 10;
  // The letters that are drawn. Letters that start almost no words are left out: C, Q, W, X, Y and
  // Z in Norwegian and Danish (no country and no common animal on Y; Æ, Ø and Å only when the setup
  // says so), Q, U, X, Y and Z in English (no common animal or food on U; Y has hardly an answer
  // outside the classic categories). test/flinkisen-ord.mjs has an answer per letter for the
  // categories of the packs, and test/flinkisen.test.mjs checks that every category has one on at
  // least 18 of the letters.
  const ALFABET = {
    nb: { vanlige: "ABDEFGHIJKLMNOPRSTUV", ekstra: "ÆØÅ" }, // sprak-ok
    da: { vanlige: "ABDEFGHIJKLMNOPRSTUV", ekstra: "ÆØÅ" }, // sprak-ok
    en: { vanlige: "ABCDEFGHIJKLMNOPRSTVW", ekstra: "" },
  };

  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const klamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const bokstaver = (sprak, ekstra) => {
    const a = ALFABET[sprak] || ALFABET.nb;
    return (a.vanlige + (ekstra ? a.ekstra : "")).split("");
  };
  const harEkstra = (sprak) => !!(ALFABET[sprak] || ALFABET.nb).ekstra;
  // Fisher–Yates with the given random source.
  function stokk(liste, rng) {
    const l = liste.slice();
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  }
  // An answer as two answers are compared: lower case (a fixed locale, so alike on every phone), no
  // accents (æ, ø and å are letters of their own), nothing but letters and digits.
  const AA = { æ: "\u0001", ø: "\u0002", å: "\u0003" }; // sprak-ok
  const AA_TILBAKE = { "\u0001": "æ", "\u0002": "ø", "\u0003": "å" }; // sprak-ok
  function norm(tekst) {
    return String(tekst == null ? "" : tekst)
      .toLocaleLowerCase("nb")
      .replace(/[æøå]/g, (c) => AA[c])
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[\u0001-\u0003]/g, (c) => AA_TILBAKE[c])
      .replace(/[^a-z0-9æøå]+/g, "");
  }
  // Does the answer begin with the round's letter?
  const passer = (tekst, bokstav) => {
    const b = norm(bokstav);
    return !!b && norm(tekst).startsWith(b);
  };
  // An answer as it is kept: one line, no spaces at the ends, at most MAKS_TEGN characters (never
  // half of an emoji, never half of a pair).
  function rens(tekst) {
    const t = String(tekst == null ? "" : tekst)
      .replace(/[\uD800-\uDFFF]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    return Array.from(t).slice(0, MAKS_TEGN).join("").trim();
  }
  // The categories of round `runde` (their places in the pack): a pack marked «fast» plays its
  // first `antall` every round; the others deal new ones from the pack's shuffled order, round
  // after round and around again.
  function kategorierFor(pakke, antall, runde, rekke) {
    const n = Math.min(antall, pakke.k.length);
    if (pakke.fast) return range(n);
    return range(n).map((j) => rekke[(runde * n + j) % rekke.length]);
  }
  // «Teller ikke»: an answer is struck when more than half of the OTHER voters have marked it.
  // merker: the seats that marked it. velgere: the seats that were in when the round was closed –
  // the electorate is fixed there, so a seat that leaves during the scoring never turns a vote.
  // inne: the seats still in (a voter that has left counts as «not marked»).
  function strok(merker, forfatter, velgere, inne) {
    const andre = velgere.filter((i) => i !== forfatter);
    const med = inne || velgere;
    const antall = andre.filter((i) => med.includes(i) && (merker || []).includes(i)).length;
    return andre.length > 0 && antall * 2 > andre.length;
  }
  const kravTil = (velgere) => Math.floor((velgere.length - 1) / 2) + 1; // marks it takes
  // A round on the net may be closed without the seats that have not delivered when two seats
  // still in have (so one phone alone cannot cut the others off); with two seats in, one is enough.
  const kanLukke = (levert, antallInne) => levert >= Math.min(2, antallInne - 1);
  // One category: svar[i] is seat i's answer (or null). Returns what each seat's answer is
  // («tom», «feil» letter, «strok» by the others, «delt» with someone, «alene») and its points.
  // An answer is «delt» when another seat has the same one with the right letter – struck or not:
  // striking somebody's answer never lifts one's own identical answer from 5 to 10.
  function domKategori(svar, bokstav, inne, erStrok, antall) {
    const status = Array(antall).fill("ute");
    const poeng = Array(antall).fill(0);
    const riktige = []; // an answer, and on the round's letter
    for (const i of inne) {
      const t = svar[i];
      if (t == null || !norm(t)) status[i] = "tom";
      else if (!passer(t, bokstav)) status[i] = "feil";
      else riktige.push(i);
    }
    for (const i of riktige) {
      const delt = riktige.some((j) => j !== i && norm(svar[j]) === norm(svar[i]));
      if (erStrok && erStrok(i)) status[i] = "strok";
      else {
        status[i] = delt ? "delt" : "alene";
        poeng[i] = delt ? DELT : ALENE;
      }
    }
    return { status, poeng };
  }
  // The leaders among the seats in `med` (nobody when nobody has scored).
  function toppen(poeng, med) {
    const best = Math.max(0, ...med.map((i) => poeng[i]));
    return best > 0 ? med.filter((i) => poeng[i] === best) : [];
  }

  // ----- A match on one phone: people write on paper, the phone keeps letter, time and points -----
  // o: { antall, pakke (the pack object), runder, kat, tid, ekstra, sprak, rng }
  function ny(o) {
    const antall = klamp(o.antall | 0, MIN, MAKS);
    const runder = RUNDER.includes(o.runder) ? o.runder : 5;
    const sp = {
      modus: "en",
      antall,
      pakke: o.pakke.id,
      runder,
      kat: KATEGORIER.includes(o.kat) ? o.kat : 5,
      tid: TIDER.includes(o.tid) ? o.tid : 0,
      ekstra: !!o.ekstra && harEkstra(o.sprak),
      runde: 0, // the round being played (0 = the first)
      bokstaver: stokk(bokstaver(o.sprak, !!o.ekstra), o.rng).slice(0, runder),
      katRekke: stokk(range(o.pakke.k.length), o.rng),
      poeng: Array(antall).fill(0),
      spilt: 0, // rounds scored
      r: null,
      ferdig: false,
    };
    nyRunde(sp, o.pakke);
    return sp;
  }
  // fase: klar → trekk (the letter spins) → skriv → stopp (ten seconds) → dom (scoring) → ferdig
  function nyRunde(sp, pakke) {
    const k = kategorierFor(pakke, sp.kat, sp.runde, sp.katRekke);
    sp.r = { b: sp.bokstaver[sp.runde], k, fase: "klar", igjen: sp.tid, ned: NEDTELLING, nr: 0, score: range(sp.antall).map(() => Array(k.length).fill(null)), pluss: null, mangler: false };
  }
  function trekk(sp) {
    if (!sp.r || sp.r.fase !== "klar") return false;
    sp.r.fase = "trekk";
    return true;
  }
  function begynn(sp) {
    if (!sp.r || sp.r.fase !== "trekk") return false;
    sp.r.fase = "skriv";
    return true;
  }
  // The first to finish says «Stopp»: ten seconds for the others.
  function siStopp(sp) {
    if (!sp.r || sp.r.fase !== "skriv") return false;
    sp.r.fase = "stopp";
    sp.r.ned = NEDTELLING;
    return true;
  }
  // Pens down: the scoring begins.
  function blyanterNed(sp) {
    if (!sp.r || !["skriv", "stopp"].includes(sp.r.fase)) return false;
    sp.r.fase = "dom";
    sp.r.nr = 0;
    return true;
  }
  // 0, 5 or 10 for player i in the category on the screen (the same value again takes it back).
  function settPoeng(sp, i, p) {
    const r = sp.r;
    if (!r || r.fase !== "dom" || !r.score[i] || !VERDIER.includes(p)) return false;
    r.score[i][r.nr] = r.score[i][r.nr] === p ? null : p;
    return true;
  }
  // On to the next category – "mangler" while someone has no points here, "dom" for the next one,
  // "ferdig" when the round's points are added up.
  function katNeste(sp) {
    const r = sp.r;
    if (!r || r.fase !== "dom") return null;
    if (r.score.some((rad) => rad[r.nr] == null)) {
      r.mangler = true;
      return "mangler";
    }
    r.mangler = false;
    if (r.nr < r.k.length - 1) {
      r.nr += 1;
      return "dom";
    }
    r.pluss = r.score.map((rad) => rad.reduce((s, p) => s + (p || 0), 0));
    r.pluss.forEach((p, i) => (sp.poeng[i] += p));
    sp.spilt += 1;
    r.fase = "ferdig";
    return "ferdig";
  }
  function katForrige(sp) {
    const r = sp.r;
    if (!r || r.fase !== "dom" || r.nr <= 0) return false;
    r.nr -= 1;
    r.mangler = false;
    return true;
  }
  // Take the round's points back and look at the last category again (until the next round starts).
  function endrePoeng(sp) {
    const r = sp.r;
    if (!r || r.fase !== "ferdig" || !r.pluss) return false;
    r.pluss.forEach((p, i) => (sp.poeng[i] -= p));
    r.pluss = null;
    sp.spilt -= 1;
    r.fase = "dom";
    r.nr = r.k.length - 1;
    return true;
  }
  // After a scored round: the next one ("klar"), or the end ("slutt").
  function nesteRunde(sp, pakke) {
    if (!sp.r || sp.r.fase !== "ferdig") return null;
    if (sp.runde + 1 >= sp.runder) {
      sp.ferdig = true;
      return "slutt";
    }
    sp.runde += 1;
    nyRunde(sp, pakke);
    return "klar";
  }

  const Regler = { MAKS_TEGN, NEDTELLING, RUNDER, KATEGORIER, TIDER, ALENE, DELT, MIN, MAKS, ALFABET, bokstaver, harEkstra, stokk, norm, passer, rens, kategorierFor, strok, kravTil, kanLukke, domKategori, toppen, ny, nyRunde, trekk, begynn, siStopp, blyanterNed, settPoeng, katNeste, katForrige, endrePoeng, nesteRunde };
  window.RusjFlinkisen = Regler;

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  // ---------- The game ----------

  const esc = R.esc;
  const PAKKER = window.RUSJ_DATA.pakker.pakker;
  const pakke = (id) => PAKKER.find((p) => p.id === id) || PAKKER[0];
  const SPRAK = R.sprak;
  const EKSTRA_FINNES = harEkstra(SPRAK);
  const STANDARD = { pakke: PAKKER[0].id, runder: 5, kat: 5, tid: 0, ekstra: false };
  // The party pack is for adults («voksen» in the data): behind the same 18+ question as the
  // drinking games and Dommeren's «Fest» (R.felles.over18, once per phone). Until the visitor has
  // said yes it is never chosen – not on this phone, and not for a room this phone makes.
  const voksen = (id) => !!pakke(id).voksen;
  const tillatt = (id) => (voksen(id) && !R.felles.over18 ? STANDARD.pakke : pakke(id).id);
  const TIDNAVN = { 0: R.t("Av"), 60: R.t("60 s"), 90: R.t("90 s"), 120: R.t("2 min") };

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  let H; // the actions, so one action can reuse another
  let feire = false; // «Kåringen» was just reached (not a reload)

  const standardAntall = () => R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 3, MIN, MAKS);
  const katNavn = (sp, k) => pakke(sp.pakke).k[k] || "";
  const rundeTittel = (S) => (S.spill ? R.t("Runde {n} av {m}", { n: Math.min(S.spill.runde + 1, S.spill.runder), m: S.spill.runder }) : "");
  // The screen of a phase on one phone.
  const skjermFor = (sp) => (sp.ferdig ? "slutt" : { klar: "klar", trekk: "skriv", skriv: "skriv", stopp: "skriv", dom: "dom", ferdig: "stilling" }[sp.r.fase] || "klar");

  function nyttSpill(S) {
    const o = S.oppsett;
    S.spill = ny({ antall: S.antall, pakke: pakke(tillatt(o.pakke)), runder: o.runder, kat: o.kat, tid: o.tid, ekstra: o.ekstra, sprak: SPRAK, rng: R.rng(R.nyttFro()) });
    feire = false;
    R.statistikk("start", { spillere: S.spill.antall, runder: S.spill.runder, pakke: S.spill.pakke, tid: S.spill.tid });
  }
  // (On the net a seat that left is not ranked; on one phone nobody leaves.)
  const rader = (sp, medPluss) => range(sp.antall).filter((i) => !ute(sp, i)).map((i) => ({ i, poeng: sp.poeng[i], ...(medPluss && sp.r && sp.r.pluss && sp.r.pluss[i] ? { pluss: sp.r.pluss[i] } : {}) }));
  const vinnere = (sp) => toppen(sp.poeng, range(sp.antall).filter((i) => !ute(sp, i)));

  // Once per game on one phone, when it is over: statistics (numbers only), the evening's
  // scoreboard and the «sist» line.
  function fullfor(S) {
    const sp = S.spill;
    if (!sp || sp.feiret) return;
    sp.ferdig = true;
    sp.feiret = true;
    feire = true;
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.spilt, avbrutt: sp.spilt < sp.runder });
    if (sp.spilt > 0) R.kveld.registrer(rader(sp));
  }

  // ---------- Pieces of the screen ----------

  const flis = (b, klasse) => `<span class="fl-bokstav ${klasse || ""}" aria-hidden="true"><span>${esc(b)}</span></span>`;
  const katListe = (sp, r, klasse) =>
    `<ol class="fl-kat ${klasse || ""}">${r.k.map((k, n) => `<li style="--n:${n}"><span class="fl-nr" aria-hidden="true">${n + 1}</span><span class="fl-kn">${esc(katNavn(sp, k))}</span></li>`).join("")}</ol>`;
  const poengForklaring = () => `
    <ul class="fl-forklaring" aria-label="${esc(R.t("Poeng"))}">
      <li><b>${ALENE}</b> <span>${esc(R.t("bare du"))}</span></li>
      <li><b>${DELT}</b> <span>${esc(R.t("flere har det"))}</span></li>
      <li><b>0</b> <span>${esc(R.t("tomt eller feil"))}</span></li>
    </ul>`;
  const lederTittel = (sp) => {
    const v = vinnere(sp);
    const med = range(sp.antall).filter((i) => !ute(sp, i));
    if (!v.length || v.length === med.length) return R.t("Helt likt!");
    return R.t("{navn} leder!|{navn} leder!", { navn: R.ramsOpp(v.map(R.navn)), n: v.length });
  };

  // The letter spins through the alphabet and lands on b (one phone).
  async function spinn(b) {
    const el = R.$("#skjerm .fl-bokstav span");
    const alle = bokstaver(SPRAK, true);
    R.lyd.trommevirvel(R.rolig() ? 0.3 : 0.9);
    if (!R.rolig()) {
      for (let n = 0; n < 12; n++) {
        if (el && el.isConnected) el.textContent = alle[(n * 5 + 3) % alle.length];
        await R.vent(75);
      }
    } else await R.vent(300);
    R.lyd.pling();
    R.vibrer([30, 30, 60]);
    return b;
  }

  // The clocks of the writing screen on one phone: the round's own time (when there is one), and
  // the ten seconds after «Stopp».
  function startKlokker(S) {
    const sp = S.spill;
    const r = sp && sp.r;
    if (!r || sp.modus !== "en" || S.skjerm !== "skriv") return;
    if (r.fase === "skriv" && sp.tid && !R.timer("fl-tid")) {
      let sist = Date.now();
      new R.Timer({
        id: "fl-tid",
        sekunder: Math.max(1, r.igjen),
        vedTikk(sek) {
          r.igjen = sek;
          if (Date.now() - sist > 1900) {
            sist = Date.now();
            R.lagre();
          }
        },
        vedSlutt: () => tidUte(S, sp),
      }).start();
    }
    if (r.fase === "stopp" && !R.timer("fl-ned")) {
      new R.Timer({
        id: "fl-ned",
        sekunder: Math.max(1, r.ned),
        visning: "sek",
        vedTikk(sek) {
          r.ned = sek;
        },
        vedSlutt: () => tidUte(S, sp),
      }).start();
    }
  }
  async function tidUte(S, sp) {
    if (S.spill !== sp || !blyanterNed(sp)) return;
    R.lagre();
    R.si(R.t("Blyantene ned!"));
    if (await R.nedtelling([R.t("Blyantene ned!")], R.rolig() ? 700 : 1300)) R.gaTil("dom");
  }

  // ---------- On the net (R.nett, rusj/kit/nett.js) ----------
  // Every player on their own phone, 2–10. The moves:
  //   { svar: ["…", …], r }   all my answers of round r, one per category – one move per player per
  //                           round. Each answer is cleaned with R.nett.tekst (at most 30 characters)
  //                           before it is sent and again when it is played: a modified phone could
  //                           send anything. The first one in is the «Stopp»;
  //   { lukk: r }             close round r without the seats that have not delivered – from a seat
  //                           that has delivered, after a «Stopp», and only when two seats still in
  //                           have delivered (with two seats in: one);
  //   { merk: [kat, sete], pa: 0 | 1, r }   my «teller ikke» mark on seat's answer in the category
  //                           being judged – never on my own answer;
  //   { neste: steg }, { forrige: steg }   the round's leader goes on (the next category, the
  //                           points, the next round, «Kåringen») or one category back.
  // Anything else, or anything the rules don't allow now, is ignored on every phone. The letters and
  // the categories come from the room's seed. The leader moves on to the next seat still in for
  // every round (and one seat on per match).
  // The ten seconds after «Stopp» run on each phone by itself: when they are out, a phone that has
  // not delivered sends what it has – once – and the round closes when every seat still in has
  // delivered (or on «lukk»). No move is ever sent on a repeating timer.
  // A phone that has undertaken to deliver (it pressed the button, or its ten seconds are out) OWES
  // its answers until they are in the room's list: etter() sends them again when another move took
  // their place, and when the line comes back after having been down. Until then the screen says
  // «sender», never «sendt».
  // What a player has typed stays on that phone: the draft of the round (and whether the phone owes
  // it) is kept in the kit's own store for the match (R.nett.hemmelig – never sent, gone with the
  // session), so a reload while writing keeps the text. It is cleared when the answers are in the
  // room's list or the round is over.
  // «Teller ikke»: the voters are the seats that were in when the round was closed (r.velgere), so
  // a seat that leaves during the scoring does not turn a vote. A seat that left is never waited
  // for; its answers and its own marks no longer count; it is not ranked.
  // Friends level: the answers are moves in the room's list (kept in the room, deleted with it, at
  // the latest after 24 hours). The screens show no answer before the round is closed, but a
  // modified phone could read the list – and the ten seconds are each phone's own count.
  const paNett = (sp) => !!sp && sp.modus === "nett" && !!R.nett;
  const ute = (sp, i) => paNett(sp) && sp.ute.includes(i);
  const inne = (sp) => range(sp.antall).filter((i) => !ute(sp, i));
  const meg = () => (R.nett ? R.nett.meg() : -1);
  // The first seat still in from seat s on (s itself when it is in).
  function forsteInne(sp, s) {
    for (let k = 0; k < sp.antall; k++) {
      const i = (s + k) % sp.antall;
      if (!ute(sp, i)) return i;
    }
    return s;
  }
  // The next seat still in after seat s.
  const nesteInne = (sp, s) => forsteInne(sp, (s + 1) % sp.antall);
  const harAlle = (sp, liste) => R.nett.alleHar(liste, sp.antall);
  // An answer on the net: the kit's cleaning, and never half of a pair (a lone half would be written
  // as six signs in the move).
  const nettRens = (s) => R.nett.tekst(String(s == null ? "" : s).replace(/[\uD800-\uDFFF]/gu, ""), MAKS_TEGN);
  // The round this phone OWES its answers for ("" = none): it pressed the button, or its ten
  // seconds are out, and the answers are not in the room's list yet. etter() sends them again –
  // once per call, never on a timer – when a move has been played since they were last sent
  // (another move took their place: sendtVed) or the line has been down since (linjeBrutt: what was
  // on its way is gone). Meanwhile the screen says «sender», never «sendt».
  let skylder = "";
  let sendtVed = -1; // the moves played on this phone when the answers were last sent
  let linjeBrutt = false; // the line has been down since then
  let antallTrekk = 0; // moves played on this phone in this match
  // What I have typed so far, by round. It is also kept on this phone (the kit's own store for the
  // match, R.nett.hemmelig: never sent anywhere), so a reload while writing keeps the text; it is
  // removed from there when the answers are in the room's list.
  let utkast = { nokkel: "", felt: [] };
  let lagret = null; // the round whose draft lies in the phone's store ("" = none, null = not looked yet)
  let tegnes = false; // a live move changed the state: etter() draws
  let vistFase = ""; // the phase this phone's screen shows (a new one is drawn as a new screen)
  // The ten seconds on this phone: { nokkel, slutt, id, sist, ute, apen, etterId }.
  let ned = null;

  function nettRunde(sp) {
    const p = pakke(sp.pakke);
    const k = kategorierFor(p, sp.kat, sp.runde, sp.katRekke);
    // The leader: the first round's is the match's first seat; then the next seat still in after
    // the one who led the round before (a seat that has left never makes anyone lead twice).
    const leder = sp.r ? nesteInne(sp, sp.r.leder) : forsteInne(sp, sp.forste);
    sp.r = { b: sp.bokstaver[sp.runde], k, leder, fase: "skriv", svar: Array(sp.antall).fill(null), stopp: -1, velgere: null, nr: 0, merk: {}, pluss: null, status: null };
  }
  // The round is closed: a seat without answers has empty ones, and the seats that are in now are
  // the voters of this round's scoring.
  function tilDom(sp) {
    const r = sp.r;
    const med = inne(sp);
    for (const i of med) if (r.svar[i] == null) r.svar[i] = r.k.map(() => "");
    r.velgere = med;
    r.fase = "dom";
    r.nr = 0;
  }
  // Category n as it stands with the marks so far.
  function nettDom(sp, n) {
    const r = sp.r;
    const med = inne(sp);
    const velgere = r.velgere || med;
    return domKategori(
      r.svar.map((s) => (s ? s[n] : null)),
      r.b,
      med,
      (i) => strok(r.merk[`${n}:${i}`], i, velgere, med),
      sp.antall,
    );
  }
  // The round's points: every category by the rules.
  function nettDelUt(sp) {
    const r = sp.r;
    r.status = r.k.map((_, n) => nettDom(sp, n));
    r.pluss = range(sp.antall).map((i) => r.status.reduce((s, d) => s + d.poeng[i], 0));
    r.pluss.forEach((p, i) => (sp.poeng[i] += p));
    r.status = r.status.map((d) => d.status);
    sp.spilt += 1;
    r.fase = "poeng";
  }

  // (The seed is new for every match of every room: a draft or a countdown never follows into another.)
  const nokkelFor = (sp) => `${sp.fro}:${sp.runde}`;
  // What this phone is to do now ("" = nothing): my answers.
  function minOppgave(sp) {
    const i = meg();
    if (!paNett(sp) || sp.ferdig || i < 0 || ute(sp, i) || sp.r.fase !== "skriv" || sp.r.svar[i] != null) return "";
    return `skriv:${nokkelFor(sp)}`;
  }
  // My answers are on their way: sent, and the room has not answered yet.
  const paVei = (sp) => {
    const oppgave = minOppgave(sp);
    return !!oppgave && skylder === oppgave && R.nett.venter();
  };
  // The fields are on the screen: my answers are neither in the room's list nor on their way.
  const kanSvare = (sp) => !!minOppgave(sp) && !paVei(sp);
  const styrer = (sp) => paNett(sp) && R.nett.erMeg(sp.r.leder);
  const fasenokkel = (sp) => (sp.ferdig ? "slutt" : `${sp.r.fase}:${sp.runde}:${sp.r.fase === "dom" ? sp.r.nr : 0}`);
  const tellerTekst = (sp) => {
    const med = inne(sp);
    return R.t("{n} av {m} har levert", { n: med.filter((i) => sp.r.svar[i] != null).length, m: med.length });
  };
  const stoppTekst = (sp) => {
    const r = sp.r;
    if (r.stopp < 0) return "";
    if (R.nett.erMeg(r.stopp)) return R.t("Du sa stopp! De andre har ti sekunder.");
    return kanSvare(sp) ? R.t("{navn} sa stopp! Ti sekunder igjen.", { navn: R.navn(r.stopp) }) : R.t("{navn} sa stopp! Venter på de siste.", { navn: R.navn(r.stopp) });
  };
  const knappTekst = (sp) => (sp.r.stopp < 0 ? R.t("Stopp – jeg er ferdig!") : R.t("Send svarene"));
  // What is in my fields now (as it would be sent).
  function mineSvar(sp) {
    hentUtkast(sp);
    const felt = Array.from(document.querySelectorAll("#skjerm [data-felt='n-utkast']"));
    const fra = felt.length ? felt.map((f) => f.value) : utkast.nokkel === minOppgave(sp) ? utkast.felt : [];
    return sp.r.k.map((_, n) => nettRens(fra[n]));
  }

  // ----- The draft on this phone -----
  // What the phone's store holds: { n: the round, f: the fields, s: 1 when the phone owes them }.
  function lesLager() {
    try {
      const x = R.nett.hemmelig();
      return x && typeof x === "object" && typeof x.n === "string" && Array.isArray(x.f) ? x : null;
    } catch (e) {
      return null;
    }
  }
  // This round's draft: what is in memory, or – after a reload – what the phone's store has (and
  // whether the phone had undertaken to deliver: then it still owes).
  function hentUtkast(sp) {
    const oppgave = minOppgave(sp);
    if (!oppgave || utkast.nokkel === oppgave) return;
    utkast = { nokkel: oppgave, felt: [] };
    const x = lesLager();
    lagret = x ? x.n : "";
    if (!x || x.n !== oppgave) return;
    utkast.felt = sp.r.k.map((_, n) => (typeof x.f[n] === "string" ? Array.from(x.f[n]).slice(0, MAKS_TEGN).join("") : ""));
    if (x.s === 1) {
      skylder = oppgave;
      linjeBrutt = true; // (whatever the page before this one sent is not on its way any more)
    }
  }
  function lagreUtkast() {
    if (!utkast.nokkel) return;
    try {
      R.nett.hemmelig({ n: utkast.nokkel, f: Array.from(utkast.felt, (x) => Array.from(String(x == null ? "" : x)).slice(0, MAKS_TEGN).join("")), s: skylder === utkast.nokkel ? 1 : 0 });
      lagret = utkast.nokkel;
    } catch (e) {
      /* the store is closed or full: the draft stays in memory */
    }
  }
  // The answers are in the room's list (or the round is over): nothing of them stays in the store.
  function glemUtkast(sp) {
    if (lagret === null) {
      const x = lesLager();
      lagret = x ? x.n : "";
    }
    if (!lagret || lagret === minOppgave(sp)) return;
    lagret = "";
    try {
      R.nett.hemmelig(null);
    } catch (e) {
      /* ignore */
    }
  }

  // ----- Delivering -----
  // My answers go to the room: one move, well under 1 KB (six answers of at most 30 characters).
  // false: they did not go (no line, or a move of mine is on its way).
  function sendNa(S) {
    const sp = S.spill;
    const t = { svar: mineSvar(sp), r: sp.runde };
    if (new TextEncoder().encode(JSON.stringify(t)).length > 1000) t.svar = t.svar.map((x) => Array.from(x).slice(0, 12).join(""));
    if (!R.nett.tilkoblet()) linjeBrutt = true;
    if (!R.nett.send(t)) return false;
    sendtVed = antallTrekk;
    linjeBrutt = false;
    return true;
  }
  // This phone undertakes to deliver (the button, or its ten seconds are out): from now on it owes
  // what is in the fields, and they go at once if they can. What it owes is kept with the draft,
  // so a reload does not forget it.
  function lever(S) {
    const sp = S.spill;
    const oppgave = minOppgave(sp);
    if (!oppgave || paVei(sp)) return false;
    utkast = { nokkel: oppgave, felt: mineSvar(sp) };
    skylder = oppgave;
    lagreUtkast();
    return sendNa(S);
  }

  // ----- The ten seconds -----
  function stoppNed() {
    if (!ned) return;
    clearInterval(ned.id);
    clearTimeout(ned.etterId);
    ned = null;
  }
  const nedIgjen = () => (ned ? Math.max(0, Math.ceil((ned.slutt - performance.now()) / 1000)) : 0);
  function tegnNed() {
    const el = R.$("#skjerm [data-fl-ned]");
    if (el) el.textContent = ned && !ned.ute ? String(nedIgjen()) : "";
    const boks = R.$("#skjerm [data-fl-stopp]");
    if (boks) boks.classList.toggle("ute", !!(ned && ned.ute));
  }
  function tikkNed() {
    const S = R.S;
    const sp = S && S.spill;
    if (!ned || !paNett(sp) || sp.ferdig || nokkelFor(sp) !== ned.nokkel || sp.r.fase !== "skriv") return stoppNed();
    if (!R.nett.tilkoblet()) linjeBrutt = true; // (the clock is running anyway: it notices too)
    const igjen = nedIgjen();
    if (igjen !== ned.sist) {
      ned.sist = igjen;
      if (igjen > 0 && igjen <= 5 && kanSvare(sp)) {
        R.lyd.tikk();
        R.vibrer(10);
      }
      tegnNed();
    }
    if (igjen > 0) return;
    // Time is out on this phone: what I have goes now – once – if I have not delivered.
    clearInterval(ned.id);
    ned.id = null;
    ned.ute = true;
    tegnNed();
    if (kanSvare(sp)) {
      R.lukkArk();
      R.lyd.alarm();
      lever(S); // (no line just now: the phone owes them, and etter() sends them when it is back)
      if (S.skjerm === "n-skriv") R.vis();
    }
    // A little later the ones who have delivered may go on without the rest (a button, never by itself).
    ned.etterId = setTimeout(() => {
      if (!ned) return;
      ned.apen = true;
      const sp2 = R.S && R.S.spill;
      if (paNett(sp2) && nokkelFor(sp2) === ned.nokkel && sp2.r.fase === "skriv" && R.S.skjerm === "n-skriv" && !kanSvare(sp2)) R.vis();
    }, 3000);
  }
  // The state says whether the ten seconds run (after «Stopp», while the round is open).
  function passNed(S, live) {
    const sp = S.spill;
    // (No page – the rules run alone, as in the unit tests: no clock.)
    if (!paNett(sp) || sp.ferdig || sp.r.fase !== "skriv" || sp.r.stopp < 0 || !R.$("#skjerm")) return stoppNed();
    if (ned && ned.nokkel === nokkelFor(sp)) return;
    stoppNed();
    ned = { nokkel: nokkelFor(sp), slutt: performance.now() + NEDTELLING * 1000, id: setInterval(tikkNed, 200), sist: null, ute: false, apen: false, etterId: null };
    if (live) {
      R.lyd.pek();
      R.vibrer([60, 40, 120]);
    }
    tikkNed();
  }

  // While this phone is typing, a move changes only what stands around the fields.
  function lappSkriv(S) {
    const sp = S.spill;
    const teller = R.$("#skjerm [data-fl-teller]");
    if (teller) teller.textContent = tellerTekst(sp);
    const boks = R.$("#skjerm [data-fl-stopp]");
    if (boks) {
      boks.hidden = sp.r.stopp < 0;
      const tekst = boks.querySelector("[data-fl-stopptekst]");
      if (tekst && tekst.textContent !== stoppTekst(sp)) tekst.textContent = stoppTekst(sp);
    }
    const knapp = R.$("#fl-send");
    if (knapp) {
      knapp.classList.toggle("rod", sp.r.stopp < 0);
      const tekst = knapp.querySelector("[data-fl-knapptekst]");
      if (tekst) tekst.textContent = knappTekst(sp);
    }
    tegnNed();
  }
  // After a live move: a new phase is a new screen; else the same one again – or, while this phone
  // is typing, only what stands around the fields.
  function nettTegn(S) {
    const sp = S.spill;
    if (R.S !== S || !S.skjerm || S.skjerm === "nett" || !paNett(sp) || !R.$("#skjerm")) return;
    const mal = NETT.skjerm(S);
    if (S.skjerm !== mal || fasenokkel(sp) !== vistFase) {
      if (sp.ferdig) feire = true;
      else if (sp.r.fase === "dom" && sp.r.nr === 0 && !vistFase.startsWith("dom:")) R.lyd.pling();
      else if (sp.r.fase === "poeng") R.lyd.riktig();
      R.lukkArk();
      return R.gaTil(mal);
    }
    const skjema = R.$("#skjerm [data-nett-skjema]");
    if (skjema && kanSvare(sp) && skjema.dataset.nettSkjema === minOppgave(sp)) return lappSkriv(S);
    R.vis();
  }

  const NETT = {
    min: MIN,
    maks: MAKS,
    // The host's own settings: pack, rounds, categories and the extra letters.
    oppsett: (S) => ({ pakke: tillatt(S.oppsett.pakke), runder: S.oppsett.runder, kat: S.oppsett.kat, ekstra: !!S.oppsett.ekstra && EKSTRA_FINNES }),
    oppsettTekst: (o) => {
      const x = o || {};
      const p = pakke(x.pakke);
      return [`${p.voksen ? R.t("{pakke} (18+)", { pakke: p.navn }) : p.navn} ${p.ikon}`, R.flertall(RUNDER.includes(x.runder) ? x.runder : 5, "runde", "runder"), R.flertall(KATEGORIER.includes(x.kat) ? x.kat : 5, "kategori", "kategorier")].join(" · ");
    },
    start(S, okt) {
      const o = okt.oppsett || {};
      const n = R.klamp(okt.antall || MIN, MIN, MAKS);
      const p = pakke(o.pakke);
      const runder = RUNDER.includes(o.runder) ? o.runder : 5;
      const ekstra = o.ekstra === true && EKSTRA_FINNES;
      // The letters and the order of the pack's categories: the room's chance, the same on every phone.
      const rng = R.nett.tilfeldig(okt.fro, "flinkisen");
      const sp = {
        modus: "nett",
        fro: okt.fro >>> 0,
        antall: n,
        pakke: p.id,
        runder,
        kat: KATEGORIER.includes(o.kat) ? o.kat : 5,
        ekstra,
        runde: 0,
        bokstaver: stokk(bokstaver(SPRAK, ekstra), rng).slice(0, runder),
        katRekke: stokk(range(p.k.length), rng),
        poeng: Array(n).fill(0),
        spilt: 0,
        ute: [],
        forste: (okt.kamp - 1) % n, // the first round's leader: one seat on per match
        steg: 0,
        r: null,
        ferdig: false,
      };
      nettRunde(sp);
      S.spill = sp;
      feire = false;
      skylder = "";
      sendtVed = -1;
      linjeBrutt = false;
      utkast = { nokkel: "", felt: [] };
      lagret = null;
      antallTrekk = 0;
      tegnes = false;
      vistFase = "";
      stoppNed();
    },
    trekk(S, t, sete, okt) {
      const sp = S.spill;
      antallTrekk += 1;
      if (!paNett(sp) || sp.ferdig || !t || typeof t !== "object" || !(sete >= 0 && sete < sp.antall) || ute(sp, sete)) return;
      const r = sp.r;
      if (r.fase === "skriv" && Array.isArray(t.svar)) {
        if (t.r !== sp.runde || r.svar[sete] != null) return;
        r.svar[sete] = r.k.map((_, n) => (typeof t.svar[n] === "string" ? nettRens(t.svar[n]) : ""));
        if (r.stopp < 0) r.stopp = sete;
        if (harAlle(sp, r.svar)) tilDom(sp);
      } else if (r.fase === "skriv" && Number.isInteger(t.lukk)) {
        // From a seat that has delivered, after a «Stopp» – and never from one phone alone: two
        // seats still in must have delivered (with two seats in, the one is enough).
        const med = inne(sp);
        if (t.lukk !== sp.runde || r.stopp < 0 || r.svar[sete] == null || !kanLukke(med.filter((i) => r.svar[i] != null).length, med.length)) return;
        tilDom(sp);
      } else if (r.fase === "dom" && Array.isArray(t.merk)) {
        const [kat, hvem] = t.merk;
        if (t.r !== sp.runde || t.merk.length !== 2 || kat !== r.nr || !Number.isInteger(hvem) || hvem < 0 || hvem >= sp.antall || hvem === sete || ute(sp, hvem) || (t.pa !== 0 && t.pa !== 1)) return;
        // Only an answer that would count can be marked.
        const tekst = r.svar[hvem] ? r.svar[hvem][kat] : "";
        if (!norm(tekst) || !passer(tekst, r.b)) return;
        const nokkel = `${kat}:${hvem}`;
        const liste = (r.merk[nokkel] || []).filter((i) => i !== sete);
        if (t.pa === 1) liste.push(sete);
        if (liste.length) r.merk[nokkel] = liste.sort((a, b) => a - b);
        else delete r.merk[nokkel];
      } else if (r.fase === "dom" && Number.isInteger(t.neste)) {
        if (t.neste !== sp.steg || sete !== r.leder) return;
        sp.steg += 1;
        if (r.nr < r.k.length - 1) r.nr += 1;
        else nettDelUt(sp);
      } else if (r.fase === "dom" && Number.isInteger(t.forrige)) {
        if (t.forrige !== sp.steg || sete !== r.leder || r.nr <= 0) return;
        sp.steg += 1;
        r.nr -= 1;
      } else if (r.fase === "poeng" && Number.isInteger(t.neste)) {
        if (t.neste !== sp.steg || sete !== r.leder) return;
        sp.steg += 1;
        if (sp.runde + 1 >= sp.runder) sp.ferdig = true;
        else {
          sp.runde += 1;
          nettRunde(sp);
        }
      } else return;
      if (!okt.gjenspill) tegnes = true;
    },
    // The seat left: never waited for again, its answers and its own marks no longer count, the
    // next seat leads if it led, and it is not ranked. (The voters of a round that is being scored
    // stay as they were when it was closed: its leaving turns no vote.)
    borte(S, sete, okt) {
      const sp = S.spill;
      antallTrekk += 1;
      if (!paNett(sp) || sp.ferdig || !(sete >= 0 && sete < sp.antall) || ute(sp, sete)) return;
      sp.ute.push(sete);
      const r = sp.r;
      if (inne(sp).length < MIN) sp.ferdig = true; // (the room ends the match before this happens)
      else {
        if (r.leder === sete) r.leder = forsteInne(sp, sete);
        if (r.fase === "skriv") {
          // (A «Stopp» from the seat that left still stands: the others' ten seconds are running.)
          r.svar[sete] = null;
          if (r.stopp >= 0 && harAlle(sp, r.svar)) tilDom(sp);
        }
      }
      if (!okt.gjenspill) tegnes = true;
    },
    skjerm(S) {
      const sp = S.spill;
      if (!sp || sp.ferdig) return "slutt";
      return { dom: "n-dom", poeng: "n-poeng" }[sp.r.fase] || "n-skriv";
    },
    // Writing: my turn while I have not delivered, else the first one still to; then the leader.
    tur(S) {
      const sp = S.spill;
      // (The kit asks whose turn it is also when the line goes: that is where this phone notices
      // that whatever it had on its way is gone.)
      if (!R.nett.tilkoblet()) linjeBrutt = true;
      if (!paNett(sp) || sp.ferdig) return null;
      const r = sp.r;
      if (r.fase !== "skriv") return r.leder;
      if (minOppgave(sp)) return meg();
      for (let k = 0; k < sp.antall; k++) {
        const i = (r.leder + k) % sp.antall;
        if (!ute(sp, i) && r.svar[i] == null) return i;
      }
      return null;
    },
    ferdig: (S) => !!S.spill && !!S.spill.ferdig,
    // After every live move, a replay, a move the room dropped, and when the line is back with
    // nothing new: what this phone owes goes again – once per call, never on a timer – when the
    // answers are not in the room's list, nothing of ours is on its way, the line is up, and either
    // a move has been played since they were last sent (it took their place) or the line has been
    // down since. Then the screen, then the ten seconds as the state says.
    etter(S) {
      const sp = S.spill;
      if (!paNett(sp)) return;
      hentUtkast(sp);
      if (!R.nett.tilkoblet()) linjeBrutt = true;
      if (skylder && skylder !== minOppgave(sp)) skylder = "";
      glemUtkast(sp);
      const live = tegnes;
      if (skylder && R.nett.tilkoblet() && !R.nett.venter() && (antallTrekk > sendtVed || linjeBrutt) && sendNa(S)) tegnes = true;
      if (tegnes) {
        tegnes = false;
        nettTegn(S);
      }
      passNed(S, live);
    },
  };

  // ---------- Start ----------

  R.start({
    id: "flinkisen",
    versjon: 1,
    pagar,
    nett: NETT,

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: Object.assign({}, STANDARD),
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      const o = (S.oppsett = Object.assign({}, STANDARD, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      o.pakke = tillatt(o.pakke);
      if (!RUNDER.includes(o.runder)) o.runder = STANDARD.runder;
      if (!KATEGORIER.includes(o.kat)) o.kat = STANDARD.kat;
      if (!TIDER.includes(o.tid)) o.tid = STANDARD.tid;
      o.ekstra = o.ekstra === true && EKSTRA_FINNES;
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const tall = (l, lengde) => Array.isArray(l) && l.length === lengde && l.every((x) => Number.isInteger(x));
        const p = PAKKER.find((x) => x.id === sp.pakke);
        let ok =
          sp.modus === "en" && !!p && Number.isInteger(n) && n >= MIN && n <= MAKS &&
          RUNDER.includes(sp.runder) && KATEGORIER.includes(sp.kat) && TIDER.includes(sp.tid) &&
          Number.isInteger(sp.runde) && sp.runde >= 0 && sp.runde < sp.runder && Number.isInteger(sp.spilt) &&
          Array.isArray(sp.bokstaver) && sp.bokstaver.length === sp.runder && sp.bokstaver.every((b) => typeof b === "string" && b.length === 1) &&
          tall(sp.katRekke, p.k.length) && tall(sp.poeng, n);
        const r = sp.r;
        if (ok && !sp.ferdig) {
          ok =
            !!r && r.b === sp.bokstaver[sp.runde] && ["klar", "trekk", "skriv", "stopp", "dom", "ferdig"].includes(r.fase) &&
            Array.isArray(r.k) && r.k.length >= 1 && r.k.every((k) => Number.isInteger(k) && !!p.k[k]) &&
            Number.isInteger(r.nr) && r.nr >= 0 && r.nr < r.k.length &&
            Array.isArray(r.score) && r.score.length === n && r.score.every((rad) => Array.isArray(rad) && rad.length === r.k.length && rad.every((x) => x === null || VERDIER.includes(x))) &&
            (r.fase !== "ferdig" || tall(r.pluss, n));
          if (ok) {
            r.igjen = R.klamp(Number(r.igjen) || 0, 0, sp.tid);
            r.ned = R.klamp(Number(r.ned) || NEDTELLING, 1, NEDTELLING);
            // A reload while the letter spun: the letter is there, and the writing begins.
            if (r.fase === "trekk") r.fase = "skriv";
          }
        }
        if (!ok) S.spill = null;
      }
      const spillskjermer = ["klar", "skriv", "dom", "stilling"];
      if (spillskjermer.includes(S.skjerm)) S.skjerm = pagar(S) ? skjermFor(S.spill) : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    // (a getter: on the net the answers do leave the phone, and the last tip says so)
    get regler() {
      return {
        intro: R.t("Én bokstav, fem eller seks kategorier, og alle skriver samtidig. Vær først ferdig – men finn på noe ingen andre har."),
        steg: [
          [R.t("Trekk en bokstav"), R.t("Mobilen trekker bokstaven og viser kategoriene. Alle skriver ett svar til hver kategori – på papir, eller på hver sin mobil på nett.")],
          [R.t("Si stopp"), R.t("Den første som har svar på alt, trykker «Stopp». Da har de andre ti sekunder på seg.")],
          [R.t("Gå gjennom svarene"), R.t("Ta én kategori om gangen. Et svar ingen andre har, gir 10 poeng. Likt svar gir 5. Tomt eller feil gir 0. Flest poeng etter siste runde vinner.")],
        ],
        tips: [
          R.t("Svaret må begynne på bokstaven. Skriv bare selve ordet: «bjørn», ikke «en bjørn»."),
          R.t("Uenige om et svar holder? Flertallet bestemmer."),
          R.t("På nett kan alle trykke «Teller ikke» på et svar. Sier flertallet av de andre det samme, gir svaret 0 poeng."),
          R.paNett && R.paNett() === true
            ? R.t("På nett går svarene gjennom rommet til de andre mobilene. Rommet slettes senest et døgn etter siste trekk.")
            : R.t("På én mobil skriver dere på papir. Mobilen husker bare poengene."),
        ],
      };
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          return R.ui.spillhjem({
            slagordHtml: `${esc(S.oppsett.kat === 6 ? R.t("Én bokstav, seks kategorier.") : R.t("Én bokstav, fem kategorier."))}<br><em>${esc(R.t("Førstemann sier stopp!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }) : "",
              ekstraHtml: (R.nett ? R.nett.knapp() : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              [`${MIN}–${MAKS}`, R.t("spillere")],
              [String(PAKKER.length), R.t("pakker")],
              [String(PAKKER.reduce((s, p) => s + p.k.length, 0)), R.t("kategorier")],
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
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Alle trenger blyant og papir.") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Kategorier"))}</h2></div>
              ${R.ui.fliser("pakke", PAKKER.map((p) => ({ v: p.id, tittel: p.navn, tekst: p.tekst, ikon: p.ikon })), o.pakke)}
              ${R.ui.seg("kat", KATEGORIER.map((n) => [n, R.t("{n} per runde", { n })]), o.kat, { etikett: R.t("Hvor mange kategorier per runde") })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Runder"))}</h2></div>
              ${R.ui.seg("runder", RUNDER.map((n) => [n, String(n)]), o.runder, { etikett: R.t("Hvor mange runder") })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Tid per runde"))}</h2></div>
              ${R.ui.seg("tid", TIDER.map((t) => [t, TIDNAVN[t]]), o.tid, { etikett: R.t("Tid per runde") })}
              <p class="hjelp">${esc(o.tid ? R.t("Runden stopper når tida er ute – eller når noen sier stopp.") : R.t("Runden varer til den første sier stopp."))}</p>
            </section>
            ${EKSTRA_FINNES ? `<section class="seksjon">${R.ui.bryter("ekstra", o.ekstra, R.t("Æ, Ø og Å"), R.t("De tre siste bokstavene kan også trekkes."))}</section>` : ""}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      // One phone: the round's categories, before the letter is drawn.
      klar: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const forste = sp.runde === 0;
          return `
            <div class="fl-klar">
              ${R.figur()}
              <div>
                <p class="etikett">${esc(rundeTittel(S))}</p>
                <h1 id="skjerm-tittel">${esc(forste ? R.t("Finn fram blyant og papir!") : R.t("Klar for en ny bokstav?"))}</h1>
              </div>
            </div>
            ${katListe(sp, r)}
            <p class="hjelp fl-hjelp">${esc(forste ? R.t("Skriv tallene nedover arket. Den første som har svar på alt, trykker «Stopp» på mobilen.") : R.t("Samme regler: ett svar per kategori, og førstemann sier stopp."))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Trekk bokstav"), "trekk", { variant: "stor", ikon: "🔤" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn: () => R.holdVaken(),
      },

      // One phone: the letter, the categories and the clock while everyone writes.
      skriv: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const trekker = r.fase === "trekk";
          const stoppet = r.fase === "stopp";
          const klokke = stoppet ? R.ui.timer({ id: "fl-ned", sekunder: r.ned, visning: "sek" }) : sp.tid ? R.ui.timer({ id: "fl-tid", sekunder: r.igjen }) : "";
          return `
            <div class="fl-topp${klokke ? " med-klokke" : ""}${stoppet ? " stoppet" : ""}">
              ${flis(trekker ? "?" : r.b, trekker ? "trekker" : "")}
              <div class="fl-topp-tekst">
                <p class="etikett">${esc(rundeTittel(S))}</p>
                <h1 id="skjerm-tittel">${esc(trekker ? R.t("Hvilken bokstav blir det?") : stoppet ? R.t("Stopp!") : R.t("Alt på {b}", { b: r.b }))}</h1>
                ${stoppet ? `<p class="fl-stopplinje" role="status">${esc(R.t("Ti sekunder igjen – skriv ferdig!"))}</p>` : ""}
              </div>
              ${klokke}
            </div>
            ${katListe(sp, r, trekker ? "skjult" : "")}
            ${R.ui.dokk(
              stoppet ? R.ui.knapp(R.t("Alle er ferdige"), "ferdige") : R.ui.knapp(R.t("Stopp!"), "stopp", { variant: "stor rod", ikon: "✋", av: trekker }),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        async inn(S) {
          const sp = S.spill;
          const r = sp && sp.r;
          if (!r || !["trekk", "skriv", "stopp"].includes(r.fase)) return R.gaTil(pagar(S) ? skjermFor(sp) : "hjem");
          R.holdVaken();
          if (r.fase === "trekk") {
            const fortsatt = R.vakt();
            await R.vent(R.rolig() ? 50 : 250);
            if (!fortsatt()) return;
            await spinn(r.b);
            if (!fortsatt() || S.spill !== sp || sp.r !== r || !begynn(sp)) return;
            R.vis();
            R.si(R.t("Bokstaven er {b}. Kategoriene er: {kategorier}.", { b: r.b, kategorier: r.k.map((k) => katNavn(sp, k)).join(", ") }));
          }
          startKlokker(S);
        },
        ut(S) {
          const r = S.spill && S.spill.r;
          const t = R.timer("fl-tid");
          if (t && r && r.fase === "skriv") r.igjen = Math.max(1, Math.ceil(t.igjen));
          const n = R.timer("fl-ned");
          if (n && r && r.fase === "stopp") r.ned = Math.max(1, Math.ceil(n.igjen));
        },
      },

      // One phone: one category at a time – what was each answer worth?
      dom: {
        tittel: (S) => R.t("Kategori {n} av {m}", { n: S.spill.r.nr + 1, m: S.spill.r.k.length }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const siste = r.nr === r.k.length - 1;
          const mangler = r.mangler ? r.score.filter((rad) => rad[r.nr] == null).length : 0;
          return `
            <div class="fl-domkort">
              <p class="etikett">${esc(R.t("Les opp svarene!"))}</p>
              <h1 id="skjerm-tittel">${esc(katNavn(sp, r.k[r.nr]))} <span class="fl-pa">${esc(R.t("på {b}", { b: r.b }))}</span></h1>
              ${poengForklaring()}
            </div>
            <ul class="fl-poengrader">${range(sp.antall)
              .map((i) => {
                const v = r.score[i][r.nr];
                // A row nobody has scored is marked when the group tries to move on (never a silent 0).
                const tom = r.mangler && v == null;
                return `<li class="${tom ? "mangler" : ""}" style="--pf: var(--p${(i % 20) + 1})">${R.avatar(i)}<span class="fl-pr-navn">${esc(R.navn(i))}${tom ? `<small class="fl-mangler">${esc(R.t("Mangler poeng"))}</small>` : ""}</span>
                  <div class="seg fl-pseg" role="group" aria-label="${esc(R.t("Poeng til {navn}", { navn: R.navn(i) }))}">${VERDIER.map((p) => `<button data-h="poeng" data-v="${i}:${p}" aria-pressed="${v === p}">${p}</button>`).join("")}</div></li>`;
              })
              .join("")}</ul>
            ${R.ui.dokk(
              mangler ? `<p class="fl-mangler-linje" role="status">${esc(mangler === 1 ? R.t("Sett 0, 5 eller 10 for den siste før dere går videre.") : R.t("Sett 0, 5 eller 10 for alle før dere går videre."))}</p>` : "",
              R.ui.knapp(siste ? R.t("Se poengene") : R.t("Neste kategori"), "kat-neste"),
              R.ui.lenkerad(r.nr > 0 ? R.ui.lenke(R.t("Forrige kategori"), "kat-forrige") : "", R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      // One phone: the standing after a round.
      stilling: {
        tittel: R.t("Stillingen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const siste = sp.runde + 1 >= sp.runder;
          return `
            ${R.ui.banner({ etikett: R.t("{runde} er ferdig", { runde: rundeTittel(S) }), tittel: lederTittel(sp), klasse: "aksent", stemning: "" })}
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${R.ui.dokk(R.ui.knapp(siste ? R.t("Til kåringen") : R.t("Neste runde"), "neste-runde"), R.ui.lenkerad(R.ui.lenke(R.t("Endre poengene"), "endre-poeng"), siste ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
      },

      // On the net: the letter, and my answers on my own phone. Nobody else's answer is on the page.
      "n-skriv": {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          vistFase = fasenokkel(sp);
          hentUtkast(sp);
          const oppgave = minOppgave(sp);
          const kan = kanSvare(sp);
          const jeg = meg();
          const felt = utkast.nokkel === oppgave ? utkast.felt : [];
          // «Sendt» only when my answers are in the room's list; «sender» while they are on their
          // way. (My own answers, on my own phone.)
          const sendt = !!r.svar[jeg];
          const sender = paVei(sp);
          const mine = r.svar[jeg] || (sender ? r.k.map((_, n) => nettRens(felt[n])) : null);
          const med = inne(sp);
          const mangler = med.filter((i) => r.svar[i] == null);
          const videre = sendt && ned && ned.apen && ned.nokkel === nokkelFor(sp) && mangler.length > 0 && kanLukke(med.length - mangler.length, med.length);
          // The phone owes its answers and has no line: they go when it is back.
          const venterLinje = kan && skylder === oppgave && !R.nett.tilkoblet();
          return `
            <div class="fl-topp">
              ${flis(r.b, "ny")}
              <div class="fl-topp-tekst">
                <p class="etikett">${esc(rundeTittel(S))}</p>
                <h1 id="skjerm-tittel">${esc(kan ? R.t("Alt på {b}", { b: r.b }) : R.t("Venter på de andre …"))}</h1>
              </div>
            </div>
            <div class="fl-stopp${ned && ned.ute ? " ute" : ""}" data-fl-stopp${r.stopp < 0 ? " hidden" : ""}>
              <p role="status" data-fl-stopptekst>${esc(stoppTekst(sp))}</p>
              <b class="fl-ned" data-fl-ned aria-hidden="true">${ned && !ned.ute && ned.nokkel === nokkelFor(sp) ? nedIgjen() : ""}</b>
            </div>
            ${
              kan
                ? `<form class="fl-skjema" data-skjema="n-linje" data-nett-skjema="${esc(oppgave)}" data-hemmelig autocomplete="off" novalidate>
                    ${r.k
                      .map((k, n) => {
                        const v = felt[n] || "";
                        return `<div class="fl-felt${norm(v) && !passer(v, r.b) ? " feil" : ""}">
                          <label for="fl-felt-${n}">${esc(katNavn(sp, k))}</label>
                          <input id="fl-felt-${n}" class="tekstfelt" data-felt="n-utkast" data-k="${n}" maxlength="${MAKS_TEGN}" value="${esc(v)}" placeholder="${esc(r.b)} …" autocomplete="off" autocapitalize="sentences" autocorrect="off" spellcheck="false" enterkeyhint="${n < r.k.length - 1 ? "next" : "done"}">
                          <small>${esc(R.t("Begynner ikke på {b}", { b: r.b }))}</small>
                        </div>`;
                      })
                      .join("")}
                  </form>`
                : mine
                  ? `<div class="papirboks fl-sendt${sendt ? "" : " sender"}">
                    <p class="fl-sendt-tittel" role="status">${sendt ? `✓ ${esc(R.t("Svarene dine er sendt."))}` : esc(R.t("Sender svarene dine …"))}</p>
                    <ul class="fl-mine">${r.k.map((k, n) => `<li><span>${esc(katNavn(sp, k))}</span><b>${mine[n] ? esc(mine[n]) : "–"}</b></li>`).join("")}</ul>
                  </div>`
                  : ""
            }
            ${venterLinje ? `<p class="hjelp fl-skylder" role="status">${esc(R.t("Svarene går så snart mobilen er på nett igjen."))}</p>` : ""}
            <p class="hjelp fl-teller" data-fl-teller>${esc(tellerTekst(sp))}</p>
            ${
              kan
                ? R.ui.dokk(`<button class="knapp stor${r.stopp < 0 ? " rod" : ""}" id="fl-send" data-h="n-stopp"><span class="ikon" aria-hidden="true">✋</span><span data-fl-knapptekst>${esc(knappTekst(sp))}</span></button>`)
                : videre
                  ? R.ui.dokk(R.ui.knapp2(mangler.length === 1 ? R.t("Gå videre uten {navn}", { navn: R.navn(mangler[0]) }) : R.t("Gå videre uten de som mangler"), "n-lukk"))
                  : ""
            }`;
        },
        inn: () => R.holdVaken(),
        etter(S, rot) {
          // Enter goes to the next field (an answer is one line); the last one puts the keyboard away.
          const skjema = rot.querySelector(".fl-skjema");
          if (!skjema || skjema.dataset.koblet) return;
          skjema.dataset.koblet = "1";
          skjema.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.isComposing || !e.target.matches("input")) return;
            e.preventDefault();
            const neste = skjema.querySelector(`#fl-felt-${Number(e.target.dataset.k) + 1}`);
            if (neste) neste.focus();
            else e.target.blur();
          });
        },
      },

      // On the net: one category, every answer as plain text, and «Teller ikke» on the others' answers.
      "n-dom": {
        tittel: (S) => R.t("Kategori {n} av {m}", { n: S.spill.r.nr + 1, m: S.spill.r.k.length }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          vistFase = fasenokkel(sp);
          const n = r.nr;
          const jeg = meg();
          const med = inne(sp);
          const d = nettDom(sp, n);
          const krav = kravTil(r.velgere || med);
          const siste = n === r.k.length - 1;
          const MERKE = { tom: R.t("tomt"), feil: R.t("feil bokstav"), strok: R.t("teller ikke"), delt: R.t("likt"), alene: R.t("alene") };
          return `
            <div class="fl-domkort">
              <p class="etikett">${esc(R.t("Runde {n} av {m}", { n: sp.runde + 1, m: sp.runder }))}</p>
              <h1 id="skjerm-tittel">${esc(katNavn(sp, r.k[n]))} <span class="fl-pa">${esc(R.t("på {b}", { b: r.b }))}</span></h1>
              ${poengForklaring()}
            </div>
            <ul class="fl-svar">${med
              .map((i) => {
                const tekst = r.svar[i] ? r.svar[i][n] : "";
                const st = d.status[i];
                const merker = (r.merk[`${n}:${i}`] || []).filter((x) => med.includes(x) && x !== i);
                const kanMerkes = i !== jeg && !ute(sp, jeg) && jeg >= 0 && st !== "tom" && st !== "feil";
                const mitt = merker.includes(jeg);
                return `<li class="fl-rad ${st}${i === jeg ? " meg" : ""}" style="--pf: var(--p${(i % 20) + 1})">
                  <div class="fl-rad-hode">${R.avatar(i)}<span class="fl-rad-navn">${esc(i === jeg ? R.t("{navn} (deg)", { navn: R.navn(i) }) : R.navn(i))}</span><span class="fl-rad-merke">${esc(MERKE[st] || "")}</span><b class="fl-rad-poeng"><span aria-hidden="true">${d.poeng[i]}</span><span class="vh">${esc(R.flertall(d.poeng[i], "poeng", "poeng"))}</span></b></div>
                  <div class="fl-rad-svar"><span class="fl-tekst${st === "tom" ? " tom" : ""}">${st === "tom" ? "–" : esc(tekst)}</span>${
                    kanMerkes
                      ? `<button class="fl-merk" data-h="n-merk" data-v="${i}" aria-pressed="${mitt}" aria-label="${esc(R.t("Svaret til {navn} teller ikke", { navn: R.navn(i) }))}"><span aria-hidden="true">👎</span> ${esc(R.t("Teller ikke"))}<small>${esc(R.t("{n} av {m}", { n: merker.length, m: krav }))}</small></button>`
                      : ""
                  }</div>
                </li>`;
              })
              .join("")}</ul>
            <p class="hjelp fl-hjelp">${esc(R.t("Holder ikke svaret? Trykk «Teller ikke». Flertallet av de andre bestemmer."))}</p>
            ${
              styrer(sp)
                ? R.ui.dokk(R.ui.knapp(siste ? R.t("Del ut poengene") : R.t("Neste kategori"), "n-neste"), n > 0 ? R.ui.lenkerad(R.ui.lenke(R.t("Forrige kategori"), "n-forrige")) : "")
                : `<p class="hjelp fl-hjelp fl-venter">${esc(R.t("{navn} går videre når dere er klare.", { navn: R.navn(r.leder) }))}</p>`
            }`;
        },
        inn: () => R.holdVaken(),
      },

      // On the net: the round's points.
      "n-poeng": {
        tittel: R.t("Stillingen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          vistFase = fasenokkel(sp);
          const siste = sp.runde + 1 >= sp.runder;
          return `
            ${R.ui.banner({ etikett: R.t("{runde} er ferdig", { runde: rundeTittel(S) }), tittel: lederTittel(sp), klasse: "aksent", stemning: "" })}
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${
              styrer(sp)
                ? R.ui.dokk(R.ui.knapp(siste ? R.t("Til kåringen") : R.t("Neste runde"), "n-neste"))
                : `<p class="hjelp fl-hjelp fl-venter">${esc(R.t("{navn} går videre når dere er klare.", { navn: R.navn(r.leder) }))}</p>`
            }`;
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = vinnere(sp);
          const banner = topp.length
            ? R.ui.banner({ tittel: R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(topp.map(R.navn)), n: topp.length }), tekst: R.t("{poeng} etter {runder}", { poeng: R.flertall(sp.poeng[topp[0]], "poeng", "poeng"), runder: R.flertall(sp.spilt, "runde", "runder") }), klasse: "aksent" })
            : R.ui.banner({ tittel: R.t("Ingen poeng ennå"), tekst: R.t("Spill en runde, så blir det kåring!"), klasse: "aksent", stemning: "" });
          return `
            ${banner}
            ${topp.length ? R.ui.pall(rader(sp)) : ""}
            ${sp.spilt ? R.ui.poengliste(rader(sp)) : ""}
            ${
              paNett(sp)
                ? R.nett.sluttDokk()
                : `${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`
            }`;
        },
        inn(S) {
          R.slippVaken();
          if (!feire) return; // back on the screen, or after a reload: the party was held already
          feire = false;
          if (vinnere(S.spill).length) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
          if (!paNett(S.spill)) R.visInstallTips();
        },
      },
    },

    skjema: {
      // (Enter in a field never sends the answers: «Stopp» is a button of its own.)
      "n-linje"() {},
    },

    felt: {
      "n-utkast"(S, el) {
        const sp = S.spill;
        if (!paNett(sp)) return;
        if (!minOppgave(sp)) return;
        hentUtkast(sp);
        utkast.felt[Number(el.dataset.k) || 0] = el.value;
        lagreUtkast(); // (on this phone only: a reload while writing keeps the text)
        const rad = el.closest(".fl-felt");
        if (rad) rad.classList.toggle("feil", !!norm(el.value) && !passer(el.value, sp.r.b));
      },
    },

    handlinger: (H = {
      // ----- On the net -----
      async "n-stopp"(el, e, S) {
        const sp = S.spill;
        if (!paNett(sp) || !kanSvare(sp)) return;
        const tomme = mineSvar(sp).filter((x) => !norm(x)).length;
        // The first to stop should have an answer for everything; an empty field is asked about once.
        if (sp.r.stopp < 0 && tomme) {
          const fortsatt = R.vakt();
          const ja = await R.bekreft(R.t("Stoppe med tomme felt?"), R.t("Et tomt felt gir 0 poeng. De andre får ti sekunder på seg når du stopper."), R.t("Stopp"), R.t("Skriv videre"));
          if (!ja || !fortsatt() || S.spill !== sp || !kanSvare(sp)) return;
        }
        R.lyd.pop();
        lever(S);
        R.vis();
      },
      "n-lukk"(el, e, S) {
        const sp = S.spill;
        if (!paNett(sp) || sp.r.fase !== "skriv" || sp.r.stopp < 0 || sp.r.svar[meg()] == null || R.nett.venter()) return;
        const med = inne(sp);
        if (kanLukke(med.filter((i) => sp.r.svar[i] != null).length, med.length)) R.nett.send({ lukk: sp.runde });
      },
      "n-merk"(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!paNett(sp) || sp.r.fase !== "dom" || !Number.isInteger(i) || R.nett.venter()) return;
        const mitt = (sp.r.merk[`${sp.r.nr}:${i}`] || []).includes(meg());
        R.nett.send({ merk: [sp.r.nr, i], pa: mitt ? 0 : 1, r: sp.runde });
      },
      "n-neste"(el, e, S) {
        const sp = S.spill;
        if (paNett(sp) && ["dom", "poeng"].includes(sp.r.fase) && styrer(sp) && !R.nett.venter()) R.nett.send({ neste: sp.steg });
      },
      "n-forrige"(el, e, S) {
        const sp = S.spill;
        if (paNett(sp) && sp.r.fase === "dom" && sp.r.nr > 0 && styrer(sp) && !R.nett.venter()) R.nett.send({ forrige: sp.steg });
      },

      // ----- One phone -----
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
        if (pagar(S)) R.gaTil(skjermFor(S.spill));
      },
      async pakke(el, e, S) {
        const id = pakke(el.dataset.v).id;
        if (id === S.oppsett.pakke) return;
        // The party pack: the same 18+ question as the drinking games, once per phone.
        if (voksen(id) && !R.felles.over18) {
          const fortsatt = R.vakt();
          const ja = await R.bekreft(R.t("Er du 18 år eller eldre?"), R.t("«{pakke}» har litt drøyere humor og er bare for voksne.", { pakke: pakke(id).navn }), R.t("Ja, jeg er 18 eller eldre"), R.t("Nei"));
          if (!ja || !fortsatt()) return;
          R.lagreFelles({ over18: true });
          R.statistikk("alder18");
        }
        S.oppsett.pakke = id;
        R.vis();
      },
      kat(el, e, S) {
        const n = Number(el.dataset.v);
        if (KATEGORIER.includes(n)) S.oppsett.kat = n;
        R.vis();
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if (RUNDER.includes(n)) S.oppsett.runder = n;
        R.vis();
      },
      tid(el, e, S) {
        const n = Number(el.dataset.v);
        if (TIDER.includes(n)) S.oppsett.tid = n;
        R.vis();
      },
      ekstra(el, e, S) {
        S.oppsett.ekstra = !S.oppsett.ekstra && EKSTRA_FINNES;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("klar");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("klar");
      },
      trekk(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.modus !== "en" || !trekk(sp)) return;
        R.gaTil("skriv");
      },
      stopp(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.modus !== "en" || !siStopp(sp)) return;
        const t = R.timer("fl-tid");
        if (t) t.stopp();
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
        R.vis();
        startKlokker(S);
      },
      ferdige(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.modus !== "en" || !blyanterNed(sp)) return;
        R.lyd.pling();
        R.gaTil("dom");
      },
      poeng(el, e, S) {
        const sp = S.spill;
        const [i, p] = String(el.dataset.v).split(":").map(Number);
        if (!pagar(S) || sp.modus !== "en" || !settPoeng(sp, i, p)) return;
        R.vis();
      },
      "kat-forrige"(el, e, S) {
        const sp = S.spill;
        if (pagar(S) && sp.modus === "en" && katForrige(sp)) R.gaTil("dom");
      },
      "kat-neste"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.modus !== "en") return;
        const hvor = katNeste(sp);
        if (hvor === "mangler") {
          const uten = sp.r.score.map((rad, i) => (rad[sp.r.nr] == null ? i : -1)).filter((i) => i >= 0);
          R.vis();
          R.lyd.tikk();
          R.vibrer(30);
          R.si(R.t("Mangler poeng for {navn}.", { navn: R.ramsOpp(uten.map((i) => R.navn(i))) }));
          return;
        }
        if (hvor === "dom") return R.gaTil("dom");
        if (hvor === "ferdig") {
          R.lyd.riktig();
          R.gaTil("stilling");
        }
      },
      // Undo the round's points and go back to the last category (until the next round starts).
      "endre-poeng"(el, e, S) {
        const sp = S.spill;
        if (pagar(S) && sp.modus === "en" && endrePoeng(sp)) R.gaTil("dom");
      },
      "neste-runde"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.modus !== "en") return;
        const hvor = nesteRunde(sp, pakke(sp.pakke));
        if (hvor === "slutt") {
          fullfor(S);
          return R.gaTil("slutt");
        }
        if (hvor === "klar") R.gaTil("klar");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = sp.spilt === 0;
        const t = R.timer("fl-tid");
        const n = R.timer("fl-ned");
        for (const x of [t, n]) if (x) x.pause();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ingenting ? R.t("Ingen runde er ferdig ennå. Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen. Den som har flest poeng nå, vinner."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || S.spill !== sp) return;
        if (!ja) {
          for (const x of [t, n]) if (x) x.fortsett();
          return;
        }
        if (ingenting) {
          S.spill = null;
          return R.gaTil("hjem");
        }
        // A round that was being scored is not counted.
        if (sp.r && sp.r.fase !== "ferdig") sp.r = null;
        fullfor(S);
        R.gaTil("slutt");
      },
    }),
  });
})();
