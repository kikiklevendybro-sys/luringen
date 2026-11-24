/* Nissen — «Mandelen i grøten» (the almond in the Christmas porridge) as a bluffing game.
   Every round the phone goes round the table: each player holds a finger on the porridge bowl and
   sees, in secret, «Bare grøt» or «MANDELEN!». Exactly one gets the almond. Everyone has a real
   almond (or something as big) in hand: all turn away at once and pretend to pop it in their mouth, but only
   the almond holder really does. Then the elf (nissen)
   asks one player at a time something you have to say or do with your mouth, everybody points at
   once at whoever they think is hiding the almond, and the holder opens wide. Everyone who pointed
   at the holder gets 1 point (a wrong guess gives 0); the holder gets 1 point for every player
   fooled, and the marzipan pig for fooling them all. Kåringen after the last round.
   Until November 2026 /nissen/ was the Secret Santa draw (now /nissetrekning/). Personal draw links
   people sent before that (…/nissen/#2…) are handed on to the draw first thing, with the hash.
   The rules at the top are pure; test/nissen.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Old Secret Santa links: hand them on before anything else ----------

  // A personal draw link: "2" (the format) and the token in Crockford base32 (see nissetrekning).
  const TREKNINGSLENKE = /^2[0-9A-HJKMNP-TV-Z]+$/i;
  try {
    const hash = (window.location && window.location.hash ? window.location.hash : "").slice(1);
    if (hash && TREKNINGSLENKE.test(hash) && window.Rusj) {
      const g = (window.RUSJ_ANDRE || []).find((x) => x.id === "nissetrekning");
      window.location.replace((g && g.url ? g.url : "/nissetrekning/") + "#" + hash);
      return;
    }
  } catch (e) {
    /* not a browser: carry on */
  }

  // ---------- The rules (no kit needed) ----------

  const RUNDER = [3, 5, 7];
  const POENG_RIKTIG = 1; // to each player who pointed at the almond holder (a wrong guess: 0)
  const POENG_LURT = 1; // to the almond holder, for each player fooled

  // A new game: the almond goes to a random player; the first to see the bowl is player 0.
  function ny(antall, runder, rng) {
    return {
      antall,
      runder,
      runde: 0, // rounds finished
      mandel: Math.floor(rng() * antall),
      start: 0, // the first to see the bowl this round
      sett: 0, // how many have seen their bowl this round
      sett1: false, // the one holding the phone has seen it
      fase: "gi",
      poeng: Array(antall).fill(0),
      slapp: Array(antall).fill(0), // times each player got away with the almond
      spurt: null, // the player the elf is asking
      k: null, // the question
      pekt: [],
      siste: null,
      ferdig: false,
    };
  }
  // Whose turn it is to see the bowl.
  const tur = (sp) => (sp.start + sp.sett) % sp.antall;

  // The one holding the phone has looked at the bowl.
  function sett(sp) {
    if (sp.fase !== "se") return false;
    sp.sett1 = true;
    return true;
  }
  // Pass on: the next player, or «turn away and pop it in» when everybody has seen their bowl.
  function videre(sp) {
    if (sp.fase !== "se" || !sp.sett1) return null;
    sp.sett += 1;
    sp.sett1 = false;
    sp.fase = sp.sett >= sp.antall ? "munn" : "gi";
    return sp.fase;
  }
  // Everyone has turned back round (one of them with the almond in their mouth): the elf's questions.
  function imunnen(sp) {
    if (sp.fase !== "munn") return null;
    sp.fase = "prat";
    return sp.fase;
  }
  // The elf picks the next player to ask: never the same twice in a row.
  function nesteSpurt(sp, rng) {
    if (sp.antall < 2) return 0;
    let i = Math.floor(rng() * (sp.antall - (sp.spurt == null ? 0 : 1)));
    if (sp.spurt != null && i >= sp.spurt) i += 1;
    return i;
  }
  // Everyone has pointed: «Gap opp!» – the phone shows who had the almond.
  function gapOpp(sp) {
    if (sp.fase !== "pek") return false;
    sp.fase = "hvem";
    sp.pekt = [];
    return true;
  }
  // riktige = the players who pointed at the almond holder (the holder is never one of them).
  // ute = seats that have left a match on the net: neither right nor fooled (nobody off the net).
  function avgjor(sp, riktige, ute = []) {
    if (sp.fase !== "hvem") return null;
    const liste = [...new Set((riktige || []).filter((i) => Number.isInteger(i) && i >= 0 && i < sp.antall && i !== sp.mandel && !ute.includes(i)))].sort((a, b) => a - b);
    const lurte = sp.antall - 1 - ute.filter((i) => i !== sp.mandel).length - liste.length;
    const alle = liste.length === 0; // fooled everyone: the marzipan pig
    const pluss = Array(sp.antall).fill(0);
    for (const i of liste) pluss[i] = POENG_RIKTIG;
    pluss[sp.mandel] = lurte * POENG_LURT;
    pluss.forEach((p, i) => (sp.poeng[i] += p));
    if (alle) sp.slapp[sp.mandel] += 1;
    sp.pekt = liste;
    sp.siste = { riktige: liste, lurte, alle, pluss, mandel: sp.mandel };
    sp.fase = "fasit";
    return sp.siste;
  }
  // Take back the last result and choose who pointed right again.
  function angre(sp) {
    const r = sp.siste;
    if (sp.fase !== "fasit" || !r) return false;
    r.pluss.forEach((p, i) => (sp.poeng[i] -= p));
    if (r.alle) sp.slapp[r.mandel] -= 1;
    sp.siste = null;
    sp.fase = "hvem";
    return true;
  }
  // The next round (a new almond, the next player starts), or the end.
  function nesteRunde(sp, rng) {
    if (sp.fase !== "fasit") return null;
    sp.runde += 1;
    if (sp.runde >= sp.runder) {
      sp.ferdig = true;
      return "slutt";
    }
    Object.assign(sp, { mandel: Math.floor(rng() * sp.antall), start: sp.runde % sp.antall, sett: 0, sett1: false, fase: "gi", spurt: null, k: null, pekt: [], siste: null });
    return "gi";
  }

  const R = window.Rusj;
  if (!R) {
    window.Nissen = { RUNDER, POENG_RIKTIG, POENG_LURT, TREKNINGSLENKE, ny, tur, sett, videre, imunnen, nesteSpurt, gapOpp, avgjor, angre, nesteRunde };
    return;
  }

  // ---------- The game ----------

  const SPORSMAL = window.RUSJ_DATA.sporsmal;
  const esc = R.esc;
  const stokk = R.kortstokk("sporsmal", SPORSMAL.length);
  const MIN = 3;
  const MAKS = 12;
  const PRATETID = 60; // seconds of the elf's questions before pointing
  const HOLD = R.t("Hold fingeren på kortet for å se");
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  let H; // the actions, so one action can reuse another
  let teller = false; // the 3-2-1 countdown is running
  let feire = false; // Kåringen was just reached (not a reload)

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, MIN, MAKS);
  }

  // The elf asks the next player a new question.
  function nyttSporsmal(sp) {
    sp.spurt = nesteSpurt(sp, Math.random);
    sp.k = stokk.neste();
    if (sp.k < 0 || !SPORSMAL[sp.k]) sp.k = R.heltall(0, SPORSMAL.length - 1);
  }

  const rader = (sp, medPluss) => sp.poeng.map((poeng, i) => ({ i, poeng, ...(medPluss && sp.siste && sp.siste.pluss[i] ? { pluss: sp.siste.pluss[i] } : {}) }));
  const toppen = (sp) => {
    const best = Math.max(...sp.poeng);
    return best > 0 ? range(sp.antall).filter((i) => sp.poeng[i] === best) : [];
  };

  // Once per game, when it is over: statistics and the evening's scoreboard.
  function fullfor(S) {
    const sp = S.spill;
    if (!sp || sp.feiret) return;
    sp.ferdig = true;
    sp.feiret = true;
    feire = true;
    R.statistikk("ferdig", { spillere: sp.antall, runder: sp.runde, avbrutt: sp.runde < sp.runder });
    if (sp.runde > 0) R.kveld.registrer(rader(sp));
  }

  // The porridge bowl, drawn: with the almond on top or just porridge.
  const bolle = (mandel) => `
    <svg class="ng-bolle" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="48" rx="66" ry="20" fill="#fff4dc" stroke="var(--blekk)" stroke-width="5"/>
      <path d="M14 48 Q16 108 80 110 Q144 108 146 48" fill="#3a6fd8" stroke="var(--blekk)" stroke-width="5" stroke-linejoin="round"/>
      <path d="M28 70 Q80 84 132 70" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 10"/>
      <ellipse cx="96" cy="45" rx="13" ry="6" fill="#ffd23f" stroke="var(--blekk)" stroke-width="3"/>
      <circle cx="58" cy="44" r="2.2" fill="#c98a4b"/><circle cx="70" cy="50" r="2" fill="#c98a4b"/><circle cx="112" cy="52" r="2" fill="#c98a4b"/>
      ${mandel ? `<g class="ng-mandel"><path d="M46 44 Q50 26 72 24 Q84 24 86 30 Q78 46 46 44Z" fill="#c8874a" stroke="var(--blekk)" stroke-width="3.5" stroke-linejoin="round"/><path d="M54 40 Q66 32 80 30" fill="none" stroke="#8a5428" stroke-width="2.4" stroke-linecap="round"/></g>` : ""}
    </svg>`;

  // The bowl behind the hold card: the almond, or just porridge.
  const bolleKort = (har) => ({
    html: `<div class="ng-se ${har ? "har" : ""}">${bolle(har)}<p class="ng-se-tekst">${esc(har ? R.t("MANDELEN!") : R.t("Bare grøt"))}</p><p class="ng-se-hint">${esc(har ? R.t("Når alle snur seg: putt mandelen ekte i munnen. Ikke vis noe!") : R.t("Når alle snur seg: bare lat som du putter mandelen i munnen."))}</p></div>`,
    si: har ? R.t("Du har mandelen!") : R.t("Bare grøt"),
    klasse: "ng-bak",
  });

  // ---------- On the net (R.nett, rusj/kit/nett.js) ----------
  // Seat i is player i on its own phone. Everyone still sits together (or on a call) with a real
  // almond each: the phones only replace passing one phone round. Every round each phone holds its
  // own bowl (only its own, R.nett.meg()) and taps «Jeg har sett»; the round's leader sends everyone
  // to the elf and asks for new questions; then everyone points on their own phone, and when the
  // last one has pointed, every phone shows who had the almond and the points. The leader moves one
  // seat on each round, and each match begins one seat further on.
  // Moves: { sett: r } (I have looked in my bowl in round r); { nissen: r }, { sporsmal: r } and
  // { pek: r } from the leader; { stem: i, r } (I point at seat i); { runde: r } from the leader of
  // round r. Anything else, or anything the rules don't allow now, is ignored on every phone.
  // Who gets the almond and the elf's questions come from the room's seed (okt.rng): a modified phone
  // could compute them – a game among friends, as with dice on the net. Who pointed at whom is in
  // every phone's list of moves before the reveal; the screens show only how many are ready.
  // A seat that leaves is skipped; if it had the almond, the round does not count. Fewer than three
  // left: the match is over. No «Angre» on the net: everyone has seen the points.
  const paNett = (sp) => !!sp && sp.modus === "nett" && !!R.nett;
  const erInne = (sp, i) => Number.isInteger(i) && i >= 0 && i < sp.antall && !sp.ute.includes(i);
  const nettInne = (sp) => range(sp.antall).filter((i) => !sp.ute.includes(i));
  // The leader of round k: one seat on each round (past those who left).
  function lederFor(sp, k) {
    let s = (sp.forste + k) % sp.antall;
    for (let j = 0; j < sp.antall && sp.ute.includes(s); j++) s = (s + 1) % sp.antall;
    return s;
  }
  const nettLeder = (sp) => lederFor(sp, sp.runde);
  const tom = (n) => Array(n).fill(null);
  const nettAlle = (sp, svar) => R.nett.alleHar(svar, sp.antall);
  // In a phase where everyone answers: this phone if it still owes an answer, else the one left (if one).
  function venterPa(sp, svar) {
    const meg = R.nett.meg();
    if (erInne(sp, meg) && svar[meg] == null) return meg;
    const mangler = nettInne(sp).filter((i) => svar[i] == null);
    return mangler.length === 1 ? mangler[0] : null;
  }

  // A new round k: the almond goes to one of the seats still in.
  function nettRunde(sp, k, rng) {
    const med = nettInne(sp);
    Object.assign(sp, { runde: k, mandel: med[Math.floor(rng() * med.length)], fase: "se", sett: tom(sp.antall), stemmer: tom(sp.antall), spurt: null, k: null, siste: null });
  }
  // The elf asks someone else (still in) a question not asked yet in this match.
  function nettSporsmal(sp, rng) {
    const med = nettInne(sp).filter((i) => i !== sp.spurt);
    if (med.length) sp.spurt = med[Math.floor(rng() * med.length)];
    let ledige = range(SPORSMAL.length).filter((k) => !sp.brukt.includes(k));
    if (!ledige.length) {
      sp.brukt = [];
      ledige = range(SPORSMAL.length);
    }
    sp.k = ledige[Math.floor(rng() * ledige.length)];
    sp.brukt.push(sp.k);
  }
  // Everyone still in has pointed: the points (1 per right guess, 1 to the holder per player fooled).
  function nettAvgjor(sp) {
    sp.fase = "hvem";
    avgjor(sp, range(sp.antall).filter((i) => sp.stemmer[i] === sp.mandel), sp.ute);
    sp.spilt += 1;
    if (sp.runde + 1 >= sp.runder) sp.ferdig = true;
  }

  let nettSett = ""; // the round whose bowl this phone has looked at (the button waits for it)
  let nettValgt = null; // the name marked on this phone, before «Pek på …»
  let nettNokkel = ""; // match, round and phase on screen: a new one clears the mark
  let pratNokkel = ""; // the question the elf's clock belongs to
  const nokkelFor = (sp) => `${R.nett.kamp()}:${sp.runde}:${sp.fase}`;

  // After a move on the screen: redraw, and a sound when the phase changed.
  function nettTegn(S, for_) {
    const sp = S.spill;
    if (S.skjerm !== "nettspill") return;
    R.vis();
    if (sp.fase === for_) return;
    if (sp.fase === "fasit" && sp.siste) {
      if (sp.siste.tom) R.lyd.pling();
      else if (sp.siste.alle) {
        R.lyd.fanfare();
        R.konfetti(["--rosa", "--lampe", "--aksent"]);
      } else if (!sp.siste.lurte) R.lyd.buu();
      else R.lyd.fanfare();
      R.vibrer([40, 30, 90]);
      R.si(R.t("Mandelen var hos {navn}", { navn: R.navn(sp.siste.mandel) }));
      if (sp.ferdig) feire = true;
    } else if (sp.fase === "pek") R.lyd.pek();
    else R.lyd.pling();
  }

  // «2 av 4 er klare» and who is still missing – never what anyone chose.
  function klarLinje(sp, svar) {
    const med = nettInne(sp);
    const mangler = med.filter((i) => svar[i] == null);
    const hvem = mangler.length && mangler.length <= 3 ? " · " + R.t("Venter på {navn} …", { navn: R.ramsOpp(mangler.map(R.navn)) }) : "";
    return `<p class="hjelp ng-klar" data-si>${esc(R.t("{n} av {m} er klare", { n: med.length - mangler.length, m: med.length }) + hvem)}</p>`;
  }
  const lederHjelp = (sp, i) => `<p class="hjelp">${esc(R.t("Det er {navn} som trykker videre.", { navn: R.navn(i) }))}</p>`;

  function nettVis(S) {
    const sp = S.spill;
    const meg = R.nett.meg();
    const led = nettLeder(sp);
    const kan = !R.nett.venter();
    if (nettNokkel !== nokkelFor(sp)) {
      nettNokkel = nokkelFor(sp);
      nettValgt = null;
    }
    if (sp.fase === "se") {
      const sendt = sp.sett[meg] != null;
      const sett = nettSett === `${R.nett.kamp()}:${sp.runde}`;
      return `
        <div data-hemmelig>
          <h1 id="skjerm-tittel">${esc(R.t("Se i grøtbollen din"))}</h1>
          ${R.ui.mappe({ id: "nett", etikett: R.t("Grøtbollen"), tekst: HOLD, etikettAria: R.t("Hold fingeren på kortet for å se om du fikk mandelen") })}
        </div>
        ${klarLinje(sp, sp.sett)}
        ${R.ui.dokk(sendt ? "" : sett ? "" : `<p class="hjelp">${esc(R.t("Se i bollen først."))}</p>`, sendt ? "" : R.ui.knapp(R.t("Jeg har sett"), "pa-sett", { av: !sett || !kan }))}`;
    }
    if (sp.fase === "munn") {
      return `
        <h1 id="skjerm-tittel">${esc(R.t("Snu dere bort!"))}</h1>
        <p class="ingress">${esc(R.t("Alle snur ryggen til bordet og later som de putter mandelen i munnen. Bare den som fikk mandelen, gjør det ekte."))}</p>
        <div class="ng-fasit">${bolle(true)}</div>
        ${R.ui.knapp2(R.t("3 · 2 · 1 – Nam!"), "nam", { ikon: "😋" })}
        <p class="hjelp">${esc(R.t("Snu dere tilbake og se uskyldige ut. Ingen sier noe!"))}</p>
        ${R.ui.dokk(led === meg ? R.ui.knapp(R.t("Alle har snudd seg – til nissen"), "pa-nissen", { av: !kan }) : lederHjelp(sp, led))}`;
    }
    if (sp.fase === "prat") {
      return `
        <div class="ng-nissen">
          ${R.figur()}
          <div class="ng-boble">
            <p class="etikett">${esc(R.t("Nissen spør {navn}", { navn: R.navn(sp.spurt) }))}</p>
            <h1 id="skjerm-tittel">${esc(SPORSMAL[sp.k])}</h1>
          </div>
        </div>
        <p class="ng-til">${R.avatar(sp.spurt, "stor")}<b>${esc(R.navn(sp.spurt))}</b></p>
        ${R.ui.timer({ id: "klokke", sekunder: PRATETID, kontrollHtml: `<span class="etikett">${esc(R.t("Tid til å snakke"))}</span>${R.ui.knapp2(R.t("+30 s"), "pluss", { variant: "liten" })}` })}
        ${R.ui.dokk(
          led === meg ? R.ui.knapp2(R.t("Nytt spørsmål"), "pa-sporsmal", { ikon: "🎅", av: !kan }) + R.ui.knapp(R.t("Klare til å peke"), "pa-pek", { variant: "rosa", av: !kan }) : lederHjelp(sp, led),
        )}`;
    }
    if (sp.fase === "pek") {
      const min = sp.stemmer[meg];
      if (min != null) {
        return `
          <h1 id="skjerm-tittel">${esc(R.t("Hvem har mandelen?"))}</h1>
          <p class="ingress">${esc(R.t("Du pekte på {navn}.", { navn: R.navn(min) }))}</p>
          ${klarLinje(sp, sp.stemmer)}`;
      }
      const andre = nettInne(sp).filter((i) => i !== meg);
      return `
        <h1 id="skjerm-tittel">${esc(R.t("Hvem har mandelen?"))}</h1>
        <p class="ingress">${esc(R.t("Pek på den du tror har mandelen – her på mobilen din. Den som har mandelen, peker også."))}</p>
        ${R.ui.velgere("pa-marker", andre, nettValgt)}
        ${klarLinje(sp, sp.stemmer)}
        ${R.ui.dokk(R.ui.knapp(nettValgt != null ? R.t("Pek på {navn}", { navn: R.navn(nettValgt) }) : R.t("Trykk på et navn"), "pa-stem", { variant: "rosa", av: nettValgt == null || !kan }))}`;
    }
    // «fasit»: who had the almond, the points – or a round that does not count.
    const r = sp.siste;
    const navn = R.navn(r.mandel);
    const neste = lederFor(sp, sp.runde + 1);
    const dokk = sp.ferdig ? R.ui.knapp(R.t("Til kåringen"), "pa-kaaring") : neste === meg ? R.ui.knapp(R.t("Neste runde"), "pa-neste", { av: !kan }) : lederHjelp(sp, neste);
    if (r.tom) {
      return `
        ${R.ui.banner({ etikett: R.t("Runden teller ikke"), tittel: R.t("{navn} gikk – med mandelen", { navn }), tekst: R.t("Ingen får poeng denne runden."), klasse: "aksent", stemning: "lei" })}
        <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(nettRader(sp))}</section>
        ${R.ui.dokk(dokk)}`;
    }
    const poeng = R.flertall(r.pluss[r.mandel], "poeng", "poeng");
    const banner = r.alle
      ? R.ui.banner({ etikett: R.t("{navn} lurte alle sammen!", { navn }), tittel: R.t("{navn} vinner marsipangrisen!", { navn }), tekst: R.t("{poeng} til {navn}.", { poeng, navn }), klasse: "aksent ng-gris-banner", stemning: "jubel" })
      : !r.lurte
        ? R.ui.banner({ etikett: R.t("Mandelen er funnet!"), tittel: R.t("Alle pekte på {navn}!", { navn }), tekst: R.t("1 poeng til alle som pekte riktig."), klasse: "aksent", stemning: "lei" })
        : R.ui.banner({ etikett: R.t("{navn} hadde mandelen", { navn }), tittel: R.t("{navn} lurte {n} av {m}", { navn, n: r.lurte, m: r.lurte + r.riktige.length }), tekst: R.t("{poeng} til {navn}, og 1 poeng til hver som pekte riktig.", { poeng, navn }), klasse: "aksent" });
    return `
      ${banner}
      <div class="ng-fasit">${bolle(true)}${r.alle ? `<span class="ng-gris" aria-hidden="true">🐷</span>` : ""}</div>
      <p class="hjelp midt">${esc(R.t("Gap opp og vis mandelen, {navn}!", { navn }))}</p>
      <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(nettRader(sp, true))}</section>
      ${R.ui.dokk(dokk)}`;
  }
  // The points of the seats still in (those who left are not ranked).
  const nettRader = (sp, medPluss) => rader(sp, medPluss).filter((r) => !sp.ute.includes(r.i));
  function nettToppen(sp) {
    const best = Math.max(0, ...nettRader(sp).map((r) => r.poeng));
    return best > 0 ? nettInne(sp).filter((i) => sp.poeng[i] === best) : [];
  }

  // The elf's clock: a new one for each question, kept across redraws.
  function nettEtter(S) {
    const sp = S.spill;
    if (!paNett(sp) || sp.fase !== "prat") return;
    const nokkel = `${R.nett.kamp()}:${sp.runde}:${sp.k}`;
    const t = R.timer("klokke");
    if (t && pratNokkel === nokkel) return t.tegn();
    if (t) t.stopp();
    pratNokkel = nokkel;
    new R.Timer({ id: "klokke", sekunder: PRATETID }).start();
  }

  const NETT = {
    min: MIN,
    maks: MAKS,
    oppsett: (S) => ({ runder: S.runder }),
    oppsettTekst: (o) => R.flertall(RUNDER.includes((o || {}).runder) ? o.runder : 5, "runde", "runder"),
    start(S, okt) {
      const n = R.klamp(okt.antall || MIN, MIN, MAKS);
      const runder = RUNDER.includes((okt.oppsett || {}).runder) ? okt.oppsett.runder : 5;
      const sp = { modus: "nett", antall: n, runder, runde: 0, spilt: 0, forste: (okt.kamp - 1) % n, ute: [], poeng: Array(n).fill(0), slapp: Array(n).fill(0), brukt: [], pekt: [], ferdig: false };
      nettRunde(sp, 0, R.nett.tilfeldig(okt.fro, "mandel"));
      S.spill = sp;
      nettSett = "";
      nettValgt = null;
      nettNokkel = "";
      pratNokkel = "";
      feire = false;
    },
    trekk(S, t, sete, okt) {
      const sp = S.spill;
      if (!paNett(sp) || sp.ferdig || !t || typeof t !== "object" || !erInne(sp, sete)) return;
      const for_ = sp.fase;
      const r = sp.runde;
      if (sp.fase === "se" && t.sett === r && sp.sett[sete] == null) {
        sp.sett[sete] = 1;
        if (nettAlle(sp, sp.sett)) sp.fase = "munn";
      } else if (sp.fase === "munn" && t.nissen === r && sete === nettLeder(sp)) {
        sp.fase = "prat";
        nettSporsmal(sp, okt.rng);
      } else if (sp.fase === "prat" && t.sporsmal === r && sete === nettLeder(sp)) {
        nettSporsmal(sp, okt.rng);
      } else if (sp.fase === "prat" && t.pek === r && sete === nettLeder(sp)) {
        sp.fase = "pek";
      } else if (sp.fase === "pek" && t.r === r && sp.stemmer[sete] == null && erInne(sp, t.stem) && t.stem !== sete) {
        sp.stemmer[sete] = t.stem;
        if (nettAlle(sp, sp.stemmer)) nettAvgjor(sp);
      } else if (sp.fase === "fasit" && t.runde === r + 1 && sete === lederFor(sp, r + 1)) {
        nettRunde(sp, t.runde, okt.rng);
      } else return;
      if (!okt.gjenspill) nettTegn(S, for_);
    },
    // The seat left: it is skipped from now on. With the almond, the round does not count.
    borte(S, sete, okt) {
      const sp = S.spill;
      if (!paNett(sp) || sp.ferdig || !(sete >= 0 && sete < sp.antall) || sp.ute.includes(sete)) return;
      const for_ = sp.fase;
      sp.ute.push(sete);
      sp.stemmer[sete] = null; // (its vote goes with it)
      if (nettInne(sp).length < MIN) sp.ferdig = true;
      else if (sete === sp.mandel && sp.fase !== "fasit") {
        sp.fase = "fasit";
        sp.siste = { tom: true, mandel: sete, riktige: [], lurte: 0, alle: false, pluss: Array(sp.antall).fill(0) };
        if (sp.runde + 1 >= sp.runder) sp.ferdig = true;
      } else if (sp.fase === "se" && nettAlle(sp, sp.sett)) sp.fase = "munn";
      else if (sp.fase === "pek" && nettAlle(sp, sp.stemmer)) nettAvgjor(sp);
      else if (sp.fase === "prat" && sp.spurt === sete) nettSporsmal(sp, okt.rng);
      if (okt.gjenspill) return;
      if (sp.ferdig && sp.fase !== "fasit") {
        feire = true;
        if (S.skjerm === "nettspill") R.gaTil("slutt");
        return;
      }
      nettTegn(S, for_);
    },
    skjerm: (S) => (S.spill && S.spill.ferdig ? "slutt" : "nettspill"),
    tur(S) {
      const sp = S.spill;
      if (!paNett(sp) || sp.ferdig) return null;
      if (sp.fase === "se") return venterPa(sp, sp.sett);
      if (sp.fase === "pek") return venterPa(sp, sp.stemmer);
      if (sp.fase === "fasit") return lederFor(sp, sp.runde + 1);
      return nettLeder(sp);
    },
    ferdig: (S) => !!S.spill && paNett(S.spill) && !!S.spill.ferdig,
  };

  R.start({
    id: "nissen",
    versjon: 2, // version 1 was the Secret Santa draw that used to live here (now «nissetrekning»)
    pagar,
    nett: NETT,

    tilstand: () => ({
      antall: standardAntall(),
      runder: 5,
      spill: null,
    }),

    lastet(S) {
      S.antall = R.klamp(Number(S.antall) || standardAntall(), MIN, MAKS);
      if (!RUNDER.includes(S.runder)) S.runder = 5;
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const spiller = (i) => Number.isInteger(i) && i >= 0 && i < n;
        const liste = (l) => Array.isArray(l) && l.length === n && l.every((x) => Number.isInteger(x));
        const ok =
          Number.isInteger(n) && n >= MIN && n <= MAKS &&
          RUNDER.includes(sp.runder) && Number.isInteger(sp.runde) && sp.runde >= 0 && sp.runde <= sp.runder &&
          spiller(sp.mandel) && spiller(sp.start) && Number.isInteger(sp.sett) && sp.sett >= 0 && sp.sett <= n &&
          ["gi", "se", "munn", "prat", "pek", "hvem", "fasit"].includes(sp.fase) &&
          liste(sp.poeng) && liste(sp.slapp) && Array.isArray(sp.pekt) && sp.pekt.every(spiller) &&
          (sp.fase !== "prat" || (spiller(sp.spurt) && !!SPORSMAL[sp.k])) &&
          (sp.fase !== "fasit" || (sp.siste && Array.isArray(sp.siste.pluss) && sp.siste.pluss.length === n && Number.isInteger(sp.siste.lurte)));
        if (!ok) S.spill = null;
      }
      const skjermer = { gi: "gi", se: "gi", munn: "munn", prat: "prat", pek: "pek", hvem: "hvem", fasit: "fasit" };
      if (["gi", "se", "munn", "prat", "pek", "hvem", "fasit"].includes(S.skjerm)) S.skjerm = pagar(S) ? skjermer[S.spill.fase] : "hjem";
      // The bowl is never on the screen after a reload: back to «give the phone to …».
      if (pagar(S) && S.spill.fase === "se") {
        S.spill.fase = "gi";
        S.spill.sett1 = false;
      }
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Mandelen i grøten som bløffespill. Én av dere får mandelen i hemmelighet – og må late som ingenting mens nissen stiller spørsmål.") + " " + R.t("Dere trenger én hel mandel per spiller – eller noe like stort, som en sjokoladebit eller en stor drops."),
      steg: [
        [R.t("Se i bollen"), R.t("Mobilen går rundt. Hold fingeren på grøtbollen og se i hemmelighet om du fikk mandelen. Bare én får den.")],
        [R.t("Snu dere bort"), R.t("Alle snur seg samtidig og later som de putter mandelen i munnen. Bare den som fikk mandelen, putter den ekte i munnen – de andre gjemmer sin i hånda.")],
        [R.t("Nissen spør"), R.t("Nissen stiller spørsmål til én og én. Svar så godt du kan – med mandelen i munnen – og prøv å se uskyldig ut.")],
        [R.t("Pek samtidig"), R.t("Tell ned, og alle peker samtidig på den de tror har mandelen. Hold fingeren der!")],
        [R.t("Gap opp"), R.t("Den som hadde mandelen, gaper opp og viser den. Pekte du riktig, får du 1 poeng. Mandelholderen får 1 poeng for hver hen lurte – og marsipangrisen hvis hen lurte alle.")],
      ],
      tips: [R.t("Alle trenger en hel mandel. Nøtteallergi rundt bordet? Bruk noe like stort som er vanskelig å skjule, som en sjokoladebit eller en stor drops."), R.t("Den som har mandelen, kan godt peke på noen andre."), R.t("Ikke svelg mandelen! Gjem den i munnen til det er tid for å gape opp."), R.t("Alle må svare på spørsmålene – også den som har mandelen.")],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        if (!sp) return { html: "" };
        // On the net: this phone's own bowl, never another seat's.
        if (paNett(sp)) return bolleKort(R.nett.meg() === sp.mandel);
        return bolleKort(tur(sp) === sp.mandel);
      },
      sett(S) {
        const sp = S.spill;
        if (paNett(sp)) {
          if (sp.fase !== "se" || sp.ferdig) return;
          nettSett = `${R.nett.kamp()}:${sp.runde}`;
          return R.vis();
        }
        if (!pagar(S) || !sett(sp)) return;
        R.vis();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Én har mandelen i grøten."))}<br><em>${esc(R.t("Klarer hen å late som ingenting?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }) : "",
              ekstraHtml: (R.nett ? R.nett.knapp() : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              [R.t("1 mandel"), R.t("per spiller")],
              [`${MIN}–${MAKS}`, R.t("spillere")],
              [String(SPORSMAL.length), R.t("spørsmål")],
              ["0", R.t("reklame")],
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
            <p class="papirboks ng-mandler">${esc(R.t("Alle trenger en hel mandel. Nøtteallergi rundt bordet? Bruk noe like stort som er vanskelig å skjule, som en sjokoladebit eller en stor drops."))}</p>
            ${R.ui.spillere({ min: MIN, max: MAKS, hjelp: R.t("Mobilen går rundt i samme rekkefølge som lista.") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Runder"))}</h2></div>
              ${R.ui.seg("runder", RUNDER.map((n) => [String(n), String(n)]), String(S.runder))}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      gi: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis: (S) =>
          R.ui.giTil({
            i: tur(S.spill),
            h: "jeg-er",
            advarsel: R.t("De andre ser bort"),
            prikker: [S.spill.antall, S.spill.sett],
          }),
        inn: () => R.holdVaken(),
      },

      se: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const sist = sp.sett + 1 >= sp.antall;
          return `
            <div data-hemmelig>
              <h1 class="vh" id="skjerm-tittel">${esc(R.t("{navn}: Se i grøtbollen din", { navn: R.navn(tur(sp)) }))}</h1>
              ${R.ui.mappe({ etikett: R.t("Grøtbollen"), tekst: HOLD, etikettAria: R.t("Hold fingeren på kortet for å se om du fikk mandelen") })}
            </div>
            ${R.ui.dokk(
              sp.sett1 ? "" : `<p class="hjelp">${esc(R.t("Se i bollen først."))}</p>`,
              R.ui.knapp(sist ? R.t("Alle har sett – snu dere bort") : R.t("Ferdig – gi mobilen videre"), "videre", { av: !sp.sett1 }),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
      },

      munn: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis() {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Snu dere bort!"))}</h1>
            <p class="ingress">${esc(R.t("Alle snur ryggen til bordet og later som de putter mandelen i munnen. Bare den som fikk mandelen, gjør det ekte."))}</p>
            <div class="ng-fasit">${bolle(true)}</div>
            ${R.ui.knapp2(R.t("3 · 2 · 1 – Nam!"), "nam", { ikon: "😋" })}
            <p class="hjelp">${esc(R.t("Snu dere tilbake og se uskyldige ut. Ingen sier noe!"))}</p>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Alle har snudd seg – til nissen"), "til-nissen"),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn: () => R.holdVaken(),
      },

      prat: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="ng-nissen">
              ${R.figur()}
              <div class="ng-boble">
                <p class="etikett">${esc(R.t("Nissen spør {navn}", { navn: R.navn(sp.spurt) }))}</p>
                <h1 id="skjerm-tittel">${esc(SPORSMAL[sp.k])}</h1>
              </div>
            </div>
            <p class="ng-til">${R.avatar(sp.spurt, "stor")}<b>${esc(R.navn(sp.spurt))}</b></p>
            ${R.ui.timer({ id: "klokke", sekunder: PRATETID, kontrollHtml: `<span class="etikett">${esc(R.t("Tid til å snakke"))}</span>${R.ui.knapp2(R.t("+30 s"), "pluss", { variant: "liten" })}` })}
            ${R.ui.dokk(
              R.ui.knapp2(R.t("Nytt spørsmål"), "nytt-sporsmal", { ikon: "🎅" }),
              R.ui.knapp(R.t("Klare til å peke"), "til-pek", { variant: "rosa" }),
              R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn() {
          R.holdVaken();
          new R.Timer({ id: "klokke", sekunder: PRATETID }).start();
        },
        etter() {
          const t = R.timer("klokke");
          if (t) t.tegn();
        },
      },

      pek: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "prat",
        vis() {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Hvem har mandelen?"))}</h1>
            <p class="ingress">${esc(R.t("Tell ned, og alle peker samtidig på den de tror har mandelen. Hold fingeren der!"))}</p>
            ${R.ui.knapp2(R.t("3 · 2 · 1 – Pek!"), "pek", { ikon: "👉" })}
            <p class="hjelp">${esc(R.t("Alle peker på én – også den som har mandelen."))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Gap opp!"), "snu", { variant: "rosa" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
      },

      hvem: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const navn = R.navn(sp.mandel);
          const andre = range(sp.antall).filter((i) => i !== sp.mandel);
          return `
            ${R.ui.banner({ etikett: R.t("Mandelen var hos"), tittel: navn, tekst: R.t("Gap opp og vis mandelen, {navn}!", { navn }), klasse: "aksent", stemning: "jubel" })}
            <div class="ng-fasit">${bolle(true)}</div>
            <section class="seksjon">
              <h2>${esc(R.t("Hvem pekte på {navn}?", { navn }))}</h2>
              ${R.ui.velgere("pekt", andre, sp.pekt)}
              <p class="hjelp">${esc(R.t("Trykk på alle som pekte riktig."))}</p>
            </section>
            ${R.ui.dokk(R.ui.knapp(sp.pekt.length ? R.t("Gi poeng") : R.t("Ingen pekte riktig"), "gi-poeng", { variant: "rosa" }))}`;
        },
      },

      fasit: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.siste;
          const navn = R.navn(r.mandel);
          const sist = sp.runde + 1 >= sp.runder;
          const poeng = R.flertall(r.pluss[r.mandel], "poeng", "poeng");
          const banner = r.alle
            ? R.ui.banner({ etikett: R.t("{navn} lurte alle sammen!", { navn }), tittel: R.t("{navn} vinner marsipangrisen!", { navn }), tekst: R.t("{poeng} til {navn}.", { poeng, navn }), klasse: "aksent ng-gris-banner", stemning: "jubel" })
            : !r.lurte
              ? R.ui.banner({ etikett: R.t("Mandelen er funnet!"), tittel: R.t("Alle pekte på {navn}!", { navn }), tekst: R.t("1 poeng til alle som pekte riktig."), klasse: "aksent", stemning: "lei" })
              : R.ui.banner({ etikett: R.t("{navn} hadde mandelen", { navn }), tittel: R.t("{navn} lurte {n} av {m}", { navn, n: r.lurte, m: sp.antall - 1 }), tekst: R.t("{poeng} til {navn}, og 1 poeng til hver som pekte riktig.", { poeng, navn }), klasse: "aksent" });
          return `
            ${banner}
            <div class="ng-fasit">${bolle(true)}${r.alle ? `<span class="ng-gris" aria-hidden="true">🐷</span>` : ""}</div>
            <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Poeng"))}</h2></div>${R.ui.poengliste(rader(sp, true))}</section>
            ${R.ui.dokk(R.ui.knapp(sist ? R.t("Til kåringen") : R.t("Neste runde"), "neste"), R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          if (S.spill.siste && S.spill.siste.alle) R.konfetti(["--rosa", "--lampe", "--aksent"]);
        },
      },

      // On the net: one screen for the whole round, drawn from the phase (see «On the net» above).
      nettspill: {
        tittel: (S) => R.t("Runde {n} av {m}", { n: S.spill.runde + 1, m: S.spill.runder }),
        tilbake: "hjem",
        vis: nettVis,
        etter: nettEtter,
        inn: () => R.holdVaken(),
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const nett = paNett(sp);
          const liste = nett ? nettRader(sp) : rader(sp);
          const spilt = nett ? sp.spilt : sp.runde;
          const topp = nett ? nettToppen(sp) : toppen(sp);
          const griser = sp.slapp.reduce((s, n) => s + n, 0);
          const banner = topp.length
            ? R.ui.banner({ tittel: R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(topp.map(R.navn)), n: topp.length }), tekst: R.t("{poeng} etter {runder}", { poeng: R.flertall(sp.poeng[topp[0]], "poeng", "poeng"), runder: R.flertall(spilt, "runde", "runder") }), klasse: "aksent" })
            : R.ui.banner({ tittel: R.t("Ingen poeng ennå"), tekst: R.t("Spill en runde, så blir det kåring!"), klasse: "aksent", stemning: "" });
          const grisLinje = griser
            ? R.t("Marsipangriser i kveld: {liste}", {
                liste: R.ramsOpp(
                  range(sp.antall)
                    .filter((i) => sp.slapp[i] > 0)
                    .map((i) => `${R.navn(i)} ${"🐷".repeat(Math.min(sp.slapp[i], 5))}`),
                ),
              })
            : R.t("Ingen slapp unna med mandelen i kveld. For en gjeng med detektiver!");
          return `
            ${banner}
            ${topp.length ? R.ui.pall(liste) : ""}
            ${spilt ? R.ui.poengliste(liste) : ""}
            ${spilt ? `<p class="papirboks ng-griser">${esc(grisLinje)}</p>` : ""}
            ${
              nett
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

    handlinger: (H = {
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
        if (S.spill.fase === "se") {
          S.spill.fase = "gi";
          S.spill.sett1 = false;
        }
        R.gaTil(S.spill.fase);
      },
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if (RUNDER.includes(n)) S.runder = n;
        R.vis();
      },
      start(el, e, S) {
        const antall = R.klamp(S.antall || 4, MIN, MAKS);
        S.spill = ny(antall, S.runder, Math.random);
        R.statistikk("start", { spillere: antall, runder: S.runder });
        R.gaTil("gi");
      },
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "gi") return;
        sp.fase = "se";
        sp.sett1 = false;
        R.gaTil("se");
      },
      videre(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const hvor = videre(sp);
        if (!hvor) return;
        if (hvor === "munn") R.lyd.pling();
        R.gaTil(hvor);
      },
      async nam() {
        if (teller) return;
        teller = true;
        let ferdig = false;
        try {
          ferdig = await R.nedtelling(["3", "2", "1", R.t("NAM!")], 700);
        } finally {
          teller = false;
        }
        if (ferdig) R.vibrer([60, 40, 120]);
      },
      "til-nissen"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !imunnen(sp)) return;
        nyttSporsmal(sp);
        R.lyd.pling();
        R.gaTil("prat");
      },
      "nytt-sporsmal"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "prat") return;
        nyttSporsmal(sp);
        R.lyd.sveip();
        R.vis();
        R.si(`${R.navn(sp.spurt)}: ${SPORSMAL[sp.k]}`);
      },
      pluss() {
        const t = R.timer("klokke");
        if (t) t.leggTil(30);
      },
      "til-pek"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "prat") return;
        sp.fase = "pek";
        sp.pekt = [];
        R.gaTil("pek");
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
      pekt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "hvem") return;
        const i = Number(el.dataset.v);
        if (i === sp.mandel) return;
        sp.pekt = sp.pekt.includes(i) ? sp.pekt.filter((x) => x !== i) : [...sp.pekt, i];
        R.vis();
      },
      async snu(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.fase !== "pek") return;
        const fortsatt = R.vakt();
        R.lyd.trommevirvel(1);
        await R.vent(R.rolig() ? 200 : 900);
        if (!fortsatt() || S.spill !== sp || !gapOpp(sp)) return;
        R.lyd.fanfare();
        R.vibrer([40, 30, 90]);
        R.gaTil("hvem");
        R.si(R.t("Mandelen var hos {navn}", { navn: R.navn(sp.mandel) }));
      },
      "gi-poeng"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const r = avgjor(sp, sp.pekt);
        if (!r) return;
        if (r.alle) R.lyd.fanfare();
        else if (!r.lurte) R.lyd.buu();
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
        const hvor = nesteRunde(sp, Math.random);
        if (!hvor) return;
        if (hvor === "slutt") {
          fullfor(S);
          R.gaTil("slutt");
          return;
        }
        R.gaTil("gi");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        const fortsatt = R.vakt();
        const ingenting = sp.runde === 0 && sp.fase !== "fasit";
        const ja = await R.bekreft(R.t("Avslutte spillet?"), ingenting ? R.t("Dere kan alltid starte et nytt.") : R.t("Dere går rett til kåringen."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (ingenting) {
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (sp.fase === "fasit") sp.runde += 1; // this round was played to the end
        fullfor(S);
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },

      // On the net: each tap is a move, played when the room sends it back.
      "pa-sett"(el, e, S) {
        const sp = S.spill;
        if (paNett(sp) && sp.fase === "se" && nettSett === `${R.nett.kamp()}:${sp.runde}`) R.nett.send({ sett: sp.runde });
      },
      "pa-nissen": (el, e, S) => paNett(S.spill) && R.nett.send({ nissen: S.spill.runde }),
      "pa-sporsmal": (el, e, S) => paNett(S.spill) && R.nett.send({ sporsmal: S.spill.runde }),
      "pa-pek": (el, e, S) => paNett(S.spill) && R.nett.send({ pek: S.spill.runde }),
      "pa-marker"(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!paNett(sp) || sp.fase !== "pek" || !erInne(sp, i) || i === R.nett.meg()) return;
        nettValgt = i;
        R.vis();
      },
      "pa-stem"(el, e, S) {
        const sp = S.spill;
        if (paNett(sp) && sp.fase === "pek" && nettValgt != null) R.nett.send({ stem: nettValgt, r: sp.runde });
      },
      "pa-neste": (el, e, S) => paNett(S.spill) && R.nett.send({ runde: S.spill.runde + 1 }),
      "pa-kaaring": (el, e, S) => paNett(S.spill) && S.spill.ferdig && R.gaTil("slutt"),
    }),
  });
})();
