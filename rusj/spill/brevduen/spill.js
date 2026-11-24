/* Brevduen — «Hvem skrev det?». The pigeon brings a question; the phone goes round and everyone
   writes a short answer in secret. Then the phone shows the answers one at a time in a shuffled
   order: someone reads it out, everyone points at once at who they think wrote it, and the phone
   reveals the author. Everyone who pointed right gets 1 point; the author gets 1 point for every
   player fooled. Kåringen after the last round.
   Privacy: the answers only live on this phone, in the saved state of the round that is being
   played (so a reload mid-round keeps them). Each answer is wiped as soon as the next one is
   shown, and the whole round is wiped when it ends. Answers are never counted or sent anywhere.
   The rules at the top are pure; test/brevduen.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- The rules (no kit needed) ----------

  const RUNDER = [3, 5, 7];
  const MAKS = 80; // characters in an answer
  const POENG_RIKTIG = 1; // to each player who pointed at the author
  const POENG_LURT = 1; // to the author, for each player fooled
  const FASER = ["sporsmal", "gi", "skriv", "les", "hvem", "fasit"];

  const range = (n) => Array.from({ length: n }, (_, i) => i);
  // An answer as it is kept: one line, no spaces at the ends, at most MAKS characters (never half
  // of an emoji). An answer with nothing left is empty ("").
  function rens(tekst) {
    const t = String(tekst == null ? "" : tekst).replace(/\s+/g, " ").trim();
    return Array.from(t).slice(0, MAKS).join("").trim();
  }
  // Fisher–Yates with the given random source.
  function stokk(liste, rng) {
    const l = liste.slice();
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  }

  // A fresh round: question k, writing starts with the player after last round's first.
  function nyRunde(runde, antall, k) {
    return { k, start: runde % antall, na: 0, svar: Array(antall).fill(null), rekke: [], vis: 0, pekt: [], siste: null };
  }
  function ny(antall, runder, k) {
    return {
      antall,
      runder,
      runde: 0, // rounds finished
      fase: "sporsmal",
      poeng: Array(antall).fill(0),
      lurt: Array(antall).fill(0), // players each one fooled, in all
      vist: 0, // answers scored, in all
      r: nyRunde(0, antall, k),
      ferdig: false,
    };
  }
  // Whose turn it is to write.
  const skriver = (sp) => (sp.r.start + sp.r.na) % sp.antall;
  // The author of the answer on the screen.
  const forfatter = (sp) => sp.r.rekke[sp.r.vis];

  // Another question, only before anyone has written.
  function byttSporsmal(sp, k) {
    if (!["sporsmal", "gi"].includes(sp.fase) || sp.r.na > 0) return false;
    sp.r.k = k;
    return true;
  }
  // The question has been read out: the phone goes round.
  function begynn(sp) {
    if (sp.fase !== "sporsmal") return false;
    sp.fase = "gi";
    return true;
  }
  // «Jeg er X»: the writer has the phone.
  function jegEr(sp) {
    if (sp.fase !== "gi") return false;
    sp.fase = "skriv";
    return true;
  }
  // The writer is done. "tom" for an empty answer; then "gi" (next writer) or "les" (all done:
  // the answers in a shuffled order).
  function skriv(sp, tekst, rng) {
    if (sp.fase !== "skriv") return null;
    const t = rens(tekst);
    if (!t) return "tom";
    const r = sp.r;
    r.svar[skriver(sp)] = t;
    r.na += 1;
    if (r.na < sp.antall) {
      sp.fase = "gi";
      return "gi";
    }
    r.rekke = stokk(range(sp.antall), rng);
    r.vis = 0;
    r.pekt = [];
    sp.fase = "les";
    return "les";
  }
  // Everyone has pointed: the phone shows who wrote it.
  function avslor(sp) {
    if (sp.fase !== "les") return false;
    sp.fase = "hvem";
    sp.r.pekt = [];
    return true;
  }
  // riktige = the players who pointed at the author (the author is never one of them).
  function avgjor(sp, riktige) {
    if (sp.fase !== "hvem") return null;
    const a = forfatter(sp);
    const liste = [...new Set((riktige || []).filter((i) => Number.isInteger(i) && i >= 0 && i < sp.antall && i !== a))].sort((x, y) => x - y);
    const lurte = sp.antall - 1 - liste.length;
    const pluss = Array(sp.antall).fill(0);
    for (const i of liste) pluss[i] = POENG_RIKTIG;
    pluss[a] = lurte * POENG_LURT;
    pluss.forEach((p, i) => (sp.poeng[i] += p));
    sp.lurt[a] += lurte;
    sp.vist += 1;
    sp.r.pekt = liste;
    sp.r.siste = { forfatter: a, riktige: liste, lurte, pluss };
    sp.fase = "fasit";
    return sp.r.siste;
  }
  // Take the last result back and choose who pointed right again.
  function angre(sp) {
    const s = sp.r && sp.r.siste;
    if (sp.fase !== "fasit" || !s) return false;
    s.pluss.forEach((p, i) => (sp.poeng[i] -= p));
    sp.lurt[s.forfatter] -= s.lurte;
    sp.vist -= 1;
    sp.r.siste = null;
    sp.fase = "hvem";
    return true;
  }
  // On to the next answer (the one just shown is wiped), a new round (all answers wiped) or the end.
  // nyK gives the next round's question.
  function neste(sp, nyK) {
    if (sp.fase !== "fasit") return null;
    const r = sp.r;
    r.svar[forfatter(sp)] = null;
    r.siste = null;
    r.pekt = [];
    if (r.vis + 1 < r.rekke.length) {
      r.vis += 1;
      sp.fase = "les";
      return "les";
    }
    sp.runde += 1;
    if (sp.runde >= sp.runder) {
      sp.r = null;
      sp.ferdig = true;
      return "slutt";
    }
    sp.r = nyRunde(sp.runde, sp.antall, nyK());
    sp.fase = "sporsmal";
    return "sporsmal";
  }
  // The answers still on this phone (for tests: wiped answers are null).
  const igjen = (sp) => (sp.r ? sp.r.svar.filter((t) => t != null).length : 0);

  const R = window.Rusj;
  if (!R) {
    window.Brevduen = { RUNDER, MAKS, POENG_RIKTIG, POENG_LURT, FASER, rens, stokk, ny, nyRunde, skriver, forfatter, byttSporsmal, begynn, jegEr, skriv, avslor, avgjor, angre, neste, igjen };
    return;
  }

  // ---------- The game ----------

  const D = window.RUSJ_DATA;
  const FAMILIE = D.familie;
  const VOKSEN = D.voksen || [];
  const ALLE = FAMILIE.concat(VOKSEN);
  const esc = R.esc;
  const deck = R.kortstokk("sporsmal", ALLE.length);
  const MIN = 3;
  const MAKS_SPILLERE = 12;

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  let H; // the actions, so one action can reuse another
  let teller = false; // the 3-2-1 countdown is running
  let feire = false; // Kåringen was just reached (not a reload)

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS_SPILLERE);
  }
  // The next question from the deck (no repeats until the deck is used up).
  function trekk(voksen, unntatt) {
    const ok = (i) => (voksen || i < FAMILIE.length) && i !== unntatt;
    let k = deck.neste(ok);
    if (k < 0 || !ALLE[k]) k = R.heltall(0, FAMILIE.length - 1);
    return k;
  }

  // (On the net a seat that left is not ranked; off the net nobody leaves.)
  const rader = (sp, medPluss) => sp.poeng.map((poeng, i) => ({ i, poeng, ...(medPluss && sp.r && sp.r.siste && sp.r.siste.pluss[i] ? { pluss: sp.r.siste.pluss[i] } : {}) })).filter((x) => !ute(sp, x.i));
  const toppen = (sp) => {
    const med = range(sp.antall).filter((i) => !ute(sp, i));
    const best = Math.max(...med.map((i) => sp.poeng[i]));
    return best > 0 ? med.filter((i) => sp.poeng[i] === best) : [];
  };
  const tittel = (S) => (S.spill ? R.t("Runde {n} av {m}", { n: Math.min(S.spill.runde + 1, S.spill.runder), m: S.spill.runder }) : "");

  // Once per game, when it is over: the answers are wiped, statistics (numbers only) and the
  // evening's scoreboard.
  function fullfor(S) {
    const sp = S.spill;
    if (!sp || sp.feiret) return;
    sp.r = null;
    sp.ferdig = true;
    sp.feiret = true;
    feire = true;
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.runde, avbrutt: sp.runde < sp.runder });
    if (sp.vist > 0) R.kveld.registrer(rader(sp));
  }

  // The letter the pigeon brings: the question on paper.
  const brev = (k, kompakt) => `
    <div class="bd-brev${kompakt ? " kompakt" : ""}">
      <span class="bd-stempel" aria-hidden="true">✉️</span>
      <p class="bd-brev-tekst">${esc(ALLE[k])}</p>
    </div>`;

  const avslutt = () => R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt"));

  // ---------- On the net (R.nett, rusj/kit/nett.js) ----------
  // Every player on their own phone, 3–12. The moves:
  //   { svar: "…", k }  my answer to question k (cleaned with R.nett.tekst before it is sent and
  //                     again when it is played: a modified phone could send anything);
  //   { bytt: 1 }       the round's leader takes another question, before anyone has answered;
  //   { pek: i, v }     my guess at who wrote answer v of the round – never myself. The author
  //                     guesses too, at someone else, so the screens can't tell who it is;
  //   { neste: steg }   the round's leader goes on: the next answer, the next round, «Kåringen».
  // Anything else, or anything the rules don't allow now, is ignored on every phone. The questions
  // come from the room's seed, the order of the answers from okt.rng of the move that completed
  // them. The leader moves one seat per round (and per match). A seat that left is never waited
  // for, its answers that are not shown yet go, and it is not ranked.
  // Friends level: an answer is a move from its seat in the room's list (kept in the room, deleted
  // with it, at the latest after 24 hours). The screens show no answer before everyone still in has
  // written and no author before everyone has guessed, but a modified phone could read the list.
  const NETT_MAKS = 60; // characters in an answer on the net (R.nett.tekst)
  // An answer on the net needs at least one sign one can see (not only blank-looking signs).
  const synlig = (s) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(s);
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
  const harAlle = (sp, liste) => R.nett.alleHar(liste, sp.antall);
  // My answer or guess on its way: { nokkel, t, ved }. When another move got the place first, the
  // room drops mine; it is sent again once per move that came in between (ved: the moves played
  // when it was last sent) – never on a timer. Dropped for another reason (a lost line, «fort»):
  // the field comes back with the text in it.
  let venterSvar = null;
  let antallTrekk = 0; // moves played on this phone in this match
  let utkast = { nokkel: "", tekst: "" }; // what I have typed so far (a redraw keeps it)
  let tegnes = false; // a live move changed the state: etter() draws
  let vistFase = ""; // the phase this phone's screen shows (a new one is drawn as a new screen)

  function nettSporsmal(sp) {
    const k = sp.stokk[sp.pos % sp.stokk.length];
    sp.pos += 1;
    return k;
  }
  function nettRunde(sp) {
    sp.r = { k: nettSporsmal(sp), leder: forsteInne(sp, (sp.forste + sp.runde) % sp.antall), svar: Array(sp.antall).fill(null), rekke: [], vis: 0, pek: Array(sp.antall).fill(null), siste: null };
    sp.fase = "skriv";
  }
  // The round is over: the next one, or the end of the match.
  function nettRundeSlutt(sp) {
    sp.runde += 1;
    if (sp.runde >= sp.runder) sp.ferdig = true;
    else nettRunde(sp);
  }
  // Everyone still in has written: the answers in an order from the room's chance.
  function nettTilPek(sp, rng) {
    const r = sp.r;
    r.rekke = stokk(inne(sp).filter((i) => r.svar[i] != null), rng);
    r.vis = 0;
    r.pek = Array(sp.antall).fill(null);
    if (r.rekke.length) sp.fase = "pek";
    else nettRundeSlutt(sp);
  }
  // Everyone still in has guessed: the author, and the points.
  function nettAvgjor(sp) {
    const r = sp.r;
    const a = r.rekke[r.vis];
    const andre = inne(sp).filter((i) => i !== a);
    const riktige = andre.filter((i) => r.pek[i] === a);
    const lurte = andre.length - riktige.length;
    const pluss = Array(sp.antall).fill(0);
    for (const i of riktige) pluss[i] = POENG_RIKTIG;
    pluss[a] = lurte * POENG_LURT;
    pluss.forEach((p, i) => (sp.poeng[i] += p));
    sp.lurt[a] += lurte;
    sp.vist += 1;
    r.siste = { forfatter: a, riktige, lurte, pluss, av: andre.length };
    sp.fase = "fasit";
  }
  function nettNeste(sp) {
    const r = sp.r;
    if (r.vis + 1 < r.rekke.length) {
      r.vis += 1;
      r.pek = Array(sp.antall).fill(null);
      r.siste = null;
      sp.fase = "pek";
    } else nettRundeSlutt(sp);
  }

  // What this phone is to do now ("" = nothing): my answer, or my guess at this answer.
  function minOppgave(sp) {
    const i = meg();
    if (!paNett(sp) || sp.ferdig || i < 0 || ute(sp, i)) return "";
    const r = sp.r;
    if (sp.fase === "skriv" && r.svar[i] == null) return `skriv:${sp.runde}:${r.k}`;
    if (sp.fase === "pek" && r.pek[i] == null) return `pek:${sp.runde}:${r.vis}`;
    return "";
  }
  const kanSvare = (sp) => !!minOppgave(sp) && !(venterSvar && venterSvar.nokkel === minOppgave(sp) && R.nett.venter());
  function sendSvar(sp, t) {
    const nokkel = minOppgave(sp);
    if (!nokkel || !kanSvare(sp) || !R.nett.send(t)) return;
    venterSvar = { nokkel, t, ved: antallTrekk };
    R.vis();
  }
  function tellerTekst(sp) {
    const liste = sp.fase === "skriv" ? sp.r.svar : sp.r.pek;
    const med = inne(sp);
    const v = { n: med.filter((i) => liste[i] != null).length, m: med.length };
    return sp.fase === "skriv" ? R.t("{n} av {m} har skrevet", v) : R.t("{n} av {m} har pekt", v);
  }
  const fasenokkel = (sp) => (sp.ferdig ? "slutt" : `${sp.fase}:${sp.runde}:${sp.r.vis}`);
  // After a live move: a new phase is a new screen; else the same one again – or, while this phone
  // is typing, only the count (the field is left as it is).
  function nettTegn(S) {
    const sp = S.spill;
    if (R.S !== S || !S.skjerm || S.skjerm === "nett" || !paNett(sp)) return;
    const mal = NETT.skjerm(S);
    if (S.skjerm !== mal || fasenokkel(sp) !== vistFase) {
      if (sp.ferdig) feire = true;
      else if (sp.fase === "pek") R.lyd.pling();
      else if (sp.fase === "fasit") {
        const s = sp.r.siste;
        if (!s.riktige.length) R.lyd.fanfare();
        else if (!s.lurte) R.lyd.buu();
        else R.lyd.pling();
      }
      return R.gaTil(mal);
    }
    const skjema = R.$("#skjerm [data-nett-skjema]");
    const teller = R.$("#skjerm [data-nett-teller]");
    if (skjema && teller && kanSvare(sp) && skjema.dataset.nettSkjema === minOppgave(sp)) {
      teller.textContent = tellerTekst(sp);
      return;
    }
    R.vis();
  }

  const NETT = {
    min: MIN,
    maks: MAKS_SPILLERE,
    oppsett: (S) => ({ runder: S.runder, voksen: S.voksen === true }),
    oppsettTekst: (o) => {
      const x = o || {};
      return [R.flertall(RUNDER.includes(x.runder) ? x.runder : 3, "runde", "runder"), x.voksen === true ? R.t("Voksen 🍷") : ""].filter(Boolean).join(" · ");
    },
    start(S, okt) {
      const o = okt.oppsett || {};
      const n = R.klamp(okt.antall || MIN, MIN, MAKS_SPILLERE);
      const voksen = o.voksen === true;
      const sp = Object.assign(ny(n, RUNDER.includes(o.runder) ? o.runder : 3, 0), {
        modus: "nett",
        voksen,
        ute: [],
        forste: (okt.kamp - 1) % n, // the first round's leader: one seat on per match
        steg: 0,
        // The questions the host's setting allows, in the room's order (no repeats in a match).
        stokk: stokk(range(voksen ? ALLE.length : FAMILIE.length), R.nett.tilfeldig(okt.fro, "sporsmal")),
        pos: 0,
      });
      nettRunde(sp);
      S.spill = sp;
      feire = false;
      venterSvar = null;
      antallTrekk = 0;
      utkast = { nokkel: "", tekst: "" };
      tegnes = false;
      vistFase = "";
    },
    trekk(S, t, sete, okt) {
      const sp = S.spill;
      antallTrekk += 1;
      // My own move came back (played or not): it is not on its way any more.
      if (venterSvar && sete === meg() && JSON.stringify(t) === JSON.stringify(venterSvar.t)) {
        venterSvar = null;
        if (!okt.gjenspill) tegnes = true;
      }
      if (!paNett(sp) || sp.ferdig || !t || typeof t !== "object" || !(sete >= 0 && sete < sp.antall) || ute(sp, sete)) return;
      const r = sp.r;
      if (sp.fase === "skriv" && typeof t.svar === "string") {
        const tekst = R.nett.tekst(t.svar, NETT_MAKS);
        if (t.k !== r.k || r.svar[sete] != null || !tekst || !synlig(tekst)) return;
        r.svar[sete] = tekst;
        if (harAlle(sp, r.svar)) nettTilPek(sp, okt.rng);
      } else if (sp.fase === "skriv" && t.bytt === 1) {
        if (sete !== r.leder || r.svar.some((x) => x != null)) return;
        r.k = nettSporsmal(sp);
      } else if (sp.fase === "pek" && Number.isInteger(t.pek)) {
        if (t.v !== r.vis || r.pek[sete] != null || t.pek === sete || t.pek < 0 || t.pek >= sp.antall || ute(sp, t.pek)) return;
        r.pek[sete] = t.pek;
        if (harAlle(sp, r.pek)) nettAvgjor(sp);
      } else if (sp.fase === "fasit" && Number.isInteger(t.neste)) {
        if (t.neste !== sp.steg || sete !== r.leder) return;
        sp.steg += 1;
        nettNeste(sp);
      } else return;
      if (!okt.gjenspill) tegnes = true;
    },
    // The seat left: never waited for again, its answers that are not shown yet go (the one being
    // guessed too: the next answer comes up), the next seat leads if it led, and it is not ranked.
    borte(S, sete, okt) {
      const sp = S.spill;
      antallTrekk += 1;
      if (!paNett(sp) || sp.ferdig || !(sete >= 0 && sete < sp.antall) || ute(sp, sete)) return;
      sp.ute.push(sete);
      const r = sp.r;
      if (inne(sp).length < MIN) sp.ferdig = true; // (the room ends the match before this happens)
      else {
        if (r.leder === sete) r.leder = forsteInne(sp, sete);
        if (sp.fase === "skriv") {
          r.svar[sete] = null;
          if (r.svar.some((x) => x != null) && harAlle(sp, r.svar)) nettTilPek(sp, okt.rng);
        } else {
          const varNa = sp.fase === "pek" && r.rekke[r.vis] === sete;
          r.rekke = r.rekke.filter((x, k) => x !== sete || k < r.vis || (k === r.vis && !varNa));
          if (varNa) {
            if (r.vis < r.rekke.length) r.pek = Array(sp.antall).fill(null);
            else nettRundeSlutt(sp);
          } else if (sp.fase === "pek" && harAlle(sp, r.pek)) nettAvgjor(sp);
        }
      }
      if (!okt.gjenspill) tegnes = true;
    },
    skjerm(S) {
      const sp = S.spill;
      if (!sp || sp.ferdig) return "slutt";
      return { pek: "n-pek", fasit: "n-fasit" }[sp.fase] || "n-skriv";
    },
    // Writing and guessing: my turn while I haven't, else the first one still to; the leader after a reveal.
    tur(S) {
      const sp = S.spill;
      if (!paNett(sp) || sp.ferdig) return null;
      const r = sp.r;
      if (sp.fase === "fasit") return r.leder;
      const liste = sp.fase === "skriv" ? r.svar : r.pek;
      if (minOppgave(sp)) return meg();
      for (let k = 0; k < sp.antall; k++) {
        const i = (r.leder + k) % sp.antall;
        if (!ute(sp, i) && liste[i] == null) return i;
      }
      return null;
    },
    ferdig: (S) => !!S.spill && !!S.spill.ferdig,
    // After every live move, a replay or a move the room dropped: my answer again if another move
    // got its place, then the screen.
    etter(S) {
      const sp = S.spill;
      if (!paNett(sp)) return;
      if (venterSvar) {
        if (venterSvar.nokkel !== minOppgave(sp)) venterSvar = null;
        else if (antallTrekk > venterSvar.ved && !R.nett.venter() && R.nett.send(venterSvar.t)) venterSvar.ved = antallTrekk;
      }
      if (tegnes) {
        tegnes = false;
        nettTegn(S);
      }
    },
  };

  R.start({
    id: "brevduen",
    versjon: 1,
    pagar,
    nett: NETT,

    tilstand: () => ({
      antall: standardAntall(),
      runder: 3,
      voksen: false,
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS_SPILLERE);
      if (!RUNDER.includes(S.runder)) S.runder = 3;
      S.voksen = S.voksen === true;
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const tall = (l) => Array.isArray(l) && l.length === n && l.every((x) => Number.isInteger(x));
        let ok =
          Number.isInteger(n) && n >= MIN && n <= MAKS_SPILLERE &&
          RUNDER.includes(sp.runder) && Number.isInteger(sp.runde) && sp.runde >= 0 && sp.runde <= sp.runder &&
          FASER.includes(sp.fase) && tall(sp.poeng) && tall(sp.lurt) && Number.isInteger(sp.vist);
        if (ok && sp.ferdig) sp.r = null;
        else if (ok) {
          const r = sp.r;
          const tekst = (t) => t === null || (typeof t === "string" && t.length > 0 && Array.from(t).length <= MAKS);
          ok =
            !!r && !!ALLE[r.k] && spiller(r.start) && Number.isInteger(r.na) && r.na >= 0 && r.na <= n &&
            Array.isArray(r.svar) && r.svar.length === n && r.svar.every(tekst) &&
            Array.isArray(r.pekt) && r.pekt.every(spiller) && Number.isInteger(r.vis);
          if (ok && ["sporsmal", "gi", "skriv"].includes(sp.fase)) ok = r.na < n && r.svar.filter((t) => t != null).length === r.na;
          if (ok && ["les", "hvem", "fasit"].includes(sp.fase))
            ok = r.na === n && Array.isArray(r.rekke) && r.rekke.length === n && new Set(r.rekke).size === n && r.rekke.every(spiller) && r.vis >= 0 && r.vis < n && typeof r.svar[r.rekke[r.vis]] === "string";
          if (ok && sp.fase === "fasit") ok = !!r.siste && Array.isArray(r.siste.pluss) && r.siste.pluss.length === n && r.siste.forfatter === r.rekke[r.vis];
        }
        if (!ok) S.spill = null;
      }
      // Never back on the writing screen after a reload: give the phone to the same player again.
      if (pagar(S) && S.spill.fase === "skriv") S.spill.fase = "gi";
      if (FASER.includes(S.skjerm)) S.skjerm = pagar(S) ? S.spill.fase : "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    // (a getter: on the net the answers do leave the phone, and the last tip says so)
    get regler() {
      return {
        intro: R.t("Brevduen kommer med et spørsmål. Alle svarer i hemmelighet – så gjelder det å gjette hvem som skrev hva."),
        steg: [
          [R.t("Les spørsmålet"), R.t("Én leser spørsmålet høyt. Så går mobilen rundt, og hver av dere skriver et kort svar mens de andre ser bort.")],
          [R.t("Pek samtidig"), R.t("Mobilen viser svarene ett for ett i tilfeldig rekkefølge. Én leser svaret høyt, dere teller ned, og alle peker på den de tror skrev det.")],
          [R.t("Poeng"), R.t("Mobilen viser hvem som skrev svaret. Pekte du riktig, får du 1 poeng. Den som skrev svaret, får 1 poeng for hver hen lurte.")],
        ],
        tips: [
          R.t("Skriv som deg selv – eller som noen andre. Det er lov å lure!"),
          R.t("Den som skrev svaret, peker også – gjerne på noen andre."),
          R.paNett && R.paNett() === true
            ? R.t("På nett går svarene gjennom rommet til de andre mobilene. Rommet slettes senest et døgn etter siste trekk.")
            : R.t("Svarene blir bare på denne mobilen. De sendes ingen steder og slettes når dere går videre."),
        ],
      };
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Alle svarer i hemmelighet."))}<br><em>${esc(R.t("Hvem skrev det?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }) : "",
              ekstraHtml: (R.nett ? R.nett.knapp() : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              [`${MIN}–${MAKS_SPILLERE}`, R.t("spillere")],
              [String(ALLE.length), R.t("spørsmål")],
              ["1", R.t("mobil")],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.spillere({ min: MIN, max: MAKS_SPILLERE, hjelp: R.t("Mobilen går rundt i samme rekkefølge som lista.") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Runder"))}</h2></div>
              ${R.ui.seg("runder", RUNDER.map((n) => [String(n), String(n)]), String(S.runder))}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Spørsmål"))}</h2></div>
              ${R.ui.bryter("voksen", S.voksen, R.t("Voksen 🍷"), R.t("Også spørsmål for julebord og vors (18+)"))}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      // Everyone: the pigeon brings the question.
      sporsmal: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="bd-due">
              ${R.figur()}
              <div>
                <p class="etikett">${esc(R.t("Brevduen har med seg et spørsmål"))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("Les det høyt!"))}</h1>
              </div>
            </div>
            ${brev(sp.r.k)}
            <p class="hjelp bd-hjelp">${esc(R.t("Så går mobilen rundt, og alle skriver et svar i hemmelighet."))}</p>
            ${R.ui.dokk(
              R.ui.knapp2(R.t("Nytt spørsmål"), "bytt", { ikon: "🕊️" }),
              R.ui.knapp(R.t("Send mobilen rundt"), "begynn"),
              avslutt(),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      // «Gi mobilen til …»
      gi: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return R.ui.giTil({
            i: skriver(sp),
            h: "jeg-er",
            advarsel: R.t("De andre ser bort mens du skriver"),
            prikker: [sp.antall, sp.r.na],
          });
        },
        inn: () => R.holdVaken(),
      },

      // Private: the player writes an answer.
      skriv: {
        tittel: R.t("Hemmelig"),
        tilbake: "hjem",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const i = skriver(sp);
          const navn = R.navn(i);
          const sist = sp.r.na + 1 >= sp.antall;
          return `
            <form class="bd-skriv" data-skjema="svar" data-hemmelig autocomplete="off" novalidate>
              <div class="bd-topp">
                ${R.avatar(i, "mid")}
                <div><p class="etikett">🤫 ${esc(R.t("Bare {navn} ser dette", { navn }))}</p><h1 id="skjerm-tittel">${esc(R.t("Skriv svaret ditt"))}</h1></div>
              </div>
              ${brev(sp.r.k, true)}
              <label class="bd-felt" for="bd-felt">
                <span class="vh">${esc(R.t("Svaret til {navn}", { navn }))}</span>
                <textarea id="bd-felt" class="tekstfelt" name="svar-${sp.runde}-${sp.r.na}" rows="2" maxlength="${MAKS}" placeholder="${esc(R.t("Skriv et kort svar …"))}" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" aria-describedby="bd-feil bd-igjen"></textarea>
              </label>
              <p class="bd-teller" id="bd-igjen" aria-hidden="true">0/${MAKS}</p>
              <p class="feil" id="bd-feil" aria-live="assertive"></p>
              ${R.ui.dokk(`<button class="knapp" type="submit" id="bd-ferdig">${esc(sist ? R.t("Ferdig – alle har svart") : R.t("Ferdig – gi mobilen videre"))}</button>`)}
            </form>`;
        },
        inn() {
          const f = R.$("#bd-felt");
          if (!f) return;
          try {
            f.focus({ preventScroll: true });
          } catch (e) {
            f.focus();
          }
        },
        etter(S, rot) {
          const f = rot.querySelector("#bd-felt");
          if (!f || f.dataset.koblet) return;
          f.dataset.koblet = "1";
          f.addEventListener("input", () => {
            const t = R.$("#bd-igjen");
            if (t) t.textContent = `${Array.from(f.value).length}/${MAKS}`;
            f.removeAttribute("aria-invalid");
            const feil = R.$("#bd-feil");
            if (feil && feil.textContent) feil.textContent = "";
          });
          // Enter sends the answer (an answer is one line).
          f.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              const form = f.form;
              if (form && form.requestSubmit) form.requestSubmit();
            }
          });
        },
      },

      // Everyone: one answer, then point.
      les: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          return `
            <h1 id="skjerm-tittel" class="bd-h1">${esc(R.t("Hvem skrev det?"))}</h1>
            <p class="bd-sporsmal">${esc(ALLE[r.k])}</p>
            <div class="bd-kort">${R.ui.storkort({ tekst: r.svar[forfatter(sp)], etikett: R.t("Svar {n} av {m}", { n: r.vis + 1, m: sp.antall }), klasse: "bd-svar", kompakt: true })}</div>
            <p class="hjelp bd-hjelp">${esc(r.vis === 0 ? R.t("Legg mobilen midt på bordet. Én leser svaret høyt – så peker alle samtidig.") : R.t("Les svaret høyt. Så peker alle samtidig – også den som skrev det."))}</p>
            ${R.ui.dokk(R.ui.knapp2(R.t("3 · 2 · 1 – Pek!"), "pek", { ikon: "👉" }), R.ui.knapp(R.t("Vis hvem som skrev det"), "avslor", { variant: "rosa" }), avslutt())}`;
        },
        inn: () => R.holdVaken(),
      },

      // Everyone: the author is revealed; who pointed right?
      hvem: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const a = forfatter(sp);
          const navn = R.navn(a);
          const andre = range(sp.antall).filter((i) => i !== a);
          return `
            ${R.ui.banner({ etikett: R.t("Skrevet av"), tittel: navn, tekst: R.t("«{svar}»", { svar: sp.r.svar[a] }), klasse: "aksent bd-banner", stemning: "jubel" })}
            <section class="seksjon">
              <h2>${esc(R.t("Hvem pekte på {navn}?", { navn }))}</h2>
              ${R.ui.velgere("pekt", andre, sp.r.pekt)}
              <p class="hjelp">${esc(R.t("Trykk på alle som pekte riktig."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(sp.r.pekt.length ? R.t("Gi poeng") : R.t("Ingen pekte riktig"), "gi-poeng", { variant: "rosa" }))}`;
        },
      },

      // Everyone: the points for this answer.
      fasit: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const s = sp.r.siste;
          const navn = R.navn(s.forfatter);
          const sisteSvar = sp.r.vis + 1 >= sp.r.rekke.length;
          const sisteRunde = sp.runde + 1 >= sp.runder;
          const poeng = R.flertall(s.pluss[s.forfatter], "poeng", "poeng");
          const banner = !s.riktige.length
            ? R.ui.banner({ etikett: R.t("Ingen gjettet {navn}!", { navn }), tittel: R.t("{navn} lurte alle!", { navn }), tekst: R.t("{poeng} til {navn}.", { poeng, navn }), klasse: "aksent", stemning: "jubel" })
            : !s.lurte
              ? R.ui.banner({ etikett: R.t("Avslørt!"), tittel: R.t("Alle gjettet {navn}!", { navn }), tekst: R.t("1 poeng til alle som pekte riktig."), klasse: "aksent", stemning: "lei" })
              : R.ui.banner({ etikett: R.t("Det var {navn}", { navn }), tittel: R.t("{navn} lurte {n} av {m}", { navn, n: s.lurte, m: sp.antall - 1 }), tekst: R.t("{poeng} til {navn}, og 1 poeng til hver som pekte riktig.", { poeng, navn }), klasse: "aksent", stemning: "" });
          const knapp = !sisteSvar ? R.t("Neste svar") : sisteRunde ? R.t("Til kåringen") : R.t("Neste runde");
          return `
            ${banner}
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${R.ui.dokk(R.ui.knapp(knapp, "neste"), R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          const s = S.spill.r && S.spill.r.siste;
          if (s && !s.riktige.length) R.konfetti(["--rosa", "--lampe", "--aksent"]);
        },
      },

      // On the net: the question, and my answer on my own phone. Nobody else's answer is on the page.
      "n-skriv": {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          vistFase = fasenokkel(sp);
          const oppgave = minOppgave(sp);
          const kan = kanSvare(sp);
          const bytte = R.nett.erMeg(r.leder) && r.svar.every((x) => x == null);
          return `
            <div class="bd-due">
              ${R.figur()}
              <div>
                <p class="etikett">${esc(R.t("Brevduen har med seg et spørsmål"))}</p>
                <h1 id="skjerm-tittel">${esc(kan ? R.t("Skriv svaret ditt") : R.t("Venter på de andre …"))}</h1>
              </div>
            </div>
            ${brev(r.k)}
            ${
              kan
                ? `<form class="bd-skriv" data-skjema="n-svar" data-nett-skjema="${esc(oppgave)}" autocomplete="off" novalidate>
                    <label class="vh" for="bd-nett-felt">${esc(R.t("Svaret ditt"))}</label>
                    <input id="bd-nett-felt" class="tekstfelt" data-felt="n-utkast" maxlength="${NETT_MAKS}" value="${esc(utkast.nokkel === oppgave ? utkast.tekst : "")}" placeholder="${esc(R.t("Skriv et kort svar …"))}" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="send" aria-describedby="bd-feil">
                    <p class="feil" id="bd-feil" aria-live="assertive"></p>
                    ${R.ui.dokk(`<button class="knapp" type="submit">${esc(R.t("Send svaret"))}</button>`, bytte ? R.ui.lenkerad(R.ui.lenke(R.t("Nytt spørsmål"), "n-bytt")) : "")}
                  </form>`
                : `<p class="papirboks bd-sendt">✓ ${esc(R.t("Svaret ditt er sendt."))}</p>`
            }
            <p class="hjelp bd-hjelp" data-nett-teller>${esc(tellerTekst(sp))}</p>`;
        },
        inn: () => R.holdVaken(),
      },

      // On the net: one answer, and everyone taps who they think wrote it.
      "n-pek": {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          vistFase = fasenokkel(sp);
          const jeg = meg();
          const eget = r.rekke[r.vis] === jeg;
          return `
            <h1 id="skjerm-tittel" class="bd-h1">${esc(R.t("Hvem skrev det?"))}</h1>
            <p class="bd-sporsmal">${esc(ALLE[r.k])}</p>
            <div class="bd-kort">${R.ui.storkort({ tekst: r.svar[r.rekke[r.vis]], etikett: R.t("Svar {n} av {m}", { n: r.vis + 1, m: r.rekke.length }), klasse: "bd-svar", kompakt: true })}</div>
            ${
              kanSvare(sp)
                ? `<section class="seksjon">
                    <h2>${esc(eget ? R.t("Ditt svar! Pek på en annen, så ingen skjønner det.") : R.t("Pek på den du tror skrev det"))}</h2>
                    ${R.ui.velgere("n-pek", inne(sp).filter((i) => i !== jeg), null)}
                  </section>`
                : `<p class="papirboks bd-sendt">✓ ${esc(R.t("Du har pekt."))}</p>`
            }
            <p class="hjelp bd-hjelp" data-nett-teller>${esc(tellerTekst(sp))}</p>`;
        },
        inn: () => R.holdVaken(),
      },

      // On the net: who wrote it, who guessed right, the points.
      "n-fasit": {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const s = r.siste;
          vistFase = fasenokkel(sp);
          const navn = R.navn(s.forfatter);
          const poeng = R.flertall(s.pluss[s.forfatter], "poeng", "poeng");
          const banner = !s.riktige.length
            ? R.ui.banner({ etikett: R.t("Ingen gjettet {navn}!", { navn }), tittel: R.t("{navn} lurte alle!", { navn }), tekst: R.t("{poeng} til {navn}.", { poeng, navn }), klasse: "aksent", stemning: "jubel" })
            : !s.lurte
              ? R.ui.banner({ etikett: R.t("Avslørt!"), tittel: R.t("Alle gjettet {navn}!", { navn }), tekst: R.t("1 poeng til alle som pekte riktig."), klasse: "aksent", stemning: "lei" })
              : R.ui.banner({ etikett: R.t("Det var {navn}", { navn }), tittel: R.t("{navn} lurte {n} av {m}", { navn, n: s.lurte, m: s.av }), tekst: R.t("{poeng} til {navn}, og 1 poeng til hver som pekte riktig.", { poeng, navn }), klasse: "aksent", stemning: "" });
          const knapp = r.vis + 1 < r.rekke.length ? R.t("Neste svar") : sp.runde + 1 >= sp.runder ? R.t("Til kåringen") : R.t("Neste runde");
          return `
            ${banner}
            <p class="papirboks bd-sitat">${esc(R.t("«{svar}»", { svar: r.svar[s.forfatter] }))}</p>
            ${s.riktige.length ? `<p class="hjelp bd-hjelp">${esc(R.t("Pekte riktig: {navn}", { navn: R.ramsOpp(s.riktige.map(R.navn)) }))}</p>` : ""}
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${R.nett.erMeg(r.leder) ? R.ui.dokk(R.ui.knapp(knapp, "n-neste")) : `<p class="hjelp bd-hjelp">${esc(R.t("{navn} går videre når dere er klare.", { navn: R.navn(r.leder) }))}</p>`}`;
        },
        inn(S) {
          const s = S.spill.r && S.spill.r.siste;
          if (s && !s.riktige.length) R.konfetti(["--rosa", "--lampe", "--aksent"]);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = toppen(sp);
          const banner = topp.length
            ? R.ui.banner({ tittel: R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(topp.map(R.navn)), n: topp.length }), tekst: R.t("{poeng} etter {svar}", { poeng: R.flertall(sp.poeng[topp[0]], "poeng", "poeng"), svar: R.flertall(sp.vist, "svar", "svar") }), klasse: "aksent" })
            : R.ui.banner({ tittel: R.t("Ingen poeng ennå"), tekst: R.t("Spill en runde, så blir det kåring!"), klasse: "aksent", stemning: "" });
          const med = range(sp.antall).filter((i) => !ute(sp, i));
          const mest = Math.max(...med.map((i) => sp.lurt[i]));
          const lurere = mest > 0 ? med.filter((i) => sp.lurt[i] === mest) : [];
          const ganger = R.flertall(mest, "gang", "ganger");
          const linje = !lurere.length
            ? R.t("Ingen klarte å lure de andre i kveld. Dere kjenner hverandre godt!")
            : lurere.length === 1
              ? R.t("Kveldens luring: {navn}, som lurte de andre {ganger}.", { navn: R.navn(lurere[0]), ganger })
              : R.t("Kveldens luringer: {navn}, som lurte de andre {ganger} hver.", { navn: R.ramsOpp(lurere.map(R.navn)), ganger });
          return `
            ${banner}
            ${topp.length ? R.ui.pall(rader(sp)) : ""}
            ${sp.vist ? R.ui.poengliste(rader(sp)) : ""}
            ${sp.vist ? `<p class="papirboks bd-luring">${esc(linje)}</p>` : ""}
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
          if (toppen(S.spill).length) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    skjema: {
      svar(S, form) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "skriv" || S.skjerm !== "skriv") return;
        const felt = form.querySelector("textarea");
        const hvor = skriv(sp, felt.value, Math.random);
        if (hvor === "tom") {
          R.$("#bd-feil").textContent = R.t("Skriv et svar først.");
          felt.classList.remove("risting");
          void felt.offsetWidth;
          felt.classList.add("risting");
          felt.setAttribute("aria-invalid", "true");
          felt.focus();
          R.lyd.feil();
          R.vibrer(60);
          return;
        }
        if (!hvor) return;
        felt.value = ""; // nothing of this answer is left on the page
        R.lyd.pop();
        R.vibrer(15);
        if (hvor === "les") {
          R.lyd.pling();
          R.gaTil("les");
          R.si(R.t("Alle har svart."));
          return;
        }
        R.gaTil("gi");
      },
      // On the net: my answer goes to the room (cleaned; the rules clean it again when it is played).
      "n-svar"(S, form) {
        const sp = S.spill;
        if (!paNett(sp) || sp.fase !== "skriv" || !kanSvare(sp)) return;
        const felt = form.querySelector("input");
        const tekst = R.nett.tekst(felt.value, NETT_MAKS);
        if (!tekst || !synlig(tekst)) {
          R.$("#bd-feil").textContent = R.t("Skriv et svar først.");
          felt.setAttribute("aria-invalid", "true");
          felt.focus();
          R.lyd.feil();
          return;
        }
        R.lyd.pop();
        sendSvar(sp, { svar: tekst, k: sp.r.k });
      },
    },

    felt: {
      "n-utkast"(S, el) {
        utkast = { nokkel: minOppgave(S.spill), tekst: el.value };
        el.removeAttribute("aria-invalid");
        const feil = R.$("#bd-feil");
        if (feil && feil.textContent) feil.textContent = "";
      },
    },

    handlinger: (H = {
      // ----- On the net -----
      "n-pek"(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!paNett(sp) || sp.fase !== "pek" || !Number.isInteger(i)) return;
        sendSvar(sp, { pek: i, v: sp.r.vis });
      },
      "n-neste"(el, e, S) {
        const sp = S.spill;
        if (paNett(sp) && sp.fase === "fasit" && R.nett.erMeg(sp.r.leder) && !R.nett.venter()) R.nett.send({ neste: sp.steg });
      },
      "n-bytt"(el, e, S) {
        const sp = S.spill;
        if (paNett(sp) && sp.fase === "skriv" && R.nett.erMeg(sp.r.leder) && !R.nett.venter()) R.nett.send({ bytt: 1 });
      },

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
        if (!pagar(S)) return;
        if (S.spill.fase === "skriv") S.spill.fase = "gi";
        R.gaTil(S.spill.fase);
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if (RUNDER.includes(n)) S.runder = n;
        R.vis();
      },
      voksen(el, e, S) {
        S.voksen = !S.voksen;
        R.vis();
      },
      start(el, e, S) {
        const antall = R.klamp(S.antall || 4, MIN, MAKS_SPILLERE);
        S.spill = ny(antall, S.runder, trekk(S.voksen));
        S.spill.voksen = S.voksen;
        R.statistikk("start", { spillere: antall, runder: S.runder, voksen: S.voksen });
        R.gaTil("sporsmal");
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !byttSporsmal(sp, trekk(sp.voksen, sp.r.k))) return;
        R.lyd.sveip();
        R.vis();
        R.si(ALLE[sp.r.k]);
      },
      begynn(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !begynn(sp)) return;
        R.gaTil("gi");
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !jegEr(sp)) return;
        R.gaTil("skriv");
      },
      async pek() {
        if (teller) return;
        teller = true;
        let ferdig = false;
        try {
          ferdig = await R.nedtelling(["3", "2", "1", R.t("PEK!")], 700);
        } finally {
          teller = false;
        }
        if (!ferdig) return; // the screen changed during the countdown
        R.lyd.pek();
        R.vibrer([60, 40, 120]);
      },
      async avslor(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "les") return;
        const fortsatt = R.vakt();
        R.lyd.trommevirvel(1);
        await R.vent(R.rolig() ? 200 : 800);
        if (!fortsatt() || S.spill !== sp || !avslor(sp)) return;
        R.lyd.fanfare();
        R.vibrer([40, 30, 90]);
        R.gaTil("hvem");
      },
      pekt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "hvem") return;
        const i = Number(el.dataset.v);
        if (!Number.isInteger(i) || i === forfatter(sp)) return;
        sp.r.pekt = sp.r.pekt.includes(i) ? sp.r.pekt.filter((x) => x !== i) : [...sp.r.pekt, i];
        R.vis();
      },
      "gi-poeng"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const s = avgjor(sp, sp.r.pekt);
        if (!s) return;
        if (!s.riktige.length) R.lyd.fanfare();
        else if (!s.lurte) R.lyd.buu();
        else R.lyd.pling();
        R.gaTil("fasit");
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !angre(sp)) return;
        R.toast(R.t("Angret – poengene er tatt bort"));
        R.gaTil("hvem");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const hvor = neste(sp, () => trekk(sp.voksen));
        if (!hvor) return;
        if (hvor === "slutt") {
          fullfor(S);
          R.gaTil("slutt");
          return;
        }
        if (hvor === "sporsmal") R.lyd.pling();
        R.gaTil(hvor);
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = sp.vist === 0;
        const ja = await R.bekreft(
          R.t("Avslutte spillet?"),
          ingenting ? R.t("Svarene som er skrevet, slettes. Dere kan alltid starte et nytt.") : R.t("Svarene som er skrevet, slettes, og dere går rett til kåringen."),
          R.t("Avslutt"),
          R.t("Spill videre"),
        );
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (sp.fase === "fasit" && sp.r.vis + 1 >= sp.r.rekke.length) sp.runde += 1; // the round was played to the end
        fullfor(S);
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
