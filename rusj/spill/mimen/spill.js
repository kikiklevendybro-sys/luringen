/* Mimen — «Mimeleken» (charades).
   Hurtigmim (the main mode): the mimer keeps the phone in the hand like a card and mimes as many
   tasks as the others can guess before the time runs out — one tap per task («Riktig» or «Pass»),
   then a check list where a wrong tap is corrected.
   Én om gangen: one secret task per turn. The mimer holds the card on the hand-over screen to
   see it, starts the clock and mimes; the answer screen asks who guessed it. With two levels in
   play the card offers two tasks: the lighter one for one point, the harder one for two.
   Alle mot alle: in Hurtigmim the mimer gets a point for every task the table guessed; in Én om
   gangen the one who guessed first and the mimer get a point each.
   Lag mot lag: only the mimer's team guesses, and the team gets the points. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const KAT = window.RUSJ_DATA.oppgaver.kategorier;
  const katMedId = (id) => KAT.find((k) => k.id === id);

  // Every task in one list, so the deck remembers what this device has already shown.
  const ALLE = [];
  KAT.forEach((k) => k.oppgaver.forEach(([t, n]) => ALLE.push({ k: k.id, t, n })));
  const stokk = R.kortstokk("oppgaver", ALLE.length);

  // Jul is a seasonal extra: not in the standard selection, listed first while it is the season
  // (1 November – 6 January by the phone's date) and last the rest of the year.
  const JUL = "jul";
  const FASTE = KAT.filter((k) => k.id !== JUL).map((k) => k.id);
  const julesesong = (d) => {
    const na = d || new Date();
    return na.getMonth() >= 10 || (na.getMonth() === 0 && na.getDate() <= 6);
  };
  const katRekke = () => {
    const jul = katMedId(JUL);
    const faste = KAT.filter((k) => k.id !== JUL);
    if (!jul) return faste;
    return julesesong() ? [jul, ...faste] : [...faste, jul];
  };

  const NIVAER = [
    { v: 1, navn: "Lett", n: [1], tekst: "Lette oppgaver – fint når barna er med." },
    { v: 2, navn: "Middels", n: [1, 2], tekst: "Lette og middels oppgaver – passer for de fleste." },
    { v: 3, navn: "Vanskelig", n: [2, 3], tekst: "Middels og vanskelige – for drevne mimere." },
  ];
  const niva = (v) => NIVAER.find((x) => x.v === v) || NIVAER[1];
  const FORMER = ["hurtig", "en"];
  const MODUSER = ["alle", "lag"];
  const TIDER = { hurtig: [30, 60, 90], en: [45, 60, 90] };
  const RUNDER = { hurtig: { alle: [1, 2, 3], lag: [2, 3, 5] }, en: { alle: [1, 2, 3], lag: [3, 5, 8] } };
  const BYTT = 2; // Én om gangen: new task per turn when the mimer doesn't know the word
  const LAGDYP = ["var(--rosa-dyp)", "var(--lampe-dyp)", "var(--himmel-dyp)", "var(--mynte-dyp)"];
  const lagNavn = (i) => "Lag " + R.LAG[i].navn;

  let H; // the actions, so one action can reuse another
  let startetNa = false; // a clock screen was entered from the countdown: start the clock
  let opptatt = false; // the countdown runs: ignore extra taps
  let blink = ""; // Hurtigmim: flash the card on the next draw ("riktig" | "pass")
  let sistSvar = -1e9; // Hurtigmim: when the last task was answered
  let feire = false; // the end screen is entered from the game just now: fanfare
  let rekordTur = -1; // the turn whose new record has had its confetti

  const hurtig = (sp) => sp.form === "hurtig";
  const deltakere = (sp) => (sp.modus === "lag" ? sp.lag : sp.antall);
  // The first mimer rotates from game to game (sp.start); within a game the turn goes round.
  const mimer = (sp) => ((sp.start || 0) + sp.tur) % deltakere(sp);
  const nesteMimer = (sp) => ((sp.start || 0) + sp.tur + 1) % deltakere(sp);
  const rundeNr = (sp) => Math.floor(sp.tur / deltakere(sp)) + 1;
  const rundeTittel = (S) => `Runde ${rundeNr(S.spill)} av ${S.spill.runder}`;
  const navn = (sp, i) => (sp.modus === "lag" ? lagNavn(i) : R.navn(i));
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const sisteTur = (sp) => sp.tur + 1 >= sp.turer;
  const stjerner = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const stjerneHtml = (n) => `<span class="mi-stjerner" role="img" aria-label="Vanskelighet ${n} av 3">${stjerner(n)}</span>`;

  // ---------- Setup ----------

  const stdOppsett = () => ({
    form: "hurtig",
    modus: "alle",
    modusValgt: false, // until the group has chosen, nine or more players get «Lag mot lag» preselected
    lag: 2,
    runder: { hurtig: { alle: null, lag: null }, en: { alle: null, lag: null } }, // null: the default for the group's size
    tid: { hurtig: 60, en: 60 },
    niva: 2,
    kat: null, // null: every standard category (Jul is switched on by the group)
    lyder: false,
  });
  const valgteKat = (o) => o.kat || FASTE;
  // Sensible length by group size: 3–5 players mime twice each, 6–8 once; teams play a few rounds.
  const stdRunder = (form, modus, antall) => (modus === "lag" ? (form === "hurtig" ? 3 : 5) : antall <= 5 ? 2 : 1);
  function runderNa(S) {
    const o = S.oppsett;
    const v = o.runder[o.form][o.modus];
    return v != null ? v : stdRunder(o.form, o.modus, S.antall);
  }
  const antallNa = (S) => (S.oppsett.modus === "lag" ? S.oppsett.lag : R.klamp(S.antall, 3, 20));
  function estimat(S) {
    const o = S.oppsett;
    const turer = runderNa(S) * antallNa(S);
    // A Hurtigmim turn: the clock plus hand-over and check list. Én om gangen: about half the
    // clock is used on average, plus the hand-over, the card and the answer.
    const sek = o.form === "hurtig" ? o.tid.hurtig + 40 : o.tid.en / 2 + 30;
    return `${R.flertall(turer, "tur", "turer")} · ca. ${Math.max(2, Math.round((turer * sek) / 60))} min`;
  }
  // Nine or more around the table: teams keep everybody busy. Only until the group has chosen.
  function forvalg(S) {
    const o = S.oppsett;
    if (!o.modusValgt) o.modus = S.antall >= 9 ? "lag" : "alle";
  }
  function modusTekst(S) {
    const o = S.oppsett;
    if (o.modus === "lag") return `${o.modusValgt ? "" : "Dere er mange – da går det raskest med lag. "}Bare laget til mimeren gjetter, og poengene går til laget.`;
    return o.form === "hurtig" ? "Mimeren får ett poeng for hver oppgave de andre gjetter." : "Den som gjetter først, får ett poeng – og mimeren får ett.";
  }

  // ---------- Tasks ----------

  function filter(o) {
    const lov = new Set(niva(o.niva).n);
    const kat = new Set(valgteKat(o));
    return (i) => lov.has(ALLE[i].n) && kat.has(ALLE[i].k);
  }
  function tellOppgaver(o) {
    const f = filter(o);
    let n = 0;
    for (let i = 0; i < ALLE.length; i++) if (f(i)) n++;
    return n;
  }
  function tellKat(id, nivaV) {
    const lov = niva(nivaV).n;
    const k = katMedId(id);
    return k ? k.oppgaver.filter((o) => lov.includes(o[1])).length : 0;
  }
  function trekk(sp) {
    const i = stokk.neste(filter(sp));
    const o = ALLE[i >= 0 ? i : 0];
    return { t: o.t, k: o.k, n: o.n };
  }
  // A task of exactly this level within the chosen categories, or null.
  function trekkNiva(sp, n) {
    const kat = new Set(valgteKat(sp));
    const i = stokk.neste((j) => ALLE[j].n === n && kat.has(ALLE[j].k));
    return i >= 0 ? { t: ALLE[i].t, k: ALLE[i].k, n: ALLE[i].n } : null;
  }
  // Én om gangen. With two levels in play (middels, vanskelig) the mimer chooses between two
  // tasks: sp.valg = [the lighter one for 1 point, the harder one for 2]. Otherwise one task.
  function nyOppgave(sp) {
    const nivaer = niva(sp.niva).n;
    const lett = nivaer.length === 2 ? trekkNiva(sp, nivaer[0]) : null;
    const hard = lett ? trekkNiva(sp, nivaer[1]) : null;
    sp.valg = lett && hard ? [lett, hard] : null;
    sp.oppgave = lett || trekk(sp); // (with a choice: set for real when the mimer starts the clock)
    sp.verdi = 1;
    sp.sett = false;
  }
  function nyTur(sp) {
    sp.runde = null; // Hurtigmim: the tasks of the turn, made when the clock starts
    sp.resultat = null; // Én om gangen: how the task ended
    sp.gjetter = null;
    sp.sek = null;
    sp.igjen = sp.tid;
    sp.pause = false;
    if (hurtig(sp)) {
      sp.oppgave = null;
      sp.valg = null;
      sp.verdi = 1;
    } else {
      nyOppgave(sp);
      sp.bytt = BYTT;
    }
  }
  // Hurtigmim: the task on screen (not answered yet), if any.
  const ubesvart = (r) => {
    const w = r.ord[r.ord.length - 1];
    return w && w.s === null ? w : null;
  };
  // Is the turn still being mimed (the clock may run)?
  const turApen = (sp) => (hurtig(sp) ? !!sp.runde && !sp.runde.ute : sp.resultat == null);

  // ---------- Points ----------

  // Who gets what for the turn on screen: [[index, points], …]. The points are counted when the
  // turn is left, so until then a wrong tap can be corrected.
  function turPluss(sp) {
    const m = mimer(sp);
    if (hurtig(sp)) {
      const n = sp.runde ? sp.runde.ord.filter((w) => w.s === 1).length : 0;
      return n ? [[m, n]] : [];
    }
    if (sp.resultat !== "riktig") return [];
    const verdi = sp.verdi === 2 ? 2 : 1;
    if (sp.modus === "lag") return [[m, verdi]];
    return sp.gjetter == null ? [] : [[sp.gjetter, verdi], [m, verdi]];
  }
  // Score rows; medTur also counts the turn on screen (shown as «+n»).
  function poengRader(sp, medTur) {
    const pluss = {};
    if (medTur && sp.talt !== sp.tur) turPluss(sp).forEach(([i, p]) => (pluss[i] = p));
    return sp.poeng.map((poeng, i) => {
      const p = pluss[i] || 0;
      return sp.modus === "lag" ? { lag: i, poeng: poeng + p, pluss: p || undefined } : { i, poeng: poeng + p, pluss: p || undefined };
    });
  }

  // ---------- Records (this phone) ----------

  function lesRekord() {
    const r = R.les("mimen.rekord", {}) || {};
    const h = {};
    if (r.hurtig && typeof r.hurtig === "object") for (const t of TIDER.hurtig) if (Number(r.hurtig[t]) > 0) h[t] = Math.floor(Number(r.hurtig[t]));
    const g = r.raskest;
    return { hurtig: h, raskest: g && Number(g.sek) > 0 ? { sek: Math.floor(Number(g.sek)), t: String(g.t || "").slice(0, 60) } : null };
  }
  // Hurtigmim: is n tasks in one turn a new record for this length? (The first turn ever only sets the mark.)
  const nyHurtigRekord = (sp, n) => {
    const gml = lesRekord().hurtig[sp.tid] || 0;
    return gml > 0 && n > gml ? gml : 0;
  };
  // Én om gangen: is this guess faster than the fastest so far?
  const nyRaskest = (sp) => {
    const gml = lesRekord().raskest;
    return sp.resultat === "riktig" && sp.sek > 0 && gml && sp.sek < gml.sek ? gml.sek : 0;
  };
  function lagreRekord(sp) {
    const rek = lesRekord();
    if (hurtig(sp)) {
      const n = sp.runde ? sp.runde.ord.filter((w) => w.s === 1).length : 0;
      if (n > (rek.hurtig[sp.tid] || 0)) rek.hurtig[sp.tid] = n;
      else return;
    } else if (sp.resultat === "riktig" && sp.sek > 0 && (sp.modus === "lag" || sp.gjetter != null) && (!rek.raskest || sp.sek < rek.raskest.sek)) {
      rek.raskest = { sek: sp.sek, t: sp.oppgave.t };
    } else return;
    R.skriv("mimen.rekord", rek);
  }
  // The badge on the home screen: the record that fits the way the group plays.
  function rekordMerke(S) {
    const rek = lesRekord();
    const o = S.oppsett;
    const tider = TIDER.hurtig.filter((t) => rek.hurtig[t] > 0);
    const raskest = rek.raskest ? [`${rek.raskest.sek} s`, "raskeste gjetning"] : null;
    if (o.form === "en" && raskest) return raskest;
    if (tider.length) {
      const t = tider.includes(o.tid.hurtig) ? o.tid.hurtig : tider.slice().sort((a, b) => rek.hurtig[b] - rek.hurtig[a])[0];
      return [String(rek.hurtig[t]), `rekord på ${t} s`];
    }
    return raskest;
  }

  // ---------- The clock ----------

  const klokke = () => R.timer("mi-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const tur = sp.tur;
    const gjelder = () => S.spill === sp && sp.tur === tur && turApen(sp);
    const t = new R.Timer({
      id: "mi-tid",
      sekunder: Math.max(1, sp.igjen),
      visning: hurtig(sp) ? "sek" : "mm:ss",
      vedTikk: (sek) => {
        if (gjelder()) {
          sp.igjen = sek;
          R.lagre();
        }
      },
      vedSlutt: () => {
        if (gjelder()) {
          sp.igjen = 0;
          tidUte(S);
        }
      },
    });
    t.total = sp.tid; // the ring shows the whole turn, also after a pause or reload
    return t;
  }
  function tidUte(S) {
    const sp = S.spill;
    if (!hurtig(sp)) {
      avgjor(S, "tid");
      return;
    }
    const r = sp.runde;
    const w = ubesvart(r);
    if (w) {
      // The task on screen when the clock stopped: not guessed, unless the check list says so.
      w.s = 0;
      w.u = true;
    }
    r.ute = true;
    sp.pause = false;
    R.gaTil("sjekk");
  }
  function stoppKlokke(sp) {
    const t = klokke();
    if (t) {
      t.pause();
      sp.igjen = t.igjen;
    }
  }
  const klokkeskjerm = (S) => S.skjerm === "mim" || S.skjerm === "hurtig";
  function pause(S) {
    const sp = S.spill;
    if (!sp || sp.pause || !turApen(sp)) return;
    stoppKlokke(sp);
    sp.pause = true;
    if (klokkeskjerm(S)) R.vis();
  }
  function fortsett(S) {
    const sp = S.spill;
    if (!sp || !turApen(sp)) return;
    sp.pause = false;
    if (hurtig(sp) && !ubesvart(sp.runde)) sp.runde.ord.push(Object.assign(trekk(sp), { s: null })); // (never without a task on screen)
    const t = klokke() || lagKlokke(S);
    R.vis();
    t.start();
    R.holdVaken();
  }
  // A phone that is locked or switches app in the middle of a turn pauses it.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && klokkeskjerm(S)) pause(S);
  });
  // The Hurtigmim screen fills the phone exactly and never scrolls (see spill.css).
  const fastSide = (pa) => document.documentElement.classList.toggle("mi-fast", !!pa);

  // ---------- How a turn ends ----------

  // Én om gangen: the task is decided ("riktig" | "pass" | "tid"). Everyone sees the answer.
  function avgjor(S, resultat) {
    const sp = S.spill;
    if (!sp || sp.resultat != null) return;
    sp.resultat = resultat;
    sp.gjetter = null;
    sp.sek = resultat === "riktig" ? R.klamp(Math.round(sp.tid - sp.igjen), 1, sp.tid) : null;
    sp.pause = false;
    if (resultat === "riktig") {
      R.lyd.riktig();
      R.vibrer([30, 40, 60]);
    } else if (resultat === "pass") R.lyd.sveip(); // passing is fine: a neutral sound, never a buzzer
    R.gaTil("svar");
    // (Teams: the guess is complete here. Everyone against everyone: when the guesser is picked.)
    if (resultat === "riktig" && sp.modus === "lag" && rekordTur !== sp.tur && nyRaskest(sp)) {
      rekordTur = sp.tur;
      R.konfetti();
    }
  }
  // Hurtigmim: one task answered. The next one is on screen at once.
  function svarHurtig(S, riktig) {
    const sp = S.spill;
    const r = sp && sp.runde;
    if (!r || r.ute || sp.pause) return;
    const na = performance.now();
    if (na - sistSvar < 350) return; // a nervous double tap must not burn the next task
    const w = ubesvart(r);
    if (!w) return;
    sistSvar = na;
    w.s = riktig ? 1 : 0;
    if (riktig) {
      R.lyd.riktig();
      R.vibrer(25);
    } else {
      R.lyd.sveip();
      R.vibrer(10);
    }
    r.ord.push(Object.assign(trekk(sp), { s: null }));
    blink = riktig ? "riktig" : "pass";
    R.vis();
  }
  // The turn is left for good: count its points, log it for the awards, keep a record.
  function fullforTur(S) {
    const sp = S.spill;
    if (!sp || sp.talt === sp.tur) return;
    const m = mimer(sp);
    if (hurtig(sp)) {
      const r = sp.runde;
      if (!r) return;
      const riktige = r.ord.filter((w) => w.s === 1);
      const bom = r.ord.filter((w) => w.s === 0 && !w.u);
      const hard = riktige.reduce((a, w) => (!a || w.n > a.n ? w : a), null);
      sp.logg.push({ mimer: m, riktige: riktige.length, pass: bom.length, hard: hard ? { t: hard.t, n: hard.n } : null, bom: bom.slice(-2).map((w) => w.t) });
    } else {
      if (sp.resultat == null) return;
      sp.logg.push({ t: sp.oppgave.t, k: sp.oppgave.k, mimer: m, gjetter: sp.gjetter, resultat: sp.resultat, sek: sp.sek, verdi: sp.verdi === 2 ? 2 : 1 });
    }
    lagreRekord(sp);
    turPluss(sp).forEach(([i, p]) => (sp.poeng[i] += p));
    sp.logg = sp.logg.slice(-120);
    sp.talt = sp.tur;
  }
  const sumRiktige = (sp) => (hurtig(sp) ? sp.logg.reduce((s, l) => s + l.riktige, 0) : sp.logg.filter((l) => l.resultat === "riktig").length);
  // The game is over: the evening's scoreboard and the statistics hear about it once.
  function avsluttSpill(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    fullforTur(S);
    sp.ferdig = true;
    R.slippVaken();
    R.statistikk("ferdig", { form: sp.form, modus: sp.modus, deltakere: deltakere(sp), turer: sp.logg.length, riktige: sumRiktige(sp) });
    R.kveld.registrer(poengRader(sp).map((r) => (sp.modus === "lag" ? { lag: r.lag, poeng: r.poeng } : { i: r.i, poeng: r.poeng })));
    feire = true;
    R.gaTil("slutt");
  }

  // ---------- Pieces ----------

  function lagFigur(i, klasse, stemning) {
    return `<span class="mi-lagfigur ${klasse || ""}" style="--lf: ${R.LAG[i % 4].farge}; --lf-dyp: ${LAGDYP[i % 4]}">${R.figur(null, stemning || "")}</span>`;
  }
  const hvemHtml = (sp, m) => (sp.modus === "lag" ? lagFigur(m, "mini") : R.avatar(m, "mid"));

  function oppgaveKort(sp, liten) {
    const o = sp.oppgave;
    const k = katMedId(o.k);
    return `<span class="mi-panel">
      <span class="kort-etikett">${k ? `${k.ikon} ${esc(k.navn)}` : "Oppgave"} ${stjerneHtml(o.n)}</span>
      <span class="kort-ord ${R.lengdeKlasse(o.t)}">${esc(o.t)}</span>
      ${liten ? "" : `<span class="kort-pille">${sp.lyder ? "🔊 Lyder er lov – men ingen ord" : "🤫 Ingen ord, ingen lyder"}</span>`}
    </span>`;
  }

  // Two tasks to choose between: the lighter one for one point, the harder one for two.
  function valgKort(sp) {
    return `<span class="mi-valg">${sp.valg
      .map((o, i) => {
        const k = katMedId(o.k);
        return `<span class="mi-panel mi-valgpanel">
          <span class="mi-verdi">${i ? "2 poeng" : "1 poeng"} ${stjerneHtml(o.n)}</span>
          <span class="kort-ord ${R.lengdeKlasse(o.t)}">${esc(o.t)}</span>
          ${k ? `<span class="kort-etikett">${k.ikon} ${esc(k.navn)}</span>` : ""}
        </span>`;
      })
      .join("")}</span>`;
  }

  // Score list: players use the kit's list; teams get the mime on their team disc (the kit's list
  // shows plain colour dots), with the same markup and classes.
  function poengListe(sp, rader) {
    if (sp.modus !== "lag") return R.ui.poengliste(rader);
    const sortert = rader.slice().sort((a, b) => b.poeng - a.poeng);
    const topp = sortert.length ? sortert[0].poeng : 0;
    return `<ol class="poengliste mi-liste">${sortert
      .map(
        (x, n) =>
          `<li class="${x.poeng === topp && topp > 0 ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${lagFigur(x.lag, "mini")}<span class="navn">${esc(lagNavn(x.lag))}</span>${
            x.pluss ? `<span class="pluss">+${x.pluss}</span>` : ""
          }<span class="sum">${x.poeng}</span></li>`,
      )
      .join("")}</ol>`;
  }

  // Standings after a turn, the turn on screen included. With many players only the top five;
  // the full list comes at the end.
  function stilling(sp) {
    const rader = poengRader(sp, true);
    if (rader.length <= 8) return poengListe(sp, rader);
    const topp = rader.slice().sort((a, b) => b.poeng - a.poeng).slice(0, 5);
    return `${poengListe(sp, topp)}<p class="hjelp mi-tett">Topp fem av ${rader.length}. Hele lista kommer på slutten.</p>`;
  }

  // Podium for teams with the mime on team-coloured discs (the kit's podium shows plain dots).
  // Same rules as R.ui.pall (no 0-point teams, equal points share a place), with team badges.
  function lagPall(sp) {
    const alle = sp.poeng.map((poeng, lag) => ({ lag, poeng })).filter((x) => x.poeng > 0).sort((a, b) => b.poeng - a.poeng);
    if (alle.length < 2) return "";
    const rang = (x) => 1 + alle.filter((y) => y.poeng > x.poeng).length;
    const plass = (x) => {
      if (!x) return "<div></div>";
      const n = rang(x);
      return `<div class="pall-plass p${Math.min(n, 3)}">${lagFigur(x.lag, "liten")}<span class="navn">${esc(lagNavn(x.lag))}</span><span class="poeng">${x.poeng} p</span><span class="blokk">${n}</span></div>`;
    };
    if (alle.length < 3) return `<div class="pall to" aria-label="Pallen">${plass(alle[1])}${plass(alle[0])}</div>`;
    return `<div class="pall" aria-label="Pallen">${plass(alle[1])}${plass(alle[0])}${plass(alle[2])}</div>`;
  }

  // Én om gangen: one line about how the task ended.
  function svarTekst(sp) {
    if (sp.resultat === "riktig") {
      const [Poeng, poeng] = sp.verdi === 2 ? ["To poeng", "to"] : ["Ett poeng", "ett"];
      if (sp.modus === "lag") return `${lagNavn(mimer(sp))} klarte det på ${sp.sek} s. ${Poeng} til laget!`;
      return `${R.navn(sp.gjetter)} gjettet det på ${sp.sek} s. ${Poeng} til gjetteren og ${poeng} til mimeren!`;
    }
    if (sp.resultat === "pass") return "Ingen poeng denne gangen. Den var kanskje litt vrien?";
    return "Klokka vant denne gangen. Ingen poeng.";
  }
  // Hurtigmim: warm words about the turn, by tasks per minute.
  function dom(n, tid) {
    const takt = (n * 60) / tid;
    if (n === 0) return "Den runden var vrien. Neste tur blir bedre!";
    if (takt < 3) return "Godt forsøk!";
    if (takt < 5) return "Godt jobba!";
    if (takt < 7) return "Imponerende!";
    return "For en forestilling!";
  }

  // Fun awards for the end screen, built from the log.
  function kaaringer(sp) {
    const ut = [];
    if (hurtig(sp)) {
      const best = sp.logg.reduce((a, l) => (l.riktige > 0 && (!a || l.riktige > a.riktige) ? l : a), null);
      if (best) ut.push({ ikon: "⚡", tittel: "Beste tur", tekst: `${navn(sp, best.mimer)} – ${R.flertall(best.riktige, "oppgave", "oppgaver")} på ${sp.tid} s` });
      const hard = sp.logg.reduce((a, l) => (l.hard && l.hard.n >= 2 && (!a || l.hard.n > a.hard.n) ? l : a), null);
      if (hard) ut.push({ ikon: "🎯", tittel: "Vanskeligste som ble gjettet", tekst: `«${hard.hard.t}» – mimet av ${navn(sp, hard.mimer)}` });
      const bom = sp.logg.reduce((a, l) => a.concat(l.bom || []), []);
      if (bom.length) ut.push({ ikon: "🤷", tittel: "Ingen klarte", tekst: bom.slice(-3).map((t) => `«${t}»`).join(", ") });
      return ut;
    }
    const riktige = sp.logg.filter((l) => l.resultat === "riktig" && (sp.modus === "lag" || l.gjetter != null));
    if (sp.modus === "alle" && riktige.length) {
      const gjett = {};
      const mimt = {};
      riktige.forEach((l) => {
        gjett[l.gjetter] = (gjett[l.gjetter] || 0) + 1;
        mimt[l.mimer] = (mimt[l.mimer] || 0) + 1;
      });
      const topp = (m) => {
        const maks = Math.max(...Object.values(m));
        const hvem = Object.keys(m).filter((i) => m[i] === maks).map(Number);
        return { maks, hvem };
      };
      const g = topp(gjett);
      const mm = topp(mimt);
      ut.push({ ikon: "👀", tittel: "Skarpeste øyne", tekst: `${R.ramsOpp(g.hvem.map((i) => R.navn(i)))} – ${g.maks} ${g.maks === 1 ? "riktig gjetning" : "riktige gjetninger"}` });
      ut.push({ ikon: "🎭", tittel: "Beste mimer", tekst: `${R.ramsOpp(mm.hvem.map((i) => R.navn(i)))} – ${R.flertall(mm.maks, "oppgave", "oppgaver")} gjettet` });
    }
    if (riktige.length) {
      const raskest = riktige.reduce((a, b) => (b.sek < a.sek ? b : a));
      const hvem = sp.modus === "lag" ? lagNavn(raskest.mimer) : R.navn(raskest.gjetter);
      ut.push({ ikon: "⚡", tittel: "Raskeste gjetning", tekst: `${hvem} – ${raskest.sek} s på «${raskest.t}»` });
    }
    const bom = sp.logg.filter((l) => l.resultat !== "riktig");
    if (bom.length) ut.push({ ikon: "🤷", tittel: "Ingen klarte", tekst: bom.slice(-3).map((l) => `«${l.t}»`).join(", ") });
    return ut;
  }

  function vinnere(sp) {
    const maks = Math.max(...sp.poeng);
    return { maks, hvem: maks > 0 ? sp.poeng.map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0) : [] };
  }
  // The result as plain text for the share sheet (the link is added by R.del).
  function delTekst(sp) {
    const v = vinnere(sp);
    const hvem = R.ramsOpp(v.hvem.map((i) => navn(sp, i)));
    const poeng = R.flertall(v.maks, "poeng", "poeng");
    const deler = [v.hvem.length > 1 ? `${hvem} delte seieren i mimeleken med ${poeng} hver!` : `${hvem} vant mimeleken med ${poeng}!`];
    const pris = kaaringer(sp).find((p) => p.ikon === "⚡");
    if (pris) deler.push(`${pris.tittel}: ${pris.tekst}.`);
    deler.push("Klarer dere å slå det?");
    return deler.join(" ");
  }

  // Category chips: «Alle» covers every category; Jul stands first in its season.
  function katBrikker(o) {
    return R.ui.brikker(
      "kat",
      katRekke().map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: tellKat(k.id, o.niva) })),
      valgteKat(o),
      { alle: true, etikett: "Kategorier" },
    );
  }

  // ---------- The game ----------

  R.start({
    id: "mimen",
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also those with the game's own buttons in them
    pagar, // a game is running until the end screen (front-page badge, wake lock)

    // The player count starts at the number of names the group already typed in (any game).
    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 4, 3, 20),
      oppsett: stdOppsett(),
      nesteStart: 0, // who mimes first in the next game: it goes round from game to game
      spill: null,
    }),

    // Repair saved settings and drop a saved game that doesn't fit this version.
    lastet(S) {
      const gml = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      const std = stdOppsett();
      const o = (S.oppsett = Object.assign({}, std, gml));
      if (!FORMER.includes(o.form)) o.form = "hurtig";
      if (!MODUSER.includes(o.modus)) o.modus = "alle";
      // Settings from before Hurtigmim: «Lag mot lag» was a choice; the old default numbers were not.
      if (gml.modusValgt == null) o.modusValgt = gml.modus === "lag";
      o.modusValgt = !!o.modusValgt;
      if (![2, 3, 4].includes(o.lag)) o.lag = 2;
      const gmlRunder = gml.runder && typeof gml.runder === "object" ? gml.runder : {};
      o.runder = { hurtig: { alle: null, lag: null }, en: { alle: null, lag: null } };
      if (typeof gmlRunder.alle === "number" || typeof gmlRunder.lag === "number") {
        if (gmlRunder.alle !== 2) o.runder.en.alle = gmlRunder.alle;
        if (gmlRunder.lag !== 5) o.runder.en.lag = gmlRunder.lag;
      } else {
        for (const f of FORMER) for (const m of MODUSER) o.runder[f][m] = gmlRunder[f] && gmlRunder[f][m] != null ? gmlRunder[f][m] : null;
      }
      for (const f of FORMER) for (const m of MODUSER) if (o.runder[f][m] != null && !RUNDER[f][m].includes(o.runder[f][m])) o.runder[f][m] = null;
      const gmlTid = gml.tid;
      o.tid = { hurtig: 60, en: 60 };
      if (typeof gmlTid === "number") o.tid.en = gmlTid;
      else if (gmlTid && typeof gmlTid === "object") Object.assign(o.tid, { hurtig: gmlTid.hurtig, en: gmlTid.en });
      for (const f of FORMER) if (!TIDER[f].includes(o.tid[f])) o.tid[f] = 60;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (o.kat != null) {
        o.kat = Array.isArray(o.kat) ? KAT.map((k) => k.id).filter((id) => o.kat.includes(id)) : null;
        if (o.kat && (!o.kat.length || (o.kat.length === FASTE.length && !o.kat.includes(JUL)))) o.kat = null;
      }
      o.lyder = !!o.lyder;
      S.antall = R.klamp(Number(S.antall) || 4, 3, 20);
      S.nesteStart = Math.max(0, Math.floor(Number(S.nesteStart) || 0));
      const sp = S.spill;
      if (sp) {
        const ok =
          FORMER.includes(sp.form) &&
          MODUSER.includes(sp.modus) &&
          Array.isArray(sp.poeng) &&
          sp.poeng.length === deltakere(sp) &&
          Array.isArray(sp.logg) &&
          sp.turer > 0 &&
          sp.tur < sp.turer &&
          TIDER[sp.form].includes(sp.tid) &&
          (hurtig(sp) ? sp.runde == null || (Array.isArray(sp.runde.ord) && sp.runde.ord.length > 0 && sp.runde.ord.every((w) => w && typeof w.t === "string")) : !!sp.oppgave && typeof sp.oppgave.t === "string") &&
          (sp.valg == null || (Array.isArray(sp.valg) && sp.valg.length === 2 && sp.valg.every((o) => o && typeof o.t === "string")));
        if (!ok) S.spill = null;
        else sp.sett = false; // after a reload the card must be held again before «Start»
      }
      // The saved screen must fit the saved turn (a screen from an older version, a half-saved turn).
      const na = S.spill;
      const spillskjermer = ["gi", "mim", "svar", "hurtig", "sjekk", "slutt"];
      if (!na) {
        if (S.skjerm && S.skjerm !== "oppsett") S.skjerm = "hjem";
      } else if (na.ferdig) {
        if (spillskjermer.includes(S.skjerm)) S.skjerm = "slutt";
      } else if (spillskjermer.includes(S.skjerm)) {
        const iRunde = hurtig(na) && !!na.runde;
        if (S.skjerm === "slutt") S.skjerm = "hjem";
        else if (hurtig(na)) S.skjerm = !iRunde ? "gi" : na.runde.ute ? "sjekk" : "hurtig";
        else if (S.skjerm === "hurtig" || S.skjerm === "sjekk") S.skjerm = "gi";
        else if (S.skjerm === "mim" && na.resultat != null) S.skjerm = "svar";
        else if (S.skjerm === "svar" && na.resultat == null) S.skjerm = "gi";
      }
    },

    // rusj.no/mimen/#jul opens «Gjør klart» with only the Jul tasks (never in the middle of a game).
    vedHash(S, hash) {
      if (String(hash).trim().toLowerCase() !== JUL || !katMedId(JUL) || pagar(S)) return null;
      S.oppsett.kat = [JUL];
      forvalg(S);
      return "oppsett";
    },

    regler: {
      intro: "Én mimer, resten gjetter. Ingen ord, ingen lyder – bare armer, bein og ansikt.",
      steg: [
        ["Ta mobilen", "Mimeren holder mobilen som et kort, så ingen andre ser oppgaven. Trykk start – da går klokka."],
        ["Mim så mange du rekker", "Hurtigmim: Trykk «Riktig» hver gang de andre gjetter oppgaven, eller «Pass» for å hoppe over. Neste oppgave kommer med en gang."],
        ["Sjekk og tell", "Når tiden er ute, ser dere lista. Trykk på en oppgave for å rette. Hver gjettet oppgave gir ett poeng."],
      ],
      tips: [
        "Én om gangen: én oppgave per tur. Mimeren holder fingeren på kortet for å se den, og den som gjetter først, får like mange poeng som mimeren.",
        "På middels og vanskelig får mimeren to oppgaver å velge mellom i «Én om gangen». Den vanskeligste gir to poeng.",
        "Vis hvor mange ord det er med fingrene. Klapp på armen for å vise hvilket ord du er på.",
        "Pek på øret når du vil si «det høres ut som …».",
        "Lag mot lag: bare laget til mimeren gjetter. Skru på «Lyder er lov» når de minste er med.",
      ],
    },

    // Én om gangen: the task is only shown while the mimer holds the card.
    hemmelig: {
      innhold(S, id) {
        const sp = S.spill;
        if (!sp || !sp.oppgave) return { html: "" };
        if (id !== "titt" && sp.valg) return { html: valgKort(sp), klasse: "mi-bak mi-bak-to" };
        return { html: oppgaveKort(sp, id === "titt"), klasse: "mi-bak" };
      },
      sett(S) {
        const sp = S.spill;
        if (sp && !sp.sett) {
          sp.sett = true;
          if (S.skjerm === "gi") R.vis();
        }
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Vis det – uten et eneste ord.<br><em>De andre gjetter.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · runde ${rundeNr(S.spill)} av ${S.spill.runder}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [["3–20", "spillere"], [String(ALLE.length), "oppgaver"], rekordMerke(S) || [String(KAT.length), "kategorier"]],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const antall = tellOppgaver(o);
          const lag = `<section class="seksjon">
              <h2>Hvor mange lag?</h2>
              ${R.ui.seg("lag", [[2, "2 lag"], [3, "3 lag"], [4, "4 lag"]], o.lag, { etikett: "Antall lag" })}
              <div class="mi-lagrad">${Array.from({ length: o.lag }, (_, i) => R.ui.lagmerke(i, R.LAG[i].navn)).join("")}</div>
              <p class="hjelp">Del dere i lag. Lagene bytter på å mime.</p>
            </section>`;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hvordan spiller dere?</h2>
              ${R.ui.fliser(
                "form",
                [
                  { v: "hurtig", tittel: "Hurtigmim", tekst: "Så mange oppgaver dere rekker på tiden", ikon: "⚡" },
                  { v: "en", tittel: "Én om gangen", tekst: "Én oppgave per tur – fint for de minste", ikon: "🎭" },
                ],
                o.form,
              )}
            </section>
            <section class="seksjon">
              <h2>Hvem mot hvem?</h2>
              ${R.ui.seg("modus", [["alle", "Alle mot alle"], ["lag", "Lag mot lag"]], o.modus, { etikett: "Hvem mot hvem" })}
              <p class="hjelp">${esc(modusTekst(S))}</p>
            </section>
            ${o.modus === "alle" ? R.ui.spillere({ min: 3, max: 20 }) : lag}
            <div class="mi-to">
              <section class="seksjon"><h2>Runder</h2>${R.ui.seg("runder", RUNDER[o.form][o.modus].map((r) => [r, String(r)]), runderNa(S), { etikett: "Antall runder" })}</section>
              <section class="seksjon"><h2>Tid</h2>${R.ui.seg("tid", TIDER[o.form].map((t) => [t, `${t} s`]), o.tid[o.form], { etikett: o.form === "hurtig" ? "Tid per tur" : "Tid per oppgave" })}</section>
            </div>
            <p class="hjelp mi-tett">${o.modus === "alle" ? "Alle mimer én gang hver runde." : "Hvert lag mimer én gang hver runde."}</p>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Oppgavene</h2><span class="tall">${antall} oppgaver</span></div>
              ${R.ui.seg("niva", NIVAER.map((n) => [n.v, n.navn]), o.niva, { etikett: "Vanskelighet" })}
              <p class="hjelp">${esc(niva(o.niva).tekst)}${o.form === "en" && niva(o.niva).n.length === 2 ? " Mimeren velger mellom to oppgaver – den vanskeligste gir to poeng." : ""}</p>
              ${katBrikker(o)}
              ${antall ? "" : `<p class="feil">Velg minst én kategori med oppgaver.</p>`}
            </section>
            ${R.ui.bryter("lyder", o.lyder, "Lyder er lov", "Fint for de minste. Ord er fortsatt forbudt.")}
            ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !antall }), antall ? `<p class="hjelp mi-estimat">${esc(estimat(S))}</p>` : "")}`;
        },
      },

      // Pass the phone to the next mimer (or team). Hurtigmim starts the clock from here;
      // Én om gangen has the secret card right on this screen.
      gi: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const m = mimer(sp);
          const lag = sp.modus === "lag";
          const avslutt = R.ui.lenke("Avslutt", "avslutt");
          if (hurtig(sp)) {
            const hode = lag
              ? `<div class="gi-til">
                  ${lagFigur(m, "stor")}
                  <p class="etikett">${sp.tur === 0 ? "Først ut" : "Neste lag"}</p>
                  <h1 id="skjerm-tittel" class="mi-lagnavn" style="--lf: ${R.LAG[m].farge}">${esc(lagNavn(m))}</h1>
                  <p class="ingress mi-gi-tekst">Hvem mimer? Den som mimer, holder mobilen som et kort. Resten av laget gjetter.</p>
                  <p class="ikke-se">🙈 Bare mimeren ser skjermen</p>
                </div>`
              : `${R.ui.fremdrift(sp.antall, m, Array.from({ length: sp.tur % sp.antall }, (_, n) => ((sp.start || 0) + n) % sp.antall))}
                <div class="gi-til">
                  <span class="gi-til-avatar">${R.avatar(m, "gigant")}</span>
                  <p class="etikett">${sp.tur === 0 ? "Først ut å mime" : "Neste mimer"}</p>
                  <h1 id="skjerm-tittel">${esc(R.navn(m))}</h1>
                  <p class="ingress mi-gi-tekst">Hold mobilen som et kort. Trykk «Riktig» for hver oppgave de andre gjetter.</p>
                  <p class="ikke-se">🙈 Bare mimeren ser skjermen</p>
                </div>`;
            return `${hode}
              ${R.ui.dokk(R.ui.knapp("Start", "start-tur"), `<p class="hjelp mi-estimat">${sp.tid} sekunder – så mange dere rekker</p>`, R.ui.lenkerad(avslutt))}`;
          }
          const to = !!sp.valg; // two tasks to choose between: the choice starts the clock
          const hjelp = sp.sett
            ? to
              ? "Velg den du tør. Klokka starter når du trykker – legg fra deg mobilen og mim."
              : "Klar? Trykk start, legg fra deg mobilen og mim."
            : lag
              ? "Den som mimer, holder fingeren på kortet for å se. Alle andre ser bort."
              : `${R.navn(m)} – hold fingeren på kortet for å se. De andre ser bort.`;
          const start = !sp.sett
            ? R.ui.knapp(to ? "Se oppgavene først" : "Se oppgaven først", "start-mim", { av: true })
            : to
              ? `<div class="knapprad">${R.ui.knapp("1 poeng", "start-mim", { v: 0, variant: "papir", etikett: "Start med oppgaven til 1 poeng" })}${R.ui.knapp("2 poeng", "start-mim", { v: 1, etikett: "Start med oppgaven til 2 poeng" })}</div>`
              : R.ui.knapp("Start", "start-mim");
          return `
            <h1 class="mi-mimer" id="skjerm-tittel">${hvemHtml(sp, m)}<span><b>${esc(navn(sp, m))}</b> mimer</span></h1>
            <p class="hjelp mi-tett">${esc(hjelp)}</p>
            ${R.ui.mappe({ id: "oppgave", etikett: to ? "Hemmelige oppgaver" : "Hemmelig oppgave", tekst: "Hold fingeren på kortet for å se", etikettAria: to ? "Hold fingeren på kortet for å se de to oppgavene" : "Hold fingeren på kortet for å se oppgaven" })}
            ${R.ui.dokk(start, R.ui.lenkerad(sp.sett && sp.bytt > 0 ? R.ui.lenke(`${to ? "Bytt oppgaver" : "Bytt oppgave"} (${sp.bytt} igjen)`, "bytt") : "", avslutt))}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
        },
      },

      // Én om gangen: the clock runs while the mimer mimes. The phone can lie on the table for all to see.
      mim: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const m = mimer(sp);
          const pauset = sp.pause || (!startetNa && !klokke());
          const avslutt = R.ui.lenke("Avslutt", "avslutt");
          // Who mimes, big enough to read from across the table (the top bar cuts long names).
          return `
            <h1 class="mi-mimer" id="skjerm-tittel">${hvemHtml(sp, m)}<span><b>${esc(navn(sp, m))}</b> mimer</span></h1>
            <div class="mi-midt">
              <div class="mi-scene${pauset ? " pauset" : ""}">
                ${R.ui.timer({ id: "mi-tid", sekunder: sp.igjen, stor: true })}
                ${pauset ? `<p class="mi-skilt pause">⏸ Pause</p>` : `<p class="mi-skilt">${sp.lyder ? "🔊 Lyder er lov – men ingen ord" : "🤫 Ingen lyder!"}</p>`}
              </div>
              <div class="mi-titt">${R.ui.mappe({ id: "titt", etikett: "Glemt oppgaven?", tekst: "Hold fingeren på kortet for å se", etikettAria: "Glemt oppgaven? Hold fingeren på kortet for å se den igjen" })}</div>
            </div>
            ${
              pauset
                ? R.ui.dokk(R.ui.knapp("Fortsett", "fortsett-mim"), R.ui.lenkerad(R.ui.lenke("Pass", "pass"), avslutt))
                : R.ui.dokk(
                    `<div class="mi-svarknapper">${R.ui.knapp("Pass", "pass", { variant: "papir" })}${R.ui.knapp("Riktig!", "riktig", { variant: "mynte", stille: true })}</div>`,
                    R.ui.lenkerad(R.ui.lenke("Pause", "pause"), avslutt),
                  )
            }`;
        },
        etter() {
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "mim";
          const fersk = startetNa;
          startetNa = false;
          if (sp.resultat != null) return;
          const t = lagKlokke(S);
          if (fersk && !sp.pause) {
            t.start();
            R.holdVaken();
          } else {
            sp.pause = true;
            R.vis();
          }
        },
        ut(S) {
          const sp = S.spill;
          const t = klokke();
          if (sp && t && sp.resultat == null) {
            sp.igjen = Math.max(1, t.igjen);
            sp.pause = true;
          }
        },
      },

      // Én om gangen: the answer, for everyone to see — and, everyone against everyone, who guessed it.
      svar: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const o = sp.oppgave;
          const k = katMedId(o.k);
          const m = mimer(sp);
          const riktig = sp.resultat === "riktig";
          const velg = riktig && sp.modus === "alle";
          const venter = velg && sp.gjetter == null;
          const [stempel, farge] = riktig ? ["Riktig!", "mynte"] : sp.resultat === "pass" ? ["Pass!", "rosa"] : ["Tiden er ute!", "rosa"];
          const gml = venter ? 0 : nyRaskest(sp);
          const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== m);
          return `
            <div class="mi-svar">
              <div class="stempel-sted"><h1 id="skjerm-tittel" class="stempel ${farge}">${stempel}</h1></div>
              <div class="papirboks mi-fasit">
                <p class="etikett">Oppgaven var</p>
                <p class="mi-fasit-tekst">${esc(o.t)}</p>
                ${k ? `<p class="mi-fasit-kat">${k.ikon} ${esc(k.navn)}${sp.verdi === 2 ? " · 2 poeng" : ""}</p>` : ""}
              </div>
              ${venter ? "" : `<p class="mi-svartekst">${esc(svarTekst(sp))}</p>`}
              ${gml ? `<p class="mi-dom rekord">Ny rekord! Raskeste gjetning var ${gml} s.</p>` : ""}
            </div>
            ${
              velg
                ? `<section class="seksjon mi-hvem">
                    <div class="seksjon-hode"><h2>Hvem gjettet det?</h2>${venter ? "" : `<span class="tall">Trykk for å endre</span>`}</div>
                    ${R.ui.velgere("gjetter", andre, sp.gjetter)}
                  </section>`
                : ""
            }
            ${venter ? "" : stilling(sp)}
            ${R.ui.dokk(
              R.ui.knapp(venter ? "Velg hvem som gjettet" : sisteTur(sp) ? "Til kåringen" : `Neste: ${navn(sp, nesteMimer(sp))}`, "neste", { av: venter }),
              R.ui.lenkerad(riktig ? R.ui.lenke("Angre – mim videre", "angre-svar") : "", sisteTur(sp) ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "svar";
        },
      },

      // Hurtigmim: the phone is a card in the mimer's hand. The task on top, one big «Riktig» zone
      // under it and a narrow «Pass» strip; a tap shows the next task at once.
      hurtig: {
        tittel: rundeTittel,
        tilbake: "hjem",
        liggende: false, // landscape phones: its own layout (the task on the left, the zones on the right; see spill.css)
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const m = mimer(sp);
          const riktige = r.ord.filter((w) => w.s === 1).length;
          const pauset = sp.pause || (!startetNa && !klokke());
          const status = `<div class="mi-hstatus">
              ${R.ui.timer({ id: "mi-tid", sekunder: sp.igjen, visning: "sek" })}
              <div class="mi-hmimer">${sp.modus === "lag" ? lagFigur(m, "mini") : R.avatar(m)}<span><b>${esc(navn(sp, m))}</b><small>mimer</small></span></div>
              <div class="mi-teller${blink === "riktig" ? " popp" : ""}" role="img" aria-label="${R.flertall(riktige, "riktig", "riktige")}"><b>${riktige}</b><small>riktige</small></div>
            </div>`;
          const w = ubesvart(r);
          if (pauset || !w) {
            return `${status}
              <div class="mi-hkort pause">
                ${R.figur()}
                <h1 id="skjerm-tittel">Pause</h1>
                <p>Oppgaven er skjult. Fortsett når ${esc(sp.modus === "lag" ? lagNavn(m) : R.navn(m))} er klar.</p>
              </div>
              ${R.ui.dokk(R.ui.knapp("Fortsett", "fortsett-mim"), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`;
          }
          const k = katMedId(w.k);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(navn(sp, m))} mimer</h1>
            ${status}
            <div class="mi-hkort${blink ? " blink-" + blink : ""}">
              <span class="mi-hetikett">${k ? `${k.ikon} ${esc(k.navn)}` : "Oppgave"} ${stjerneHtml(w.n)}</span>
              <span class="mi-hord ${R.lengdeKlasse(w.t)}">${esc(w.t)}</span>
              <span class="mi-hregel">${sp.lyder ? "🔊 Lyder er lov – men ingen ord" : "🤫 Ingen ord, ingen lyder"}</span>
            </div>
            <button class="knapp mynte mi-riktig" data-h="h-riktig" data-stille><span class="mi-hake" aria-hidden="true">✓</span><span>Riktig</span><small>Trykk når de gjetter det</small></button>
            <button class="knapp papir mi-pass" data-h="h-pass" data-stille>Pass</button>
            ${R.ui.lenkerad(R.ui.lenke("Pause", "pause"), R.ui.lenke("Avslutt", "avslutt"))}`;
        },
        etter() {
          blink = "";
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "hurtig";
          fastSide(true);
          const fersk = startetNa;
          startetNa = false;
          if (!turApen(sp)) return;
          const t = lagKlokke(S);
          if (fersk && !sp.pause) {
            t.start();
            R.holdVaken();
          } else {
            sp.pause = true;
            R.vis();
          }
        },
        ut(S) {
          fastSide(false);
          const sp = S.spill;
          const t = klokke();
          if (sp && t && turApen(sp)) {
            sp.igjen = Math.max(1, t.igjen);
            sp.pause = true;
          }
        },
      },

      // Hurtigmim: after the turn — fix mistakes, see the standings, pass the phone on.
      sjekk: {
        tittel: rundeTittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const m = mimer(sp);
          const n = r.ord.filter((w) => w.s === 1).length;
          const gml = nyHurtigRekord(sp, n);
          return `
            <div class="mi-resultat">
              <div class="stempel-sted"><p class="stempel rosa" aria-hidden="true">Tiden er ute!</p></div>
              <p class="etikett">${esc(navn(sp, m))} fikk</p>
              <h1 id="skjerm-tittel"><b>${n > 0 ? "+" : ""}${n}</b> poeng</h1>
              <p class="mi-dom${gml ? " rekord" : ""}">${gml ? `Ny rekord! Den gamle var ${gml} på ${sp.tid} s.` : esc(dom(n, sp.tid))}</p>
            </div>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Oppgavene</h2><span class="tall">Trykk for å rette</span></div>
              <ul class="mi-ordliste">${r.ord
                .map((w, i) =>
                  w.s === null
                    ? ""
                    : `<li><button class="mi-ord" data-h="veksle" data-v="${i}" aria-pressed="${w.s === 1}"><i aria-hidden="true">${w.s === 1 ? "✓" : "↷"}</i><span>${esc(w.t)}</span><small>${
                        w.s === 1 ? "+1" : w.u ? "rakk ikke" : "pass"
                      }</small></button></li>`,
                )
                .join("")}</ul>
            </section>
            ${stilling(sp)}
            ${R.ui.dokk(
              R.ui.knapp(sisteTur(sp) ? "Til kåringen" : `Neste: ${navn(sp, nesteMimer(sp))}`, "neste"),
              R.ui.lenkerad(sisteTur(sp) ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          const sp = S.spill;
          const fersk = sp.skjerm !== "sjekk"; // straight from the turn, not a reload or «Fortsett»
          sp.skjerm = "sjekk";
          const n = sp.runde.ord.filter((w) => w.s === 1).length;
          if (fersk && rekordTur !== sp.tur && nyHurtigRekord(sp, n)) {
            rekordTur = sp.tur;
            R.konfetti();
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.lyd.fanfare(), 900); // after the clock's alarm
          }
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = vinnere(sp);
          const alle = sp.modus === "alle";
          const turer = sp.logg.length;
          const sum = sumRiktige(sp);
          const ingress = hurtig(sp)
            ? `${R.flertall(sum, "oppgave", "oppgaver")} ble gjettet på ${R.flertall(turer, "tur", "turer")}.`
            : `${sum} av ${R.flertall(turer, "oppgave", "oppgaver")} ble gjettet.`;
          let banner;
          if (!v.hvem.length) {
            banner = R.ui.banner({ klasse: "aksent", stemning: "lei", etikett: "Ingen vinner", tittel: "Ingen fikk poeng", tekst: "Ingen oppgaver ble gjettet denne gangen. Godt jobba likevel!" });
          } else {
            const en = v.hvem.length === 1;
            const figur = en
              ? alle
                ? R.avatar(v.hvem[0], "gigant")
                : lagFigur(v.hvem[0], "stor", "jubel")
              : `<span class="mi-delt">${v.hvem.slice(0, 4).map((i) => (alle ? R.avatar(i, "stor") : lagFigur(i, "liten", "jubel"))).join("")}</span>`;
            banner = `<div class="banner aksent${en ? "" : " mi-delt-banner"}">
              ${figur}
              <p class="etikett">${en ? (alle ? "Mimemester" : "Mimemestere") : "Delt seier"}</p>
              <h1 id="skjerm-tittel">${esc(R.ramsOpp(v.hvem.map((i) => navn(sp, i))))} vinner!</h1>
              <p class="ingress">${esc(ingress)}</p>
            </div>`;
          }
          const priser = kaaringer(sp);
          return `
            ${banner}
            ${v.maks > 0 ? (alle ? R.ui.pall(poengRader(sp)) : lagPall(sp)) + poengListe(sp, poengRader(sp)) : ""}
            ${v.maks > 0 ? `<div class="mi-del">${R.ui.knapp2("Del kåringen", "del")}</div>` : ""}
            ${priser.length ? `<ul class="mi-priser">${priser.map((p) => `<li><span class="mi-pris-ikon" aria-hidden="true">${p.ikon}</span><span><b>${esc(p.tittel)}</b><small>${esc(p.tekst)}</small></span></li>`).join("")}</ul>` : ""}
            ${R.ui.flereSpill({ antall: alle ? sp.antall : Math.max(4, sp.lag * 2) })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "slutt";
          R.slippVaken();
          if (!feire) return; // a reload or a visit from the home screen: no second fanfare
          feire = false;
          if (sp.poeng.some((p) => p > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      // A running game is only thrown away after the player confirms.
      async nytt(el, e, S) {
        const iGang = pagar(S);
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang)) || !fortsatt()) return;
        if (iGang) {
          S.spill = null;
          R.slippVaken();
        }
        forvalg(S);
        R.gaTil("oppsett");
      },
      // Back to where the game was. A turn in progress comes back paused.
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        const sp = S.spill;
        let mal = "gi";
        if (hurtig(sp)) mal = !sp.runde ? "gi" : sp.runde.ute ? "sjekk" : "hurtig";
        else if (sp.resultat != null) mal = "svar";
        else if (sp.skjerm === "mim") mal = "mim";
        if (mal === "gi") sp.sett = false; // whoever holds the phone now holds the card to see the task
        R.holdVaken();
        R.gaTil(mal);
      },
      // While the clock runs, the rules sheet pauses it first.
      regler(el, e, S) {
        if (klokkeskjerm(S)) pause(S);
        R.visRegler();
      },
      form(el, e, S) {
        if (FORMER.includes(el.dataset.v)) S.oppsett.form = el.dataset.v;
        R.vis();
      },
      modus(el, e, S) {
        if (!MODUSER.includes(el.dataset.v)) return;
        S.oppsett.modus = el.dataset.v;
        S.oppsett.modusValgt = true;
        R.vis();
      },
      lag(el, e, S) {
        S.oppsett.lag = Number(el.dataset.v);
        R.vis();
      },
      runder(el, e, S) {
        const o = S.oppsett;
        o.runder[o.form][o.modus] = Number(el.dataset.v);
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid[S.oppsett.form] = Number(el.dataset.v);
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = Number(el.dataset.v);
        R.vis();
      },
      kat(el, e, S) {
        const o = S.oppsett;
        const v = el.dataset.v;
        const alle = KAT.map((k) => k.id);
        let valgt = valgteKat(o).slice();
        if (v === "*") valgt = valgt.length === alle.length ? [] : alle.slice();
        else valgt = valgt.includes(v) ? valgt.filter((x) => x !== v) : [...valgt, v];
        // (null = exactly the standard categories, so a new standard category is picked up later)
        o.kat = valgt.length === FASTE.length && !valgt.includes(JUL) ? null : alle.filter((id) => valgt.includes(id));
        R.vis();
      },
      lyder(el, e, S) {
        S.oppsett.lyder = !S.oppsett.lyder;
        R.vis();
      },
      async start(el, e, S) {
        const o = S.oppsett;
        if (!tellOppgaver(o)) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        const antall = antallNa(S);
        const runder = runderNa(S);
        const start = S.nesteStart % antall;
        S.nesteStart = (start + 1) % antall;
        o.modusValgt = true; // the group has played this way: no more preselection by size
        S.spill = {
          form: o.form,
          modus: o.modus,
          lag: o.lag,
          antall: o.modus === "lag" ? 0 : antall,
          start,
          runder,
          tid: o.tid[o.form],
          niva: o.niva,
          kat: o.kat ? o.kat.slice() : null,
          lyder: o.lyder,
          poeng: Array(antall).fill(0),
          tur: 0,
          turer: runder * antall,
          talt: -1, // the last turn whose points are counted
          logg: [],
          skjerm: "gi",
          ferdig: false,
        };
        nyTur(S.spill);
        rekordTur = -1;
        R.statistikk("start", { form: o.form, modus: o.modus, deltakere: antall, runder, tid: o.tid[o.form], niva: o.niva });
        R.holdVaken();
        R.gaTil("gi");
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (!sp || hurtig(sp) || sp.bytt <= 0) return;
        sp.bytt -= 1;
        nyOppgave(sp);
        R.lyd.snu();
        R.toast(sp.valg ? "Nye oppgaver!" : "Ny oppgave!");
        R.vis();
      },
      // Én om gangen: 3-2-1 from the hand-over screen, then the clock.
      async "start-mim"(el, e, S) {
        const sp = S.spill;
        if (!sp || hurtig(sp) || !sp.sett || opptatt) return;
        const valgt = el && el.dataset && el.dataset.v === "1" ? 1 : 0; // (two tasks: which one)
        opptatt = true;
        R.holdVaken();
        // Leaving during the countdown (back, then «Fortsett») must never start the clock by itself.
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", "MIM!"], 750);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        if (sp.valg) {
          sp.oppgave = sp.valg[valgt];
          sp.verdi = valgt + 1;
          sp.valg = null;
        }
        sp.igjen = sp.tid;
        sp.pause = false;
        startetNa = true;
        R.gaTil("mim");
      },
      // Hurtigmim: 3-2-1, then the first task and the clock.
      async "start-tur"(el, e, S) {
        const sp = S.spill;
        if (!sp || !hurtig(sp) || sp.runde || opptatt) return;
        opptatt = true;
        R.holdVaken();
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", "MIM!"], 750);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        sp.runde = { ord: [Object.assign(trekk(sp), { s: null })], ute: false };
        sp.igjen = sp.tid;
        sp.pause = false;
        startetNa = true;
        blink = "";
        sistSvar = -1e9;
        R.gaTil("hurtig");
      },
      "h-riktig": (el, e, S) => svarHurtig(S, true),
      "h-pass": (el, e, S) => svarHurtig(S, false),
      pause: (el, e, S) => pause(S),
      "fortsett-mim": (el, e, S) => fortsett(S),
      riktig(el, e, S) {
        const sp = S.spill;
        if (!sp || hurtig(sp) || sp.resultat != null) return;
        stoppKlokke(sp);
        avgjor(S, "riktig");
      },
      async pass(el, e, S) {
        const sp = S.spill;
        if (!sp || hurtig(sp) || sp.resultat != null) return;
        const gikk = !sp.pause && !!klokke();
        pause(S);
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Gi opp oppgaven?", "Ingen får poeng for denne.", "Pass", "Fortsett å mime");
        if (!fortsatt() || S.spill !== sp || sp.resultat != null) return;
        if (ja) avgjor(S, "pass");
        else if (gikk) fortsett(S);
      },
      // Én om gangen, everyone against everyone: who guessed it? Can be changed until the next turn.
      gjetter(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!sp || hurtig(sp) || sp.modus !== "alle" || sp.resultat !== "riktig" || !(i >= 0 && i < sp.antall) || i === mimer(sp)) return;
        const forste = sp.gjetter == null;
        sp.gjetter = i;
        R.lyd.pop();
        R.vis();
        R.si(svarTekst(sp));
        if (forste && rekordTur !== sp.tur && nyRaskest(sp)) {
          rekordTur = sp.tur;
          R.konfetti();
        }
      },
      // Undo «Riktig!»: nobody gets points, and the mimer goes on with the clock where it stopped.
      "angre-svar"(el, e, S) {
        const sp = S.spill;
        if (!sp || hurtig(sp) || sp.resultat !== "riktig" || sp.talt === sp.tur) return;
        sp.resultat = null;
        sp.gjetter = null;
        sp.sek = null;
        sp.pause = false;
        sp.igjen = Math.max(1, sp.igjen);
        startetNa = true;
        R.lyd.snu();
        R.gaTil("mim");
        R.toast("Angret – mim videre!", { topp: true });
      },
      // Hurtigmim: the check list — tap a task to change guessed / not guessed.
      veksle(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.runde;
        const w = r && r.ute && sp.talt !== sp.tur && r.ord[Number(el.dataset.v)];
        if (!w || w.s === null) return;
        w.s = w.s === 1 ? 0 : 1;
        if (w.s === 1) R.lyd.pop();
        R.vis();
      },
      // Count the turn and pass the phone on — or, after the last turn, crown the winner.
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        if (hurtig(sp) ? !(sp.runde && sp.runde.ute) : sp.resultat == null || (sp.resultat === "riktig" && sp.modus === "alle" && sp.gjetter == null)) return;
        fullforTur(S);
        if (sisteTur(sp)) {
          avsluttSpill(S);
          return;
        }
        sp.tur += 1;
        nyTur(sp);
        R.gaTil("gi");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        // A running clock waits while the question is on screen.
        const gikk = klokkeskjerm(S) && !sp.pause && !!klokke() && turApen(sp);
        if (gikk) pause(S);
        const harPoeng = poengRader(sp, true).some((r) => r.poeng > 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", harPoeng ? "Dere går rett til kåringen. Den som leder nå, vinner." : "Ingen har fått poeng ennå, så det blir ingen kåring.", "Avslutt", "Spill videre");
        if (!fortsatt() || S.spill !== sp) return;
        if (!ja) {
          if (gikk) fortsett(S);
          return;
        }
        if (!harPoeng) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        avsluttSpill(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig || !vinnere(sp).hvem.length) return;
        R.del("Mimen", delTekst(sp), location.origin + "/mimen/");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
