/* Hatten — «Ord i hatten» (fishbowl), team against team on one phone.
   All the words go into a hat. The teams take turns: one explainer draws a word at a time and
   the rest of the team guesses until the time runs out. «Riktig» gives a point, «Pass» puts the
   word back in the hat. The words left in the hat carry over to the next team; when the hat is
   empty the round is over and every word goes back in for the next round. The same words are
   played three times: 1) explain with as many words as you like, 2) only one word, 3) mime.
   Words come from data/ord.json («Fra rusj») or each player types a few in secret («Skriv selv»).
   Without the kit (node:vm in test/hatten.test.mjs) the file only exposes the rules (window.Hatten). */
(function () {
  "use strict";

  // ---------- The rounds ----------

  // R.t before the kit is there (the unit tests load this file without it): the Norwegian key.
  const Rt = { t: (s) => (window.Rusj && window.Rusj.t ? window.Rusj.t(s) : s) };
  const RUNDER = [
    { navn: Rt.t("Forklar"), ikon: "💬", kjor: Rt.t("FORKLAR!"), regel: Rt.t("Forklar med så mange ord du vil – men ikke si ordet."), kort: Rt.t("Forklar – uten å si ordet") },
    { navn: Rt.t("Ett ord"), ikon: "☝️", kjor: Rt.t("ETT ORD!"), regel: Rt.t("Si bare ett eneste ord per lapp. Ingen lyder, ingen fakter."), kort: Rt.t("Bare ett ord!") },
    { navn: Rt.t("Mim"), ikon: "🤫", kjor: Rt.t("MIM!"), regel: Rt.t("Ingen ord og ingen lyder – bare kroppen."), kort: Rt.t("Mim – helt uten lyd") },
  ];

  // ---------- The hat: the rules, without the kit ----------
  // sp.hatt: the words (indexes into sp.ord) still in the hat, in the order they will be drawn.
  // sp.tur: the turn being played: { lag, spiller, ord (on the card, or null), riktige: [{ i, ok }],
  //   pass, angre ({ t: "r" } | { t: "p", i } | null), slutt ("" | "tid" | "tom") }.

  function stokk(liste, rng) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  }
  const alleOrd = (n) => Array.from({ length: n }, (_, i) => i);

  const Hatt = {
    // A new game: antall words, lag = the players of each team (arrays of player indexes).
    nytt(antall, lag, rng) {
      return {
        hatt: stokk(alleOrd(antall), rng),
        runde: 1,
        poeng: lag.map(() => [0, 0, 0]),
        lag: lag.map((l) => l.slice()),
        lagNr: 0, // the team whose turn is next
        peker: lag.map(() => 0), // per team: how many turns it has had (picks the explainer)
        turer: 0,
        tur: null,
        ferdig: false,
      };
    },
    // Who explains next: the teams take turns, and within a team the players take turns.
    forklarer(sp) {
      const l = sp.lag[sp.lagNr];
      return { lag: sp.lagNr, spiller: l[sp.peker[sp.lagNr] % l.length] };
    },
    startTur(sp) {
      const f = Hatt.forklarer(sp);
      sp.tur = { lag: f.lag, spiller: f.spiller, ord: null, riktige: [], pass: 0, angre: null, slutt: "" };
      Hatt.trekk(sp);
      return sp.tur;
    },
    trekk(sp) {
      const t = sp.tur;
      t.ord = sp.hatt.length ? sp.hatt.shift() : null;
      if (t.ord === null) {
        t.slutt = "tom";
        t.angre = null;
      }
    },
    riktig(sp) {
      const t = sp.tur;
      if (!t || t.slutt || t.ord === null) return false;
      t.riktige.push({ i: t.ord, ok: true });
      t.angre = { t: "r" };
      Hatt.trekk(sp);
      return true;
    },
    // A pass puts the word at the bottom of the hat. The last word in the hat can't be passed.
    kanPasse(sp, maks) {
      const t = sp.tur;
      return !!t && !t.slutt && t.ord !== null && t.pass < maks && sp.hatt.length > 0;
    },
    pass(sp, maks) {
      if (!Hatt.kanPasse(sp, maks)) return false;
      const t = sp.tur;
      sp.hatt.push(t.ord);
      t.pass++;
      t.angre = { t: "p", i: t.ord };
      Hatt.trekk(sp);
      return true;
    },
    // Takes back the last «Riktig» or «Pass» while the clock runs: that word is on the card again.
    angre(sp) {
      const t = sp.tur;
      if (!t || t.slutt || !t.angre) return false;
      const a = t.angre;
      if (t.ord !== null) sp.hatt.unshift(t.ord);
      let w;
      if (a.t === "r") w = t.riktige.pop().i;
      else {
        sp.hatt.splice(sp.hatt.lastIndexOf(a.i), 1);
        t.pass--;
        w = a.i;
      }
      t.ord = w;
      t.angre = null;
      return true;
    },
    // Time is up: the word on the card goes back in the hat.
    tidUte(sp) {
      const t = sp.tur;
      if (!t || t.slutt) return false;
      if (t.ord !== null) sp.hatt.push(t.ord);
      t.ord = null;
      t.slutt = "tid";
      t.angre = null;
      return true;
    },
    // After the turn, a word marked wrong in the list goes back in the hat (and gives no point).
    veksle(sp, k) {
      const t = sp.tur;
      if (!t || !t.slutt || !t.riktige[k]) return false;
      t.riktige[k].ok = !t.riktige[k].ok;
      return true;
    },
    // The turn is over and checked: points, words back in the hat (shuffled), the next team. When
    // the hat is empty the round is over: all the words go back in, or after round 3 the game ends.
    avsluttTur(sp, rng) {
      const t = sp.tur;
      if (!t || !t.slutt) return null;
      const ok = t.riktige.filter((r) => r.ok).map((r) => r.i);
      const tilbake = t.riktige.filter((r) => !r.ok).map((r) => r.i);
      const runde = sp.runde;
      sp.poeng[t.lag][runde - 1] += ok.length;
      sp.hatt = stokk(sp.hatt.concat(tilbake), rng);
      sp.peker[t.lag]++;
      sp.lagNr = (sp.lagNr + 1) % sp.lag.length;
      sp.turer++;
      sp.tur = null;
      let rundeFerdig = false;
      if (!sp.hatt.length) {
        rundeFerdig = true;
        if (runde >= RUNDER.length) sp.ferdig = true;
        else {
          sp.runde = runde + 1;
          sp.hatt = stokk(alleOrd(sp.ord ? sp.ord.length : sp.antallOrd), rng);
        }
      }
      return { lag: t.lag, spiller: t.spiller, poeng: ok.length, runde, rundeFerdig };
    },
    sum: (sp, lag) => sp.poeng[lag].reduce((a, b) => a + b, 0),
  };

  const R = window.Rusj;
  if (!R) {
    window.Hatten = { Hatt, RUNDER, stokk };
    return;
  }

  // ---------- With the kit: the game ----------

  const esc = R.esc;
  const KAT = window.RUSJ_DATA.ord.kategorier;
  const ALLE = [];
  KAT.forEach((k) => k.ord.forEach((o) => ALLE.push(o)));
  const kortstokk = R.kortstokk("ord", ALLE.length);

  const ANTALL_ORD = [30, 40, 50];
  const PER_SPILLER = [3, 4, 5];
  const TIDER = [30, 45, 60];
  const PASS = [
    [0, R.t("Ingen")],
    [1, "1"],
    [2, "2"],
    [99, R.t("Fritt")],
  ];
  const MIN = 4;
  const MAKS = 20;
  const MAKS_TEGN = 30; // a typed word
  const KORTFARGE = ["rosa", "lampe", "himmel", "mynte"];
  const lagNavn = (i) => R.lagNavn(i);
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const SIST = "hatten.sist";
  // The address of this game in the edition (the share text links to it).
  const ADRESSE = location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "hatten") + "/";
  // A sentence with a bold name in it: the text is escaped first, the name gets its markup after.
  const medFet = (tekst, navn) => esc(tekst).replace("{navn}", `<b>${esc(navn)}</b>`);

  let H; // the actions, so one action can reuse another
  let startetNa = false; // the turn screen was entered from the countdown: start the clock
  let opptatt = false; // a card is flying out or the countdown runs: ignore extra taps
  let poppTeller = false; // the next draw makes the counter pop
  let feireNa = false; // the end screen was entered from the game just now: fanfare
  let feireRunde = false; // the round-over screen was entered from the turn just now: fanfare

  const navnPa = (sp, i) => (sp.navn && sp.navn[i]) || R.t("Spiller {n}", { n: i + 1 });
  const runde = (sp) => RUNDER[Math.min(sp.runde, RUNDER.length) - 1];
  const rundeTittel = (sp) => R.t("Runde {n} av {av}", { n: sp.runde, av: 3 });

  // ---------- Setup: teams ----------

  // o.fordeling[i] = the team of player i. New players join the smallest team.
  function ordneLag(S) {
    const o = S.oppsett;
    const n = R.klamp(S.antall || MIN, MIN, MAKS);
    o.lag = R.klamp(o.lag, 2, Math.min(4, Math.floor(n / 2)));
    o.fordeling = (Array.isArray(o.fordeling) ? o.fordeling : []).slice(0, n).map((l) => (Number.isInteger(l) && l >= 0 && l < o.lag ? l : -1));
    for (let i = 0; i < n; i++) {
      if (o.fordeling[i] >= 0) continue;
      const str = Array.from({ length: o.lag }, (_, l) => o.fordeling.filter((x) => x === l).length);
      o.fordeling[i] = str.indexOf(Math.min(...str));
    }
  }
  const lagMedlemmer = (S) => Array.from({ length: S.oppsett.lag }, (_, l) => S.oppsett.fordeling.map((x, i) => (x === l ? i : -1)).filter((i) => i >= 0));
  function hindring(S) {
    ordneLag(S);
    if (lagMedlemmer(S).some((m) => m.length < 2)) return R.t("Hvert lag trenger minst to spillere.");
    return "";
  }
  function lageneHtml(S) {
    const o = S.oppsett;
    const kol = lagMedlemmer(S).map(
      (m, l) => `<div class="ha-lagkol" style="--lf: ${R.LAG[l].farge}">
        <h3>${esc(R.LAG[l].navn)} <span>${m.length}</span></h3>
        ${
          m
            .map(
              (i) =>
                `<button class="ha-lagspiller" data-h="bytt-lag" data-v="${i}" aria-label="${esc(R.t("{navn} – flytt til {lag}", { navn: R.navn(i), lag: lagNavn((o.fordeling[i] + 1) % o.lag) }))}">${R.avatar(i)}<span>${esc(R.navn(i))}</span></button>`,
            )
            .join("") || `<p class="hjelp">${esc(R.t("Ingen ennå"))}</p>`
        }
      </div>`,
    );
    return `<div class="ha-lagene k${o.lag}">${kol.join("")}</div>`;
  }

  // ---------- Pieces ----------

  // Big word: the font shrinks with the longest word so it always fits on one line per word.
  function ordHtml(o) {
    const lengste = Math.max(6, ...String(o).split(/\s+/).map((d) => d.length));
    return `<span class="ha-ordet" style="--tegn: ${lengste}">${esc(o)}</span>`;
  }
  const ordTekst = (sp, i) => String(sp.ord[i] == null ? "" : sp.ord[i]);
  const lagPrikk = (l) => `<i class="ha-prikk" style="--lf: ${R.LAG[l].farge}" aria-hidden="true"></i>`;

  // The three rounds as three small steps (done, now, later).
  function rundeSteg(sp) {
    return `<ol class="ha-steg" aria-label="${esc(rundeTittel(sp))}">${RUNDER.map(
      (r, k) => `<li class="${k + 1 < sp.runde ? "ferdig" : k + 1 === sp.runde ? "na" : ""}"><span aria-hidden="true">${r.ikon}</span>${esc(r.navn)}</li>`,
    ).join("")}</ol>`;
  }
  function stilling(sp) {
    return `<ul class="ha-stilling k${sp.lag.length}" aria-label="${esc(R.t("Poeng"))}">${sp.lag
      .map((_, l) => `<li style="--lf: ${R.LAG[l].farge}"><b>${Hatt.sum(sp, l)}</b><small>${esc(R.LAG[l].navn)}</small></li>`)
      .join("")}</ul>`;
  }
  const hattLinje = (sp) => `<p class="ha-hatt"><span aria-hidden="true">🎩</span> ${esc(R.t("{lapper} igjen av {n}", { lapper: R.flertall(sp.hatt.length + (sp.tur && sp.tur.ord !== null ? 1 : 0), "lapp", "lapper"), n: sp.ord.length }))}</p>`;

  // ---------- The clock ----------

  const klokke = () => R.timer("ha-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const t = sp.tur;
    const k = new R.Timer({
      id: "ha-tid",
      sekunder: Math.max(1, t.igjen),
      vedTikk: (sek) => {
        if (S.spill && S.spill.tur === t && !t.slutt) {
          t.igjen = sek;
          R.lagre();
        }
      },
      vedSlutt: () => tidUte(S, t),
    });
    k.total = sp.tid; // the ring shows the whole turn, also after a pause or reload
    return k;
  }
  function tidUte(S, t) {
    const sp = S.spill;
    if (!sp || sp.tur !== t || t.slutt) return;
    Hatt.tidUte(sp);
    t.igjen = 0;
    t.pause = false;
    R.si(R.t("Tiden er ute!"));
    if (S.skjerm === "tur") R.vis();
    else R.lagre();
  }
  function pause(S) {
    const t = S.spill && S.spill.tur;
    if (!t || t.slutt || t.pause) return;
    const k = klokke();
    if (k) {
      k.pause();
      t.igjen = Math.max(1, Math.ceil(k.igjen));
    }
    t.pause = true;
    if (S.skjerm === "tur") R.vis();
  }
  function fortsettTur(S) {
    const t = S.spill && S.spill.tur;
    if (!t || t.slutt) return;
    t.pause = false;
    const k = klokke() || lagKlokke(S);
    R.vis();
    k.start();
    R.holdVaken();
  }
  // A phone that is locked or switches app in the middle of a turn pauses it.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "tur") pause(S);
  });
  // The hat was emptied mid-turn: stop the clock, show the list.
  function tomHatt(S) {
    const k = klokke();
    if (k) k.stopp();
    R.lyd.fanfare();
    R.vibrer([40, 40, 80]);
    R.si(R.t("Hatten er tom!"));
  }

  async function svar(S, riktig, fraSveip) {
    const sp = S.spill;
    const t = sp && sp.tur;
    if (opptatt || !t || t.slutt || t.pause) return;
    if (!riktig && !Hatt.kanPasse(sp, sp.pass)) {
      if (fraSveip) R.vis(); // the card was swiped away: bring it back
      R.toast(sp.pass === 0 ? R.t("Pass er slått av i dette spillet.") : sp.hatt.length ? R.t("Ingen pass igjen denne turen.") : R.t("Siste lapp i hatten – den kan ikke passes."));
      return;
    }
    opptatt = true;
    const fortsatt = R.vakt();
    try {
      if (riktig) {
        R.lyd.riktig();
        R.vibrer(25);
        poppTeller = true;
      } else R.vibrer(10);
      if (!fraSveip && fortsatt()) await R.kastKort(riktig ? 1 : -1);
      if (t.slutt || t.pause) return; // the time ran out meanwhile
      if (riktig) {
        sp.stat.spiller[t.spiller] = (sp.stat.spiller[t.spiller] || 0) + 1;
        Hatt.riktig(sp);
      } else Hatt.pass(sp, sp.pass);
      if (t.slutt === "tom") tomHatt(S);
    } finally {
      opptatt = false;
    }
    if (fortsatt()) R.vis();
    else R.lagre();
  }

  // ---------- Ending ----------

  // Rows for the score list, the podium and the evening's scoreboard.
  const lagRader = (sp) => sp.lag.map((_, l) => ({ lag: l, poeng: Hatt.sum(sp, l) }));
  function ledere(sp) {
    const p = sp.lag.map((_, l) => Hatt.sum(sp, l));
    const maks = Math.max(...p);
    return maks > 0 ? p.map((x, l) => (x === maks ? l : -1)).filter((l) => l >= 0) : [];
  }
  // Exactly once per game: the evening's scoreboard, the statistics and the home screen's line.
  function avsluttSpill(S, tidlig) {
    const sp = S.spill;
    if (!sp || sp.ferdig === "lukket") return;
    sp.ferdig = "lukket";
    sp.tur = null;
    sp.angre = null;
    feireNa = true;
    R.slippVaken();
    R.statistikk("ferdig", { lag: sp.lag.length, ord: sp.ord.length, runde: sp.runde, turer: sp.turer, selv: sp.kilde === "selv", tidlig: !!tidlig });
    // With everyone's own names the players get the team's points; otherwise the teams do.
    if (sp.egneNavn) R.kveld.registrer(sp.lag.flatMap((m, l) => m.map((i) => ({ navn: navnPa(sp, i), poeng: Hatt.sum(sp, l) }))));
    else R.kveld.registrer(lagRader(sp));
    const topp = ledere(sp);
    R.skriv(SIST, { topp, poeng: sp.lag.map((_, l) => Hatt.sum(sp, l)) });
  }
  function sistLinje() {
    const s = R.les(SIST, null);
    if (!s || !Array.isArray(s.poeng) || !Array.isArray(s.topp) || s.poeng.length < 2 || s.poeng.length > 4) return "";
    const p = s.poeng.map((x) => Math.max(0, Math.floor(Number(x) || 0)));
    const topp = s.topp.filter((l) => Number.isInteger(l) && l >= 0 && l < p.length);
    const tall = p.slice().sort((a, b) => b - a).join("–");
    if (!topp.length) return "";
    return topp.length === 1 ? R.t("Sist: {lag} vant {tall}.", { lag: lagNavn(topp[0]), tall }) : R.t("Sist: {lag} delte seieren ({tall}).", { lag: R.ramsOpp(topp.map(lagNavn)), tall });
  }
  function delTekst(sp) {
    const topp = ledere(sp);
    const p = sp.lag.map((_, l) => Hatt.sum(sp, l));
    const tall = p.slice().sort((a, b) => b - a).join("–");
    const hvem = topp.length === 1 ? R.t("{lag} vant {tall}", { lag: lagNavn(topp[0]), tall }) : topp.length ? R.t("{lag} delte seieren ({tall})", { lag: R.ramsOpp(topp.map(lagNavn)), tall }) : R.t("Ingen fikk poeng");
    const etter = sp.runde >= 3 && sp.hatt.length === 0 ? R.t("tre runder") : R.t("runde {n}", { n: sp.runde });
    return R.t("{spill}: {hvem} etter {etter} med {n} ord. Forklar, ett ord, mim!", { spill: R.app.navn, hvem, etter, n: sp.ord.length });
  }

  // A new game from the setup («Fra rusj» draws its words now; «Skriv selv» asks the players first).
  function nyttSpill(S) {
    const o = S.oppsett;
    ordneLag(S);
    const n = R.klamp(S.antall || MIN, MIN, MAKS);
    const navn = Array.from({ length: n }, (_, i) => R.kutt(R.navn(i), 16));
    const egneNavn = Array.from({ length: n }, (_, i) => String(R.felles.navn[i] || "").trim()).every(Boolean);
    const sp = {
      kilde: o.kilde,
      tid: o.tid,
      pass: o.pass,
      navn,
      egneNavn,
      ord: [],
      skriv: null,
      fro: R.nyttFro(),
      stat: { spiller: Array(n).fill(0) },
      angre: null,
      rundeSlutt: null,
      skjerm: "tavle",
    };
    const lag = lagMedlemmer(S);
    if (o.kilde === "selv") {
      sp.skriv = { nr: 0, lister: Array.from({ length: n }, () => []) };
      Object.assign(sp, { lag, poeng: lag.map(() => [0, 0, 0]), runde: 1, hatt: [], tur: null, turer: 0, lagNr: 0, peker: lag.map(() => 0), ferdig: false });
      sp.skjerm = "skrivGi";
    } else {
      const valgt = new Set();
      for (let k = 0; k < o.ord; k++) {
        const i = kortstokk.neste((x) => !valgt.has(x));
        if (i < 0) break;
        valgt.add(i);
      }
      sp.ord = Array.from(valgt).map((i) => ALLE[i]);
      Object.assign(sp, Hatt.nytt(sp.ord.length, lag, R.rng(sp.fro)));
    }
    // The team that starts rotates from game to game.
    sp.lagNr = sp.fro % lag.length;
    return sp;
  }
  const rng = (sp) => R.rng((sp.fro + sp.turer * 7919 + sp.runde * 104729) >>> 0);

  // ---------- The game ----------

  R.start({
    id: "hatten",
    versjon: 1,
    liggende: true,
    pagar,

    tilstand: () => ({
      antall: 4,
      oppsett: { kilde: "rusj", lag: 2, ord: 40, per: 4, tid: 45, pass: 1, fordeling: [] },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ kilde: "rusj", lag: 2, ord: 40, per: 4, tid: 45, pass: 1, fordeling: [] }, S.oppsett));
      if (!["rusj", "selv"].includes(o.kilde)) o.kilde = "rusj";
      if (!ANTALL_ORD.includes(o.ord)) o.ord = 40;
      if (!PER_SPILLER.includes(o.per)) o.per = 4;
      if (!TIDER.includes(o.tid)) o.tid = 45;
      if (!PASS.some(([v]) => v === o.pass)) o.pass = 1;
      if (![2, 3, 4].includes(o.lag)) o.lag = 2;
      ordneLag(S);
      const sp = S.spill;
      if (!sp) return;
      const ok =
        Array.isArray(sp.navn) &&
        Array.isArray(sp.lag) &&
        sp.lag.length >= 2 &&
        sp.lag.length <= 4 &&
        sp.lag.every((m) => Array.isArray(m) && m.length >= 1 && m.every((i) => Number.isInteger(i) && i >= 0 && i < sp.navn.length)) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === sp.lag.length &&
        Array.isArray(sp.hatt) &&
        Array.isArray(sp.ord) &&
        Array.isArray(sp.peker) &&
        TIDER.includes(sp.tid) &&
        sp.runde >= 1 &&
        sp.runde <= 3 &&
        sp.stat &&
        Array.isArray(sp.stat.spiller);
      if (!ok) {
        S.spill = null;
        return;
      }
      sp.ord = sp.ord.map((x) => R.kutt(String(x), MAKS_TEGN));
      sp.hatt = sp.hatt.filter((i) => Number.isInteger(i) && i >= 0 && i < sp.ord.length);
      if (sp.skriv && !(Array.isArray(sp.skriv.lister) && sp.skriv.lister.length === sp.navn.length)) {
        S.spill = null;
        return;
      }
      const t = sp.tur;
      if (t && !(Array.isArray(t.riktige) && t.lag < sp.lag.length && (t.ord === null || (t.ord >= 0 && t.ord < sp.ord.length)))) sp.tur = null;
      if (!sp.tur && sp.skjerm === "tur") sp.skjerm = "tavle";
    },

    regler: {
      intro: R.t("Alle ordene ligger i hatten. Lagene bytter på å forklare – og de samme ordene brukes i tre runder."),
      steg: [
        [R.t("Runde 1: Forklar"), R.t("Forklar med så mange ord du vil, men ikke si ordet. Laget ditt gjetter så mange lapper som mulig før tiden er ute.")],
        [R.t("Runde 2: Ett ord"), R.t("De samme ordene igjen – nå får du bare si ett ord per lapp. Dere husker dem fra runde 1!")],
        [R.t("Runde 3: Mim"), R.t("De samme ordene en siste gang, uten ord og uten lyder. Bare kroppen.")],
      ],
      tips: [
        R.t("Eksempel: Lappen er «Isbjørn». Runde 1: «Stort, hvitt dyr som bor på Svalbard.» Runde 2: «Svalbard!» Runde 3: du mimer store poter og en iskald vind."),
        R.t("«Riktig» gir laget ett poeng. «Pass» legger lappen tilbake i hatten – den kommer igjen senere."),
        R.t("Lappene du ikke rekker, går videre til neste lag. Runden er over når hatten er tom."),
        R.t("Sveip kortet: høyre er riktig, venstre er pass."),
        R.t("Skriv selv: alle skriver noen ord i hemmelighet før spillet. Velg ting alle i rommet kjenner."),
        R.t("Trykket noen feil? Rett det i lista etter turen."),
      ],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        const liste = sp && sp.skriv ? sp.skriv.lister[sp.skriv.nr] || [] : [];
        return {
          html: `<span class="ha-mine">${liste.map((o) => `<b>${esc(o)}</b>`).join("")}</span>`,
          si: liste.length ? R.t("Ordene dine: {ord}.", { ord: R.ramsOpp(liste) }) : R.t("Ingen ord ennå."),
          klasse: "ha-mappe-bak",
        };
      },
    },

    vedSpillere(S) {
      ordneLag(S);
    },

    skjema: {
      // «Skriv selv»: one word into the hat.
      nyttord(S, form) {
        const sp = S.spill;
        if (!sp || !sp.skriv) return;
        const felt = form.querySelector("input");
        const ord = R.kutt(String(felt.value || "").replace(/\s+/g, " ").trim(), MAKS_TEGN);
        const liste = sp.skriv.lister[sp.skriv.nr];
        if (!ord) return;
        if (liste.length >= S.oppsett.per) return;
        if (liste.some((x) => R.normaliser(x) === R.normaliser(ord))) {
          R.toast(R.t("Det ordet har du allerede skrevet."));
          return;
        }
        liste.push(ord.charAt(0).toLocaleUpperCase("nb") + ord.slice(1));
        felt.value = "";
        R.lyd.pop();
        R.vibrer(15);
        R.si(R.t("{n} av {av} ord i hatten.", { n: liste.length, av: S.oppsett.per }));
        R.vis();
        if (liste.length < S.oppsett.per) {
          const f = R.$("#ha-ord");
          if (f) f.focus();
        }
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const sist = sistLinje();
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Forklar, si ett ord, mim."))}<br><em>${esc(R.t("De samme ordene – tre runder."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? (sp.skriv ? R.t("Fortsett · ord i hatten") : R.t("Fortsett · runde {n}", { n: sp.runde })) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (sist ? `<p class="hjelp ha-sist">${esc(sist)}</p>` : ""),
            }),
            merker: [
              ["4–20", R.t("spillere")],
              ["3", R.t("runder")],
              [R.tall(ALLE.length), R.t("ord")],
            ],
          });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = R.klamp(S.antall || MIN, MIN, MAKS);
          const hind = hindring(S);
          const selv = o.kilde === "selv";
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor kommer ordene fra?"))}</h2>
              ${R.ui.fliser(
                "kilde",
                [
                  { v: "rusj", tittel: R.t("Fra rusj"), tekst: R.t("{n} kjente ord", { n: R.tall(ALLE.length) }), ikon: "🎩" },
                  { v: "selv", tittel: R.t("Skriv selv"), tekst: R.t("Alle skriver ord i hemmelighet"), ikon: "✍️" },
                ],
                o.kilde,
              )}
            </section>
            ${R.ui.spillere({ min: MIN, max: MAKS, tittel: R.t("Hvem spiller?") })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Lagene"))}</h2><button class="lenke" data-h="stokk-lag">🔀 ${esc(R.t("Stokk lagene"))}</button></div>
              ${R.ui.seg("lag", [2, 3, 4].map((x) => [x, R.t("{n} lag", { n: x })]), o.lag, { etikett: R.t("Antall lag"), av: (v) => Number(v) * 2 > n })}
              ${lageneHtml(S)}
              <p class="hjelp">${esc(R.t("Trykk på et navn for å bytte lag."))}</p>
            </section>
            <div class="ha-to">
              ${
                selv
                  ? `<section class="seksjon"><h2>${esc(R.t("Ord per spiller"))}</h2>${R.ui.seg("per", PER_SPILLER.map((x) => [x, String(x)]), o.per, { etikett: R.t("Ord per spiller") })}<p class="hjelp">${esc(R.t("{ord} i hatten.", { ord: R.flertall(n * o.per, "ord", "ord") }))}</p></section>`
                  : `<section class="seksjon"><h2>${esc(R.t("Antall ord"))}</h2>${R.ui.seg("ord", ANTALL_ORD.map((x) => [x, String(x)]), o.ord, { etikett: R.t("Antall ord i hatten") })}</section>`
              }
              <section class="seksjon"><h2>${esc(R.t("Tid per tur"))}</h2>${R.ui.seg("tid", TIDER.map((x) => [x, R.t("{n} s", { n: x })]), o.tid, { etikett: R.t("Tid per tur") })}</section>
            </div>
            <section class="seksjon">
              <h2>${esc(R.t("Pass per tur"))}</h2>
              ${R.ui.seg("pass", PASS, o.pass, { etikett: R.t("Pass per tur") })}
              <p class="hjelp">${esc(R.t("Et pass legger lappen tilbake i hatten."))}</p>
            </section>
            ${hind ? `<p class="hjelp ha-advarsel" id="ha-hindring">${esc(hind)}</p>` : ""}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !!hind }))}`;
        },
      },

      // «Skriv selv»: the phone goes round, one player at a time.
      skrivGi: {
        tittel: R.t("Ord i hatten"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const nr = sp.skriv.nr;
          return `
            ${R.ui.fremdrift(sp.navn.length, nr)}
            <div class="gi-til">
              <span class="gi-til-avatar">${R.avatar(nr, "gigant")}</span>
              <p class="etikett">${esc(R.t("Gi mobilen til"))}</p>
              <h1 id="skjerm-tittel">${esc(navnPa(sp, nr))}</h1>
              <p class="ikke-se">🙈 ${esc(R.t("De andre ser bort – ordene er hemmelige"))}</p>
            </div>
            ${R.ui.dokk(R.ui.knapp(R.t("Jeg er {navn}", { navn: navnPa(sp, nr) }), "skriv-klar"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          S.spill.skjerm = "skrivGi";
        },
      },

      skriv: {
        tittel: R.t("Ord i hatten"),
        tilbake: "hjem",
        gjenoppta: "skrivGi", // never show someone's words after a reload
        vis(S) {
          const sp = S.spill;
          const per = S.oppsett.per;
          const liste = sp.skriv.lister[sp.skriv.nr];
          const fullt = liste.length >= per;
          const lapper = Array.from({ length: per }, (_, k) => `<li class="${k < liste.length ? "fylt" : ""}"><span aria-hidden="true">${k < liste.length ? "✓" : k + 1}</span></li>`).join("");
          return `
            <div class="ha-skriv-topp">
              <p class="etikett">${esc(navnPa(sp, sp.skriv.nr))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Skriv {n} ord", { n: per }))}</h1>
              <p class="ingress">${esc(R.t("Ting, steder, dyr eller kjente figurer – noe alle i rommet kjenner."))}</p>
            </div>
            <form class="ha-skriv" data-skjema="nyttord" autocomplete="off">
              <label class="vh" for="ha-ord">${esc(R.t("Et ord til hatten"))}</label>
              <input id="ha-ord" maxlength="${MAKS_TEGN}" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" placeholder="${esc(fullt ? R.t("Hatten har ordene dine") : R.t("F.eks. Isbjørn"))}"${fullt ? " disabled" : ""}>
              <button class="knapp lampe" type="submit"${fullt ? " disabled" : ""}>${esc(R.t("Legg i"))}</button>
            </form>
            <div class="ha-lapper-rad">
              <ul class="ha-lapper" aria-hidden="true">${lapper}</ul>
              <p class="ha-lapper-tekst" role="status">${esc(R.t("{n} av {av} ord", { n: liste.length, av: per }))}</p>
            </div>
            ${liste.length ? R.ui.mappe({ id: "mine", etikett: R.t("Ordene dine"), tekst: R.t("Hold fingeren på kortet for å se") }) : ""}
            ${R.ui.dokk(
              R.ui.knapp(fullt ? (sp.skriv.nr + 1 < sp.navn.length ? R.t("Ferdig – gi videre") : R.t("Ferdig – start spillet")) : R.t("Skriv {n} til", { n: per - liste.length }), "skriv-ferdig", { av: !fullt }),
              R.ui.lenkerad(liste.length ? R.ui.lenke(R.t("Angre siste ord"), "skriv-angre") : "", R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "skriv";
        },
      },

      // Between turns: the round, the score, and who explains next (the pass-the-phone gate).
      tavle: {
        tittel: (S) => rundeTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const f = Hatt.forklarer(sp);
          const r = runde(sp);
          const forste = sp.hatt.length === sp.ord.length;
          return `
            <div class="ha-runde">
              ${rundeSteg(sp)}
              <p class="ha-regel"><span aria-hidden="true">${r.ikon}</span> ${esc(r.regel)}</p>
            </div>
            ${stilling(sp)}
            ${hattLinje(sp)}
            <div class="ha-gi" style="--lf: ${R.LAG[f.lag].farge}">
              <span class="ha-gi-avatar">${R.avatar(f.spiller, "stor")}</span>
              <p class="etikett">${esc(forste && sp.runde === 1 ? R.t("{lag} · først ut", { lag: lagNavn(f.lag) }) : R.t("{lag} · gi mobilen til", { lag: lagNavn(f.lag) }))}</p>
              <h1 id="skjerm-tittel">${esc(navnPa(sp, f.spiller))}</h1>
              <p class="ha-gi-tekst">${esc(R.t("Bare {navn} ser lappene. Resten av {lag} gjetter.", { navn: navnPa(sp, f.spiller), lag: lagNavn(f.lag) }))}</p>
            </div>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Start turen · {n} s", { n: sp.tid }), "start-tur"),
              R.ui.lenkerad(sp.angre ? R.ui.lenke(R.t("Angre"), "angre-tur") : "", R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "tavle";
        },
      },

      tur: {
        tittel: (S) => rundeTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const t = sp.tur;
          if (t.slutt) return oppsummering(sp, t);
          if (t.pause || (!startetNa && !klokke())) return status(sp, t) + pauseVis(sp, t);
          const r = runde(sp);
          const igjen = sp.pass >= 99 ? null : Math.max(0, sp.pass - t.pass);
          const kanPasse = Hatt.kanPasse(sp, sp.pass);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{navn} forklarer", { navn: navnPa(sp, t.spiller) }))}</h1>
            ${status(sp, t)}
            <div style="--bunke: ${R.LAG[t.lag].farge}">${R.ui.storkort({
              etikett: `${r.ikon} ${r.navn}`,
              nr: R.t("{n} igjen", { n: sp.hatt.length + 1 }),
              tekstHtml: ordHtml(ordTekst(sp, t.ord)),
              fotHtml: `<span class="ha-hint">${esc(r.kort)}</span>`,
              klasse: "ha-kort " + KORTFARGE[t.lag],
              sveip: "sveip",
            })}</div>
            <p class="sveip-hint" aria-hidden="true">← ${esc(R.t("Pass"))} · ${esc(R.t("Riktig"))} →</p>
            ${R.ui.dokk(
              `<div class="ha-svar">${R.ui.knapp(igjen === null ? R.t("Pass") : kanPasse ? R.t("Pass ({n})", { n: igjen }) : R.t("Ingen pass"), "pass", { variant: "papir", stille: true, av: !kanPasse })}${R.ui.knapp(`${R.t("Riktig")} ✓`, "riktig", { variant: "mynte", stille: true })}</div>`,
              R.ui.lenkerad(t.angre ? R.ui.lenke(R.t("Angre"), "angre-ord") : "", R.ui.lenke(R.t("Pause"), "pause")),
            )}`;
        },
        etter() {
          poppTeller = false;
          const k = klokke();
          if (k) k.tegn();
        },
        inn(S) {
          const sp = S.spill;
          const t = sp.tur;
          sp.skjerm = "tur";
          const fersk = startetNa;
          startetNa = false;
          if (t.slutt) return;
          const k = lagKlokke(S);
          if (fersk && !t.pause) {
            k.start();
            R.holdVaken();
          } else {
            t.pause = true;
            R.vis();
          }
        },
        ut(S) {
          const t = S.spill && S.spill.tur;
          const k = klokke();
          if (t && k && !t.slutt) {
            t.igjen = Math.max(1, Math.ceil(k.igjen));
            t.pause = true;
          }
        },
      },

      // The hat is empty: the round is over. All the words go back in for the next round.
      rundeslutt: {
        tittel: R.t("Ny runde"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ferdig = sp.rundeSlutt || sp.runde - 1;
          const neste = runde(sp);
          const rader = sp.lag.map((_, l) => ({ lag: l, poeng: Hatt.sum(sp, l), pluss: sp.poeng[l][ferdig - 1] || 0 }));
          return `
            <div class="ha-tom">
              <p class="etikett">${esc(R.t("Runde {n} av {av} er ferdig", { n: ferdig, av: 3 }))}</p>
              <h1 id="skjerm-tittel" class="stempel ha-stempel">${esc(R.t("Hatten er tom!"))}</h1>
            </div>
            ${R.ui.poengliste(rader)}
            <div class="papirboks ha-neste">
              <p class="etikett">${esc(R.t("Neste: runde {n} av {av}", { n: sp.runde, av: 3 }))}</p>
              <h2><span aria-hidden="true">${neste.ikon}</span> ${esc(neste.navn)}</h2>
              <p>${esc(neste.regel)} ${esc(R.t("Alle {n} lappene er tilbake i hatten.", { n: sp.ord.length }))}</p>
            </div>
            ${R.ui.dokk(R.ui.knapp(R.t("Videre til runde {n}", { n: sp.runde }), "til-tavle"), R.ui.lenkerad(sp.angre ? R.ui.lenke(R.t("Angre"), "angre-tur") : "", R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          S.spill.skjerm = "rundeslutt";
          if (!feireRunde) return;
          feireRunde = false;
          R.lyd.fanfare();
          R.konfetti(["--lampe", "--rosa", "--himmel", "--mynte"]);
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = ledere(sp);
          const p = sp.lag.map((_, l) => Hatt.sum(sp, l));
          const sortert = p.slice().sort((a, b) => b - a);
          let banner;
          const vinner = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(topp.map(lagNavn)), n: topp.length });
          if (topp.length === 1) banner = R.ui.banner({ etikett: R.t("Kåringen"), tittel: vinner, tekst: R.t("{poeng} – {n} foran nærmeste lag.", { poeng: R.flertall(p[topp[0]], "poeng", "poeng"), n: sortert[0] - sortert[1] }) });
          else if (topp.length > 1) banner = R.ui.banner({ etikett: R.t("Delt seier"), tittel: vinner, tekst: R.t("Likt på {poeng}. Godt jobba!", { poeng: R.flertall(p[topp[0]], "poeng", "poeng") }) });
          else banner = R.ui.banner({ etikett: R.t("Kåringen"), tittel: R.t("Ingen fikk poeng"), tekst: R.t("Neste gang tar dere av!"), stemning: "lei" });
          const beste = sp.stat.spiller.reduce((b, x, i) => (x > (b ? sp.stat.spiller[b.i] : 0) ? { i } : b), null);
          const tabell = `<table class="ha-tabell">
              <caption class="vh">${esc(R.t("Poeng per runde"))}</caption>
              <thead><tr><th scope="col">${esc(R.t("Lag"))}</th>${RUNDER.map((r, k) => `<th scope="col"><span aria-hidden="true">${r.ikon}</span><span class="vh">${esc(R.t("Runde {n}, {navn}", { n: k + 1, navn: r.navn }))}</span></th>`).join("")}<th scope="col">${esc(R.t("Sum"))}</th></tr></thead>
              <tbody>${sp.lag
                .map(
                  (m, l) =>
                    `<tr class="${topp.includes(l) ? "leder" : ""}"><th scope="row">${lagPrikk(l)}<span class="ha-lagnavn">${esc(R.LAG[l].navn)}</span>${
                      sp.egneNavn ? `<small>${esc(R.ramsOpp(m.map((i) => navnPa(sp, i))))}</small>` : ""
                    }</th>${sp.poeng[l].map((x, k) => `<td>${k < sp.runde || x ? x : "–"}</td>`).join("")}<td><b>${p[l]}</b></td></tr>`,
                )
                .join("")}</tbody>
            </table>`;
          return `
            ${banner}
            ${R.ui.pall(lagRader(sp))}
            ${tabell}
            ${beste ? `<p class="hjelp ha-beste">${medFet(R.t("Beste forklarer: {navn} med {lapper}.", { navn: "{navn}", lapper: R.flertall(sp.stat.spiller[beste.i], "riktig lapp", "riktige lapper") }), navnPa(sp, beste.i))}</p>` : ""}
            ${topp.length ? `<div class="ha-del">${R.ui.knapp2(R.t("Del kåringen"), "del")}</div>` : ""}
            ${R.ui.flereSpill({ antall: sp.navn.length })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.ferdig !== "lukket") avsluttSpill(S, false);
          sp.skjerm = "slutt";
          R.lagre();
          if (!feireNa) return;
          feireNa = false;
          if (ledere(sp).length) {
            R.lyd.fanfare();
            R.konfetti(["--rosa", "--lampe", "--himmel", "--mynte", "--aksent"]);
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const iGang = pagar(S);
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang)) || !fortsatt()) return;
        if (iGang) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S)) return;
        R.holdVaken();
        if (sp.skriv) return R.gaTil("skrivGi");
        if (sp.tur) return R.gaTil("tur");
        R.gaTil(sp.skjerm === "rundeslutt" && sp.rundeSlutt ? "rundeslutt" : "tavle");
      },
      // While a turn runs, the rules sheet pauses the clock first.
      regler(el, e, S) {
        if (S.skjerm === "tur") pause(S);
        R.visRegler();
      },
      kilde(el, e, S) {
        S.oppsett.kilde = el.dataset.v === "selv" ? "selv" : "rusj";
        R.vis();
      },
      lag(el, e, S) {
        const o = S.oppsett;
        o.lag = Number(el.dataset.v);
        o.fordeling = []; // deal the players out again, round the teams
        ordneLag(S);
        R.vis();
      },
      "bytt-lag"(el, e, S) {
        const o = S.oppsett;
        const i = Number(el.dataset.v);
        ordneLag(S);
        if (!(i >= 0 && i < o.fordeling.length)) return;
        o.fordeling[i] = (o.fordeling[i] + 1) % o.lag;
        R.lyd.klikk();
        R.vis();
      },
      "stokk-lag"(el, e, S) {
        const o = S.oppsett;
        ordneLag(S);
        const n = o.fordeling.length;
        const rekke = R.stokk(Array.from({ length: n }, (_, i) => i));
        o.fordeling = Array(n);
        rekke.forEach((i, k) => (o.fordeling[i] = k % o.lag));
        R.lyd.snu();
        R.vis();
      },
      ord(el, e, S) {
        S.oppsett.ord = Number(el.dataset.v);
        R.vis();
      },
      per(el, e, S) {
        S.oppsett.per = Number(el.dataset.v);
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      pass(el, e, S) {
        // The same name serves the setup (data-v = the number) and the turn (no data-v).
        if (S.skjerm === "tur") return svar(S, false, false);
        S.oppsett.pass = Number(el.dataset.v);
        R.vis();
      },
      async start(el, e, S) {
        if (hindring(S)) return R.vis();
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = nyttSpill(S);
        R.statistikk("start", { lag: S.spill.lag.length, spillere: S.spill.navn.length, ord: S.oppsett.kilde === "selv" ? S.spill.navn.length * S.oppsett.per : S.spill.ord.length, tid: S.spill.tid, selv: S.oppsett.kilde === "selv" });
        R.holdVaken();
        R.gaTil(S.spill.skriv ? "skrivGi" : "tavle");
      },

      // ----- «Skriv selv» -----
      "skriv-klar"(el, e, S) {
        if (S.spill && S.spill.skriv) R.gaTil("skriv");
      },
      "skriv-angre"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.skriv) return;
        const liste = sp.skriv.lister[sp.skriv.nr];
        if (!liste.length) return;
        liste.pop();
        R.lyd.snu();
        R.vis();
      },
      "skriv-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.skriv) return;
        if (sp.skriv.lister[sp.skriv.nr].length < S.oppsett.per) return;
        R.lyd.pling();
        if (sp.skriv.nr + 1 < sp.navn.length) {
          sp.skriv.nr++;
          R.gaTil("skrivGi");
          return;
        }
        // Everyone has written: the words go into the hat, in an order nobody knows.
        sp.ord = sp.skriv.lister.flat();
        const lagNr = sp.lagNr;
        Object.assign(sp, Hatt.nytt(sp.ord.length, sp.lag, R.rng(sp.fro)));
        sp.lagNr = lagNr;
        sp.skriv = null;
        R.toast(R.t("Alle {n} ordene er i hatten!", { n: sp.ord.length }));
        R.gaTil("tavle");
      },

      // ----- A turn -----
      async "start-tur"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || sp.tur || opptatt) return;
        opptatt = true;
        R.holdVaken();
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", runde(sp).kjor], 750);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp || sp.tur) return;
        Hatt.startTur(sp);
        sp.tur.igjen = sp.tid;
        sp.tur.pause = false;
        sp.angre = null;
        startetNa = true;
        R.gaTil("tur");
      },
      riktig: (el, e, S) => svar(S, true, false),
      sveip: (el, e, S) => svar(S, el.dataset.retning === "hoyre", true),
      "angre-ord"(el, e, S) {
        const sp = S.spill;
        if (opptatt || !sp || !sp.tur || sp.tur.pause) return;
        const a = sp.tur.angre;
        if (!Hatt.angre(sp)) return;
        if (a.t === "r") sp.stat.spiller[sp.tur.spiller] = Math.max(0, (sp.stat.spiller[sp.tur.spiller] || 0) - 1);
        R.lyd.snu();
        R.vis();
      },
      pause: (el, e, S) => (S.skjerm === "tur" ? pause(S) : undefined),
      "fortsett-tur": (el, e, S) => fortsettTur(S),
      // Correct a tap in the list after the turn: ✓ ↔ back in the hat.
      veksle(el, e, S) {
        const sp = S.spill;
        const t = sp && sp.tur;
        const k = Number(el.dataset.v);
        if (!t || !Hatt.veksle(sp, k)) return;
        sp.stat.spiller[t.spiller] = Math.max(0, (sp.stat.spiller[t.spiller] || 0) + (t.riktige[k].ok ? 1 : -1));
        if (t.riktige[k].ok) R.lyd.pop();
        R.vis();
      },
      // Count the turn. «Angre» on the next screen puts it back the way it was.
      "tur-ferdig"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.tur || !sp.tur.slutt) return;
        const { angre, ...uten } = sp;
        const kopi = JSON.parse(JSON.stringify(uten));
        const res = Hatt.avsluttTur(sp, rng(kopi));
        sp.angre = kopi;
        if (sp.ferdig) {
          avsluttSpill(S, false);
          R.gaTil("slutt");
        } else if (res.rundeFerdig) {
          sp.rundeSlutt = res.runde;
          feireRunde = true;
          R.gaTil("rundeslutt");
        } else R.gaTil("tavle");
      },
      "angre-tur"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.angre || sp.tur) return;
        const kopi = sp.angre;
        Object.keys(sp).forEach((k) => delete sp[k]);
        Object.assign(sp, kopi);
        sp.angre = null;
        R.lyd.snu();
        R.gaTil("tur");
      },
      "til-tavle"(el, e, S) {
        if (!S.spill) return;
        S.spill.rundeSlutt = null;
        S.spill.angre = null;
        R.gaTil("tavle");
      },
      // «Avslutt»: the team in the lead wins. A turn that is still running doesn't count.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        if (S.skjerm === "tur") pause(S);
        // From the list after a turn, that turn counts; a turn that is still running doesn't.
        const iSjekk = !!(sp.tur && sp.tur.slutt);
        const harPoeng = sp.lag.some((_, l) => Hatt.sum(sp, l) > 0) || (iSjekk && sp.tur.riktige.some((r) => r.ok));
        const tekst = sp.skriv
          ? R.t("Ordene dere har skrevet, forsvinner.")
          : !harPoeng
            ? R.t("Ingen har fått poeng ennå.")
            : sp.tur && !iSjekk
              ? R.t("Turen som pågår, teller ikke. Laget som leder, vinner.")
              : R.t("Laget som leder nå, vinner.");
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), tekst, R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        const k = klokke();
        if (k) k.stopp();
        if (iSjekk) Hatt.avsluttTur(sp, rng(sp));
        sp.tur = null;
        if (sp.skriv || !harPoeng) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        avsluttSpill(S, true);
        R.gaTil("slutt");
      },
      del(el, e, S) {
        if (S.spill && S.spill.ferdig) R.del(R.app.navn, delTekst(S.spill), ADRESSE);
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });

  // ---------- Pieces of the turn screen ----------

  function status(sp, t) {
    const n = t.riktige.length;
    return `<div class="ha-status">
      ${R.ui.timer({ id: "ha-tid", sekunder: t.igjen })}
      <div class="ha-status-lag">${lagPrikk(t.lag)}<span><b>${esc(navnPa(sp, t.spiller))}</b><small>${esc(R.t("{lag} gjetter", { lag: lagNavn(t.lag) }))}</small></span></div>
      <div class="ha-teller${poppTeller ? " popp" : ""}" role="img" aria-label="${esc(R.flertall(n, "riktig", "riktige"))}"><b>${n}</b><small>${esc(R.t("riktige"))}</small></div>
    </div>`;
  }

  function pauseVis(sp, t) {
    return `<div class="bunke" style="--bunke: ${R.LAG[t.lag].farge}"><article class="storkort ha-kort ha-pausekort">
        ${R.figur()}
        <h1 id="skjerm-tittel">${esc(R.t("Pause"))}</h1>
        <p class="ha-pause-tekst">${esc(R.t("Lappen er skjult. Fortsett når {navn} har mobilen.", { navn: navnPa(sp, t.spiller) }))}</p>
      </article></div>
      ${R.ui.dokk(R.ui.knapp(R.t("Fortsett"), "fortsett-tur"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
  }

  function oppsummering(sp, t) {
    const n = t.riktige.filter((r) => r.ok).length;
    const tom = t.slutt === "tom";
    return `
      <div class="ha-resultat" style="--lf: ${R.LAG[t.lag].farge}">
        <p class="stempel ha-stempel" aria-hidden="true">${esc(tom ? R.t("Hatten er tom!") : R.t("Tiden er ute!"))}</p>
        <p class="etikett">${esc(R.t("{lag} · {navn} forklarte", { lag: lagNavn(t.lag), navn: navnPa(sp, t.spiller) }))}</p>
        <h1 id="skjerm-tittel"><span class="vh">${esc(tom ? R.t("Hatten er tom!") : R.t("Tiden er ute!"))} </span><b>${n > 0 ? "+" : ""}${n}</b> ${esc(R.t("poeng|poeng", { n }))}</h1>
      </div>
      ${
        t.riktige.length
          ? `<section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Lappene"))}</h2><span class="tall">${esc(R.t("Trykk for å rette"))}</span></div>
              <ul class="ha-ordliste">${t.riktige
                .map(
                  (r, k) =>
                    `<li><button class="ha-ord" data-h="veksle" data-v="${k}" aria-pressed="${r.ok}"><i aria-hidden="true">${r.ok ? "✓" : "↩"}</i><span>${esc(ordTekst(sp, r.i))}</span><small>${r.ok ? "+1" : esc(R.t("tilbake i hatten"))}</small></button></li>`,
                )
                .join("")}</ul>
            </section>`
          : `<p class="hjelp">${esc(R.t("Ingen lapper denne gangen. Neste gang!"))}</p>`
      }
      ${tom ? `<p class="hjelp">${esc(sp.runde < 3 ? R.t("Runde {n} er ferdig når dere går videre.", { n: sp.runde }) : R.t("Det var siste runde – nå venter kåringen."))}</p>` : ""}
      ${R.ui.dokk(R.ui.knapp(tom && sp.runde >= 3 && t.riktige.every((r) => r.ok) ? R.t("Til kåringen") : R.t("Videre"), "tur-ferdig"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
  }
})();
