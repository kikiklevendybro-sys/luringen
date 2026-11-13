/* Humla — «Dagens blomst»: seven letters on a flower, the centre letter in every word. Make words
   of four letters or more; a word with all seven letters is a «blomsterord» and gives a bonus.
   Points: a four-letter word 1, longer words one per letter, a blomsterord 7 more. The points
   climb a ladder of nine ranks (a share of the day's maximum); the rank «Honning» is the day's
   goal: reaching it finishes the daily (R.dagligFerdig), and the player may go on finding words.
   «Vis svarene» closes the day and shows every answer.
   Everyone in the edition's country gets the same flower each day (R.dag). The days and their
   answers are precomputed (data/blomster.json, build/humla/lag-humla.mjs): a day's answers are the
   words in the data's list made only of its seven letters and containing the centre letter – the
   browser gets those words, never a whole dictionary. Older flowers can be played as practice.
   The look is rusj's own: round paper petals around a pink centre, no hexagons.
   The engine at the top has no kit and no data of its own, so test/humla.test.mjs can load this
   file in node:vm (window.Humla) and test it. */
(function () {
  "use strict";

  // ---------- Engine (pure) ----------

  const Rt = { t: (s, v) => (typeof window !== "undefined" && window.Rusj && window.Rusj.t ? window.Rusj.t(s, v) : String(s).replace(/\{(\w+)\}/g, (h, k) => (v && k in v ? String(v[k]) : h))) };

  // FROZEN: «Humla nr. 1» is 13 November 2026 (data/blomster.json «dagens»[0]).
  const FORSTE = Math.floor(Date.UTC(2026, 10, 13) / 86400000);
  // The ranks: the share of the day's maximum points each one needs.
  const GRENSER = [0, 0.03, 0.07, 0.12, 0.2, 0.3, 0.4, 0.7, 1];
  const MAAL = 6; // «Honning»: the day's goal
  const IKON = ["🌰", "🌱", "🌿", "🌷", "💐", "🌾", "🍯", "👑", "🌻"];
  const MIN_LENGDE = 4;

  const indeksFor = (nr, antall) => ((((nr - FORSTE) % antall) + antall) % antall);
  const nrFor = (nr) => nr - FORSTE + 1;
  const bokstaver = (o) => Array.from(String(o || ""));

  // A day: «<centre><six others>». Its answers: the words of the list made only of its letters,
  // with the centre letter, four letters or more.
  function svarFor(dag, liste) {
    const sett = new Set(bokstaver(dag));
    const midt = bokstaver(dag)[0];
    return liste.filter((o) => {
      const b = bokstaver(o);
      return b.length >= MIN_LENGDE && b.includes(midt) && b.every((x) => sett.has(x));
    });
  }
  const erBlomsterord = (o, dag) => bokstaver(dag).every((b) => o.includes(b));
  const poeng = (o, dag) => (bokstaver(o).length === MIN_LENGDE ? 1 : bokstaver(o).length) + (erBlomsterord(o, dag) ? 7 : 0);
  const sumPoeng = (ord, dag) => ord.reduce((s, o) => s + poeng(o, dag), 0);
  // The points a rank needs (rank 8 needs every word).
  const grenseFor = (r, maks) => (r >= GRENSER.length - 1 ? maks : Math.round(GRENSER[r] * maks));
  function rang(p, maks) {
    let r = 0;
    for (let i = 1; i < GRENSER.length; i++) if (p >= grenseFor(i, maks)) r = i;
    return r;
  }

  // Why a typed word is not taken ("" when it is a new answer).
  function vurder(ord, dag, svar, funnet) {
    const b = bokstaver(ord);
    if (b.length < MIN_LENGDE) return "kort";
    if (!b.includes(bokstaver(dag)[0])) return "midt";
    if (b.some((x) => !dag.includes(x))) return "bokstav";
    if (funnet.includes(ord)) return "funnet";
    if (!svar.includes(ord)) return "ukjent";
    return "";
  }

  // What is wrong with one day (an empty list when it is fine). Used by the unit test.
  function sjekkDag(dag, liste) {
    const feil = [];
    const b = bokstaver(dag);
    if (b.length !== 7 || new Set(b).size !== 7) feil.push(`«${dag}» må ha sju ulike bokstaver`); // sprak-ok (the unit test's own words)
    const svar = svarFor(dag, liste);
    if (svar.length < 20 || svar.length > 60) feil.push(`«${dag}» har ${svar.length} svar`); // sprak-ok
    if (!svar.some((o) => erBlomsterord(o, dag))) feil.push(`«${dag}» har ikke noe blomsterord`); // sprak-ok
    return feil;
  }

  const MOTOR = { FORSTE, GRENSER, MAAL, IKON, MIN_LENGDE, indeksFor, nrFor, svarFor, erBlomsterord, poeng, sumPoeng, grenseFor, rang, vurder, sjekkDag };

  const R = window.Rusj;
  if (!R) {
    window.Humla = MOTOR;
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const D = window.RUSJ_DATA;
  const DAGER = D.blomster.dagens;
  const N = DAGER.length;
  const LISTE = D.blomster.ord.split(" ");
  const NAVN = (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Humla"; // sprak-ok
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "humla") + "/";
  const RANGNAVN = [R.t("Frø"), R.t("Spire"), R.t("Knopp"), R.t("Blomst"), R.t("Bukett"), R.t("Eng"), R.t("Honning"), R.t("Mesterhumle"), R.t("Hele blomsten")];
  const stor = (o) => String(o).toLocaleUpperCase(R.lokale || "nb");
  const MAKS_SKREVET = 19;

  let H;
  let skrevet = ""; // the word being typed (not saved: a reload starts an empty word)
  let melding = null; // { tekst, klasse }
  let meldingId = null;
  let nyFeiring = false;
  let tikker = null;
  let opptatt = false;

  const iDag = () => R.dag().nr;
  const dagFor = (nr) => DAGER[indeksFor(nr, N)];
  const svarCache = new Map();
  const svarAv = (nr) => {
    const dag = dagFor(nr);
    if (!svarCache.has(dag)) svarCache.set(dag, svarFor(dag, LISTE));
    return svarCache.get(dag);
  };
  const aktiv = (S) => (S.modus === "ov" ? S.ov : S.dag);
  const info = (sp) => {
    const dag = dagFor(sp.nr);
    const svar = svarAv(sp.nr);
    const maks = sumPoeng(svar, dag);
    const p = sumPoeng(sp.funnet, dag);
    return { dag, svar, maks, p, r: rang(p, maks), blomster: sp.funnet.filter((o) => erBlomsterord(o, dag)).length, alleBlomster: svar.filter((o) => erBlomsterord(o, dag)).length };
  };
  const ferdig = (sp) => !!(sp && (sp.lukket || sp.funnet.length === svarAv(sp.nr).length));
  const iGang = (sp) => !!(sp && sp.funnet.length && !ferdig(sp) && !sp.maal);
  const dagenIGang = (S) => iGang(S.dag) && S.dag.nr === iDag();
  const pagar = (S) => dagenIGang(S) || iGang(S.ov);

  // The six outer letters in the order they are drawn (shuffled by «Stokk»).
  const nyttSpill = (nr) => ({ nr, funnet: [], rekkefolge: [1, 2, 3, 4, 5, 6], maal: false, lukket: false });
  function nyttDagspill(S) {
    S.dag = nyttSpill(iDag());
    R.statistikk("start", { modus: "dag" });
  }
  function eldre() {
    const d = iDag();
    const liste = [];
    for (let nr = d - 1; nr >= Math.max(FORSTE, d - N + 1); nr--) liste.push(nr);
    return liste;
  }

  // ---------- Statistics ----------

  const tall = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
  const tomStat = () => ({ spilt: 0, maal: 0, rekke: 0, best: 0, sistMaal: null, sistSpilt: null });
  // A day counts once: when the goal is reached, or when the day is closed before that.
  function registrerDag(S, sp, vunnet) {
    const st = S.stat;
    if (st.sistSpilt === sp.nr) return;
    st.sistSpilt = sp.nr;
    st.spilt += 1;
    if (vunnet) {
      st.maal += 1;
      st.rekke = st.sistMaal === sp.nr - 1 ? st.rekke + 1 : 1;
      st.sistMaal = sp.nr;
      st.best = Math.max(st.best, st.rekke);
    } else st.rekke = 0;
    meldDagen(S, sp);
  }
  // The front page's «✓ i dag» and the result as the player would say it (the rank's name).
  function meldDagen(S, sp) {
    if (sp.nr !== iDag() || S.stat.sistSpilt !== sp.nr) return;
    const vunnet = S.stat.sistMaal === sp.nr;
    R.dagligFerdig({ vunnet, rekke: vunnet ? S.stat.rekke : 0, res: RANGNAVN[info(sp).r] });
  }
  const rekkeNa = (S) => (S.stat.sistMaal != null && S.stat.sistMaal >= iDag() - 1 ? S.stat.rekke : 0);

  // ---------- Countdown to the next flower ----------

  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: R.tidssone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const to = (n) => String(n).padStart(2, "0");
  const klokke = (s) => `${to(Math.floor(s / 3600))}:${to(Math.floor((s % 3600) / 60))}:${to(s % 60)}`;
  const nedtellingHtml = () => `<p class="hu-nedtelling">${esc(R.t("Ny blomst om"))} <b>${klokke(sekunderTilNy())}</b></p>`;
  function startNedtelling() {
    clearInterval(tikker);
    const dag = iDag();
    tikker = setInterval(() => {
      const el = R.$(".hu-nedtelling b");
      if (!el) return clearInterval(tikker);
      if (iDag() !== dag) {
        clearInterval(tikker);
        return R.vis();
      }
      el.textContent = klokke(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(tikker));
  }

  // ---------- Markup ----------

  // The ladder: nine dots, the reached ones filled, the goal marked with a pot of honey.
  function stigeHtml(inf) {
    return `<div class="hu-stige" aria-hidden="true">${RANGNAVN.map((_, i) => `<i class="${i <= inf.r ? "na" : ""}${i === MAAL ? " maal" : ""}${i === inf.r ? " her" : ""}"></i>`).join("")}</div>`;
  }
  function rangHtml(sp) {
    const inf = info(sp);
    const neste = inf.r < RANGNAVN.length - 1 ? grenseFor(inf.r + 1, inf.maks) - inf.p : 0;
    const etikett = R.t("Rang: {rang}. {poeng}.", { rang: RANGNAVN[inf.r], poeng: R.t("{n} poeng", { n: inf.p }) }) + (neste ? " " + R.t("{n} til neste rang.", { n: neste }) : "");
    return `<button class="hu-rang" data-h="rangene" aria-label="${esc(etikett + " " + R.t("Vis rangene"))}">
        <span class="hu-rangnavn"><span aria-hidden="true">${IKON[inf.r]}</span> ${esc(RANGNAVN[inf.r])}</span>
        ${stigeHtml(inf)}
        <span class="hu-poeng">${esc(R.t("{n} p", { n: inf.p }))}</span>
      </button>`;
  }
  function funnetHtml(sp) {
    const inf = info(sp);
    const siste = sp.funnet.slice(-4).reverse();
    return `<button class="hu-funnet" data-h="ordene" aria-label="${esc(R.t("Ordene dine: {n} av {av}. Vis alle.", { n: sp.funnet.length, av: inf.svar.length }))}">
        <b>${esc(R.t("{n} av {av} ord", { n: sp.funnet.length, av: inf.svar.length }))}</b>
        <span class="hu-siste">${siste.length ? esc(siste.map((o) => stor(o) + (erBlomsterord(o, inf.dag) ? " 🌸" : "")).join(" · ")) : esc(R.t("Ingen ord ennå"))}</span>
        <i aria-hidden="true">›</i>
      </button>`;
  }
  function skrevetHtml(sp) {
    const midt = bokstaver(dagFor(sp.nr))[0];
    const b = bokstaver(skrevet);
    return b.length
      ? b.map((x) => `<span class="${x === midt ? "midt" : !dagFor(sp.nr).includes(x) ? "fremmed" : ""}">${esc(stor(x))}</span>`).join("")
      : `<span class="hu-tom">${esc(R.t("Trykk på bokstavene"))}</span>`;
  }
  function hjelpHtml() {
    return melding ? `<span class="hu-varsel ${melding.klasse || ""}">${esc(melding.tekst)}</span>` : "";
  }
  // The flower: the centre letter in the middle, the other six around it.
  function blomstHtml(sp, av) {
    const dag = bokstaver(dagFor(sp.nr));
    const kronblad = sp.rekkefolge
      .map(
        (i, n) =>
          `<button class="hu-blad" style="--v:${n * 60}deg" data-h="tast" data-v="${esc(dag[i])}" data-stille aria-label="${esc(stor(dag[i]))}"${av ? " disabled" : ""}><span>${esc(stor(dag[i]))}</span></button>`, // sprak-ok (a CSS angle)
      )
      .join("");
    return `<div class="hu-blomst" role="group" aria-label="${esc(R.t("Blomsten: {midt} i midten", { midt: stor(dag[0]) }))}">
        ${kronblad}
        <button class="hu-midt" data-h="tast" data-v="${esc(dag[0])}" data-stille aria-label="${esc(R.t("{b}, midtbokstaven", { b: stor(dag[0]) }))}"${av ? " disabled" : ""}><span>${esc(stor(dag[0]))}</span></button>
      </div>`;
  }
  const STOKK_IKON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>';
  function knapperHtml(av) {
    return `<div class="hu-knapper">
        <button class="knapp-2 hu-slett" data-h="tast" data-v="slett" data-stille${av ? " disabled" : ""}>${esc(R.t("Slett"))}</button>
        <button class="knapp-2 hu-stokk" data-h="tast" data-v="stokk" data-stille aria-label="${esc(R.t("Stokk bokstavene"))}"${av ? " disabled" : ""}>${STOKK_IKON}</button>
        <button class="knapp hu-send" data-h="tast" data-v="send" data-stille${av ? " disabled" : ""}>${esc(R.t("Send"))}</button>
      </div>`;
  }

  // All the words of a day: the found ones, or every answer with the missed ones marked.
  function ordlisteHtml(sp, alle) {
    const inf = info(sp);
    const ord = (alle ? inf.svar : sp.funnet).slice().sort((a, b) => a.localeCompare(b, R.lokale));
    if (!ord.length) return `<p class="hjelp">${esc(R.t("Du har ikke funnet noen ord ennå."))}</p>`;
    return `<ul class="hu-ordliste">${ord
      .map((o) => {
        const fant = sp.funnet.includes(o);
        const bl = erBlomsterord(o, inf.dag);
        const tekst = stor(o) + (bl ? " 🌸" : "");
        return `<li class="${bl ? "blomst" : ""}${alle && !fant ? " glemt" : ""}">${esc(tekst)}${alle && !fant ? `<span class="vh"> ${esc(R.t("(ikke funnet)"))}</span>` : ""}</li>`;
      })
      .join("")}</ul>`;
  }
  function ordArk(S) {
    const sp = aktiv(S);
    const inf = info(sp);
    const vis = ferdig(sp);
    return `<h2 id="ark-tittel">${esc(vis ? R.t("Alle ordene") : R.t("Ordene dine"))}</h2>
      <p class="hjelp">${esc(R.t("{n} av {av} ord", { n: sp.funnet.length, av: inf.svar.length }))} · ${esc(R.t("{n} av {av} blomsterord", { n: inf.blomster, av: inf.alleBlomster }))}</p>
      ${ordlisteHtml(sp, vis)}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }
  // The ladder with names and points (the rules and the rank sheet).
  function rangArk(S) {
    const sp = aktiv(S);
    const inf = info(sp);
    return `<h2 id="ark-tittel">${esc(R.t("Rangene"))}</h2>
      <p class="hjelp">${esc(R.t("Poengene du trenger i dag. Honning er dagens mål."))}</p>
      <ol class="hu-rangliste">${RANGNAVN.map(
        (n, i) => `<li class="${i === inf.r ? "her" : ""}${i === MAAL ? " maal" : ""}"><span aria-hidden="true">${IKON[i]}</span><b>${esc(n)}</b><span>${esc(R.t("{n} p", { n: grenseFor(i, inf.maks) }))}</span></li>`,
      ).join("")}</ol>
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }
  function tallHtml(S) {
    const st = S.stat;
    return `<div class="hu-tall">
        <div><b>${R.tall(st.spilt)}</b><span>${esc(R.t("spilt"))}</span></div>
        <div><b>${R.tall(st.maal)}</b><span>${esc(R.t("honning"))}</span></div>
        <div><b>${R.tall(rekkeNa(S))}</b><span>${esc(R.t("på rad"))}</span></div>
        <div><b>${R.tall(st.best)}</b><span>${esc(R.t("beste rekke"))}</span></div>
      </div>`;
  }
  function statistikkArk(S) {
    return `<h2 id="ark-tittel">${esc(R.t("Statistikk"))}</h2>
      ${S.stat.spilt ? tallHtml(S) + `<p class="hjelp">${esc(R.t("En dag teller når du når honning, eller når du ser svarene før det."))}</p>` : `<p class="ingress">${esc(R.t("Du har ikke spilt dagens blomst ennå. Gjør det, så dukker statistikken opp her."))}</p>`}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }

  // ---------- Playing ----------

  const lyd = {
    tast: () => R.lyd.tone(980, 0, 0.03, "sine", 0.05),
    nei: () => R.lyd.tone(220, 0, 0.16, "triangle", 0.14, 170),
    ord: (n) => [660, 880].forEach((f, i) => R.lyd.tone(f + n * 20, i * 0.07, 0.12, "triangle", 0.09)),
    blomst: () => [523, 659, 784, 1047].forEach((f, i) => R.lyd.tone(f, i * 0.08, 0.16, "triangle", 0.1)),
  };

  function oppdaterSkrevet(S) {
    const sp = aktiv(S);
    const el = R.$(".hu-skrevet");
    if (el && sp) el.innerHTML = skrevetHtml(sp);
  }
  function visHjelp() {
    const el = R.$(".hu-hjelp");
    if (el) el.innerHTML = hjelpHtml();
  }
  function settMelding(tekst, klasse, ms) {
    clearTimeout(meldingId);
    melding = { tekst, klasse };
    visHjelp();
    meldingId = setTimeout(() => {
      melding = null;
      meldingId = null;
      visHjelp();
    }, ms || 2000);
  }
  function rist() {
    const el = R.$(".hu-skrevet");
    if (!el || R.rolig()) return;
    el.classList.remove("risting");
    void el.offsetWidth;
    el.classList.add("risting");
  }

  function trykk(S, v) {
    const sp = aktiv(S);
    if (!sp || S.skjerm !== "brett" || ferdig(sp) || opptatt) return;
    if (v === "slett") {
      skrevet = bokstaver(skrevet).slice(0, -1).join("");
      lyd.tast();
      return oppdaterSkrevet(S);
    }
    if (v === "stokk") return stokk(S);
    if (v === "send") return send(S);
    if (bokstaver(v).length !== 1) return;
    if (!dagFor(sp.nr).includes(v)) {
      lyd.nei();
      return settMelding(R.t("Bare bokstavene i blomsten"), "feil", 1600);
    }
    if (bokstaver(skrevet).length >= MAKS_SKREVET) return;
    skrevet += v;
    lyd.tast();
    oppdaterSkrevet(S);
  }

  function stokk(S) {
    const sp = aktiv(S);
    let ny = R.stokk(sp.rekkefolge);
    for (let n = 0; n < 5 && ny.join() === sp.rekkefolge.join(); n++) ny = R.stokk(sp.rekkefolge);
    sp.rekkefolge = ny;
    R.lagre();
    R.lyd.tone(520, 0, 0.06, "sine", 0.05);
    const blomst = R.$(".hu-blomst");
    if (blomst) {
      const ny2 = document.createElement("div");
      ny2.innerHTML = blomstHtml(sp, false);
      blomst.replaceWith(ny2.firstElementChild);
      if (!R.rolig()) R.$(".hu-blomst").classList.add("stokket");
    }
    R.si(R.t("Bokstavene er stokket."));
  }

  const ROS = [R.t("Bra!"), R.t("Fint!"), R.t("Flott!"), R.t("Supert!")];
  function send(S) {
    const sp = aktiv(S);
    const ord = skrevet;
    if (!ord) return;
    const inf = info(sp);
    const grunn = vurder(ord, inf.dag, inf.svar, sp.funnet);
    if (grunn) {
      const tekst = { kort: R.t("For kort – minst fire bokstaver"), midt: R.t("Mangler midtbokstaven"), bokstav: R.t("Bare bokstavene i blomsten"), funnet: R.t("Det ordet har du alt"), ukjent: R.t("Ikke i ordlista") }[grunn];
      lyd.nei();
      R.vibrer(40);
      rist();
      settMelding(tekst, "feil", 1800);
      R.si(tekst);
      const fortsatt = R.vakt();
      setTimeout(() => {
        if (!fortsatt() || skrevet !== ord) return;
        skrevet = "";
        oppdaterSkrevet(R.S);
      }, 650);
      return;
    }
    const forRang = inf.r;
    sp.funnet.push(ord);
    skrevet = "";
    const etter = info(sp);
    const p = poeng(ord, inf.dag);
    const blomst = erBlomsterord(ord, inf.dag);
    const dag = S.modus === "dag";
    let nyttMaal = false;
    if (!sp.maal && etter.r >= MAAL) {
      sp.maal = true;
      nyttMaal = true;
      if (dag) registrerDag(S, sp, true);
      else S.ovLost[sp.nr] = Math.max(S.ovLost[sp.nr] || 0, etter.r);
    } else if (dag && sp.maal) meldDagen(S, sp);
    if (!dag && sp.maal) S.ovLost[sp.nr] = Math.max(S.ovLost[sp.nr] || 0, etter.r);
    if (dag && sp.nr === iDag() && !sp.maal) R.dagligIGang({ tekst: R.t("{n} ord", { n: sp.funnet.length }) });
    const alle = sp.funnet.length === etter.svar.length;
    if (alle || nyttMaal) R.statistikk("ferdig", { modus: S.modus, rang: etter.r, ord: sp.funnet.length });
    R.lagre();
    if (blomst) {
      lyd.blomst();
      R.vibrer([30, 40, 30]);
    } else {
      lyd.ord(Math.min(8, bokstaver(ord).length - 4));
      R.vibrer(25);
    }
    melding = { tekst: blomst ? R.t("Blomsterord! +{p}", { p }) : `${ROS[Math.min(3, bokstaver(ord).length - 4)]} +${p}`, klasse: blomst ? "blomst" : "ok" };
    R.vis();
    R.si(`${R.t("{ord} gir {poeng}.", { ord: stor(ord), poeng: R.t("{n} poeng", { n: p }) })}${etter.r > forRang ? " " + R.t("Ny rang: {rang}.", { rang: RANGNAVN[etter.r] }) : ""}`);
    clearTimeout(meldingId);
    meldingId = setTimeout(() => {
      melding = null;
      meldingId = null;
      visHjelp();
    }, 1800);
    if (etter.r > forRang && !R.rolig()) {
      const el = R.$(".hu-rang");
      if (el) el.classList.add("opp");
    }
    if (nyttMaal || alle) feir(S, alle);
  }

  // The goal (or every word): a short celebration on the board, then the result.
  function feir(S, alle) {
    const fortsatt = R.vakt();
    opptatt = true;
    R.lyd.fanfare();
    if (!R.rolig()) R.konfetti();
    nyFeiring = true;
    setTimeout(() => {
      opptatt = false;
      if (fortsatt()) R.gaTil("resultat");
    }, R.rolig() ? 500 : alle ? 1600 : 1300);
  }

  async function lukkDagen(S) {
    const sp = aktiv(S);
    if (!sp || ferdig(sp)) return;
    const ok = await R.bekreft(R.t("Vis svarene?"), sp.maal ? R.t("Da ser du alle ordene, og blomsten er ferdig for denne gangen.") : R.t("Da ser du alle ordene, og blomsten er ferdig for denne gangen. Du har ikke nådd honning ennå."), R.t("Vis svarene"), R.t("Spill videre"));
    if (!ok) return;
    sp.lukket = true;
    skrevet = "";
    if (S.modus === "dag" && !sp.maal) registrerDag(S, sp, false);
    if (S.modus === "ov") S.ovLost[sp.nr] = Math.max(S.ovLost[sp.nr] || 0, info(sp).r);
    R.statistikk("ferdig", { modus: S.modus, rang: info(sp).r, ord: sp.funnet.length, lukket: true });
    R.lagre();
    R.gaTil("resultat");
  }

  // ---------- Sharing (the rank and the numbers, never the words) ----------

  function delLinjer(S) {
    const sp = S.dag;
    const inf = info(sp);
    const rekke = rekkeNa(S);
    return {
      hode: `${R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) })} · ${RANGNAVN[inf.r]} ${IKON[inf.r]}`,
      tall: `${R.t("{n} poeng", { n: inf.p })} · ${R.t("{n} ord", { n: sp.funnet.length })}${inf.blomster ? ` · 🌸 ${inf.blomster}` : ""}`,
      stige: IKON.slice(0, inf.r + 1).join(""),
      rekke: sp.maal && rekke > 1 ? `🔥 ${R.t("{n} på rad", { n: rekke })}` : "",
    };
  }
  function delTekst(S) {
    const l = delLinjer(S);
    return `${l.hode}\n\n${l.tall}\n${l.stige}${l.rekke ? "\n" + l.rekke : ""}\n`;
  }
  function delKort(S) {
    const l = delLinjer(S);
    const inf = info(S.dag);
    return { tittel: R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(S.dag.nr) }), linjer: [RANGNAVN[inf.r], l.tall, l.stige, l.rekke].filter(Boolean) };
  }

  const DATO = new Intl.DateTimeFormat(R.lokale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const datoFor = (nr) => DATO.format(new Date(nr * 86400000 + 12 * 3600000)).replace(/\.$/, "");

  // Physical keyboard (computers, tablets with a keyboard).
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "brett" || e.ctrlKey || e.metaKey || e.altKey || (R.arkApent && R.arkApent())) return;
    const el = e.target;
    if (el && el.closest && el.closest("input, textarea, select")) return;
    if ((e.key === "Enter" || e.key === " ") && el && el.closest && el.closest("button, a")) return;
    let v = null;
    if (e.key === "Enter") v = "send";
    else if (e.key === "Backspace") v = "slett";
    else if (e.key && e.key.length === 1 && /\p{L}/u.test(e.key)) v = e.key.toLocaleLowerCase(R.lokale || "nb");
    if (!v) return;
    e.preventDefault();
    trykk(S, v);
  });
  // The on-screen keys never take the focus from a finger, so Enter on a real keyboard always sends.
  document.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.closest && e.target.closest(".hu-blad, .hu-midt, .hu-knapper button")) e.preventDefault();
  });

  R.start({
    id: "humla",
    versjon: 1,
    pagar,
    _motor: MOTOR,
    _svar: (nr) => svarAv(nr).slice(),

    tilstand: () => ({
      modus: "dag",
      dag: null, // { nr, funnet: [], rekkefolge: [6], maal, lukket }
      ov: null,
      stat: tomStat(),
      ovLost: {}, // day number → the best rank reached in practice
    }),

    lastet(S) {
      const ok = (sp) =>
        sp &&
        Number.isInteger(sp.nr) &&
        Array.isArray(sp.funnet) &&
        sp.funnet.length <= 200 &&
        sp.funnet.every((o) => typeof o === "string") &&
        Array.isArray(sp.rekkefolge) &&
        sp.rekkefolge.slice().sort().join() === "1,2,3,4,5,6";
      if (!ok(S.dag)) S.dag = null;
      if (!ok(S.ov)) S.ov = null;
      for (const sp of [S.dag, S.ov]) {
        if (!sp) continue;
        const svar = svarAv(sp.nr);
        sp.funnet = sp.funnet.filter((o, i, a) => svar.includes(o) && a.indexOf(o) === i);
        sp.maal = !!sp.maal || info(sp).r >= MAAL;
        sp.lukket = !!sp.lukket;
      }
      if (S.modus !== "ov") S.modus = "dag";
      const st = S.stat && typeof S.stat === "object" ? S.stat : {};
      S.stat = {
        spilt: tall(st.spilt),
        maal: tall(st.maal),
        rekke: tall(st.rekke),
        best: tall(st.best),
        sistMaal: Number.isInteger(st.sistMaal) ? st.sistMaal : null,
        sistSpilt: Number.isInteger(st.sistSpilt) ? st.sistSpilt : null,
      };
      const ovl = S.ovLost && typeof S.ovLost === "object" && !Array.isArray(S.ovLost) ? S.ovLost : {};
      S.ovLost = {};
      for (const k of Object.keys(ovl)) if (/^\d+$/.test(k) && Number.isInteger(ovl[k]) && ovl[k] >= 0 && ovl[k] <= 8) S.ovLost[k] = ovl[k];
      // A finished day that was never counted, and the front page kept in step.
      if (S.dag) {
        if (S.dag.maal) {
          if (S.stat.sistSpilt !== S.dag.nr) registrerDag(S, S.dag, true);
          else meldDagen(S, S.dag);
        } else if (S.dag.lukket) {
          if (S.stat.sistSpilt !== S.dag.nr) registrerDag(S, S.dag, false);
          else meldDagen(S, S.dag);
        }
      }
      const sp = aktiv(S);
      if ((S.skjerm === "brett" || S.skjerm === "resultat") && !sp) S.skjerm = "hjem";
      if (S.skjerm === "brett" && sp && ferdig(sp)) S.skjerm = "resultat";
    },

    regler: {
      intro: R.t("Lag så mange ord du kan av de sju bokstavene i blomsten. Bokstaven i midten må være med i hvert ord."),
      steg: [
        [R.t("Lag et ord"), R.t("Trykk på bokstavene, eller skriv på tastaturet, og trykk «Send». Ordet må ha minst fire bokstaver og midtbokstaven.")],
        [R.t("Samle poeng"), R.t("Et ord på fire bokstaver gir 1 poeng, lengre ord ett poeng per bokstav. Et blomsterord bruker alle sju bokstavene og gir 7 poeng ekstra.")],
        [R.t("Nå honning"), R.t("Poengene tar deg opp ni rang, fra frø til hele blomsten. Honning er dagens mål – men du kan fortsette så lenge du vil.")],
      ],
      tips: [
        R.t("Samme bokstav kan brukes flere ganger i ett ord."),
        R.t("«Stokk» flytter bokstavene rundt og kan gi deg nye ideer."),
        R.t("Bøyde former teller også, som flertall og fortid."),
        R.t("Alle får samme blomst. En ny kommer ved midnatt."),
        R.t("Del rangen og poengene dine – uten å røpe ordene."),
        R.t("Ordlista bygger på Norsk ordbank – bokmål 2005 fra Språkbanken ved Nasjonalbiblioteket (CC BY 4.0). Stygge, grove og svært sjeldne ord er tatt ut."),
      ],
      get ekstraHtml() {
        return `<h3>${esc(R.t("Rangene"))}</h3><ol class="hu-rangliste">${RANGNAVN.map((n, i) => `<li class="${i === MAAL ? "maal" : ""}"><span aria-hidden="true">${IKON[i]}</span><b>${esc(n)}</b><span>${esc(R.t("{n} %", { n: Math.round(GRENSER[i] * 100) }))}</span></li>`).join("")}</ol>`;
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = S.dag && S.dag.nr === iDag() ? S.dag : null;
          const nadd = !!(d && (d.maal || ferdig(d)));
          const iGangD = !!(d && d.funnet.length && !nadd);
          const hoved = nadd
            ? R.ui.knapp(R.t("Se dagens resultat"), "se-resultat") + (ferdig(d) ? "" : R.ui.knapp2(R.t("Finn flere ord"), "dag"))
            : R.ui.knapp(iGangD ? R.t("Fortsett dagens blomst · {n} ord", { n: d.funnet.length }) : R.t("Dagens blomst"), "dag", { variant: iGangD ? "" : "stor" });
          const rekke = rekkeNa(S);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Sju bokstaver. Mange ord."))}<br><em>${esc(R.t("Ny blomst hver dag."))}</em>`,
            knapperHtml:
              hoved +
              (nadd ? nedtellingHtml() : "") +
              (eldre().length ? R.ui.knapp2(iGang(S.ov) ? R.t("Fortsett øvingen") : R.t("Øv med eldre blomster"), "ov") : "") +
              R.ui.lenkerad(R.ui.lenke(R.t("Statistikk"), "statistikk"), R.ui.lenke(R.t("Slik spiller du"), "regler")),
            merker: [["7", R.t("bokstaver")], ["4+", R.t("bokstaver i hvert ord")], rekke ? [`🔥 ${rekke}`, rekke === 1 ? R.t("dag på rad") : R.t("dager på rad")] : ["🍯", R.t("dagens mål")]],
          });
        },
        inn(S) {
          if (S.dag && S.dag.nr === iDag() && (S.dag.maal || ferdig(S.dag))) startNedtelling();
        },
      },

      brett: {
        tittel: (S) => (S.modus === "ov" ? R.t("Øving · nr. {nr}", { nr: nrFor(S.ov.nr) }) : R.t("Dagens blomst")),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const ov = S.modus === "ov";
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(ov ? R.t("Øving: {navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) }) : R.t("Dagens blomst"))}</h1>
            <div class="hu-info">
              ${rangHtml(sp)}
              ${funnetHtml(sp)}
            </div>
            <div class="hu-spill">
              <div class="hu-ordfelt">
                <p class="hu-skrevet" aria-live="off">${skrevetHtml(sp)}</p>
                <p class="hu-hjelp">${hjelpHtml()}</p>
              </div>
              ${blomstHtml(sp, opptatt)}
              ${R.ui.dokk(knapperHtml(opptatt), R.ui.lenkerad(R.ui.lenke(R.t("Vis svarene"), "vis-svar")))}
            </div>`;
        },
        inn() {
          opptatt = false;
          skrevet = "";
          melding = null;
        },
        ut() {
          opptatt = false;
          melding = null;
          clearTimeout(meldingId);
          meldingId = null;
        },
      },

      arkiv: {
        tittel: R.t("Eldre blomster"),
        tilbake: "hjem",
        vis(S) {
          const rader = eldre()
            .map((nr) => {
              const r = S.ovLost[nr];
              const paGang = S.ov && S.ov.nr === nr && iGang(S.ov);
              const merke = r != null ? [IKON[r], RANGNAVN[r]] : paGang ? ["…", R.t("påbegynt")] : ["", R.t("ny")];
              const ovH = 'data-h="spill-ov"'; // sprak-ok (an action name)
              return `<li><button class="hu-arkivrad${r != null && r >= MAAL ? " lost" : ""}" ${ovH} data-v="${nr}" aria-label="${esc(R.t("Nr. {nr}, {dato}, {status}", { nr: nrFor(nr), dato: datoFor(nr), status: merke[1] }))}">
                <b>${esc(R.t("Nr. {nr}", { nr: nrFor(nr) }))}</b><span>${esc(datoFor(nr))}</span><i aria-hidden="true">${merke[0]}</i></button></li>`;
            })
            .join("");
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Eldre blomster"))}</h1>
            <p class="ingress">${esc(R.t("Spill blomstene fra dagene før. Øving teller ikke i statistikken."))}</p>
            <ul class="hu-arkiv">${rader}</ul>
            ${R.ui.dokk(R.ui.knapp(R.t("Tilfeldig blomst"), "tilfeldig"), R.ui.lenkerad(R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem")))}`;
        },
      },

      resultat: {
        tittel: (S) => (S.modus === "ov" ? R.t("Øving · nr. {nr}", { nr: nrFor(S.ov.nr) }) : R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(S.dag.nr) })),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const inf = info(sp);
          const ov = S.modus === "ov";
          const gammel = !ov && sp.nr !== iDag();
          const alle = sp.funnet.length === inf.svar.length;
          const banner = R.ui.banner({
            etikett: `${IKON[inf.r]} ${RANGNAVN[inf.r]}`,
            tittel: alle ? R.t("Du fant hvert eneste ord!") : sp.maal ? R.t("Du nådde honning!") : R.t("Du fant {n} av {av} ord", { n: sp.funnet.length, av: inf.svar.length }),
            tekst: `${R.t("{n} poeng", { n: inf.p })} · ${R.t("{n} av {av} ord", { n: sp.funnet.length, av: inf.svar.length })} · ${R.t("{n} av {av} blomsterord", { n: inf.blomster, av: inf.alleBlomster })}`,
            klasse: "hu-banner",
            stemning: sp.maal ? "jubel" : inf.r >= 3 ? "" : "lei",
          });
          const ordSeksjon = `<section class="seksjon hu-ordene" aria-labelledby="hu-ordene-tittel"><h2 id="hu-ordene-tittel">${esc(ferdig(sp) ? R.t("Alle ordene") : R.t("Ordene dine"))}</h2>${ordlisteHtml(sp, ferdig(sp))}${
            ferdig(sp) ? "" : `<p class="hjelp">${esc(R.t("Svarene vises når du trykker «Vis svarene» – eller i morgen, under eldre blomster."))}</p>`
          }</section>`;
          const videre = !ferdig(sp) ? R.ui.lenke(R.t("Finn flere ord"), "fortsett") : "";
          if (ov) {
            return `${banner}
              ${ordSeksjon}
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(R.ui.knapp(R.t("Flere blomster"), "arkiv"), R.ui.lenkerad(videre, R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
          }
          return `${banner}
            ${gammel ? `<p class="hu-nedtelling"><b>${esc(R.t("En ny blomst er klar!"))}</b></p>` : nedtellingHtml()}
            ${ordSeksjon}
            <section class="seksjon hu-stat" aria-labelledby="hu-stat-tittel">
              <h2 id="hu-stat-tittel">${esc(R.t("Statistikk"))}</h2>
              ${tallHtml(S)}
            </section>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(
              gammel ? R.ui.knapp(R.t("Spill dagens blomst"), "dag") : R.ui.knapp(R.t("Del resultatet"), "del"),
              R.ui.lenkerad(gammel ? "" : videre, R.ui.lenke(R.t("Øv med eldre blomster"), "arkiv"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
            )}`;
        },
        inn(S) {
          R.slippVaken();
          const sp = aktiv(S);
          if (S.modus === "dag" && sp.nr === iDag()) startNedtelling();
          if (!nyFeiring) return;
          nyFeiring = false;
          if (S.modus === "dag") {
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 3000);
          }
        },
      },
    },

    // rusj.no/humla/#dagens: today's flower, or its result when the goal is reached.
    vedHash(S, hash) {
      if (hash !== "dagens") return null;
      if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
      S.modus = "dag";
      return S.dag.maal || ferdig(S.dag) ? "resultat" : "brett";
    },

    handlinger: (H = {
      dag(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
        S.modus = "dag";
        R.gaTil(ferdig(S.dag) ? "resultat" : "brett");
      },
      "se-resultat"(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag() || !(S.dag.maal || ferdig(S.dag))) return H.dag(el, e, S);
        S.modus = "dag";
        R.gaTil("resultat");
      },
      fortsett(el, e, S) {
        const sp = aktiv(S);
        if (sp && !ferdig(sp)) R.gaTil("brett");
      },
      ov(el, e, S) {
        if (iGang(S.ov) && eldre().includes(S.ov.nr)) {
          S.modus = "ov";
          return R.gaTil("brett");
        }
        R.gaTil("arkiv");
      },
      arkiv() {
        R.gaTil("arkiv");
      },
      "spill-ov"(el, e, S) {
        const nr = Number(el.dataset.v);
        if (!eldre().includes(nr)) return;
        if (!S.ov || S.ov.nr !== nr) {
          S.ov = nyttSpill(nr);
          R.statistikk("start", { modus: "ov" });
        }
        S.modus = "ov";
        R.gaTil(ferdig(S.ov) ? "resultat" : "brett");
      },
      tilfeldig(el, e, S) {
        const liste = eldre();
        const nye = liste.filter((nr) => S.ovLost[nr] == null);
        const nr = R.velg(nye.length ? nye : liste);
        S.ov = nyttSpill(nr);
        S.modus = "ov";
        R.statistikk("start", { modus: "ov" });
        R.gaTil("brett");
      },
      hjem() {
        R.gaTil("hjem");
      },
      tast(el, e, S) {
        trykk(S, el.dataset.v);
      },
      ordene(el, e, S) {
        R.ark(ordArk(S));
      },
      rangene(el, e, S) {
        R.ark(rangArk(S));
      },
      "vis-svar"(el, e, S) {
        lukkDagen(S);
      },
      statistikk(el, e, S) {
        R.ark(statistikkArk(S));
      },
      del(el, e, S) {
        if (S.dag && (S.dag.maal || ferdig(S.dag))) return R.del(NAVN, delTekst(S), DEL_URL + "#utfordring", { kort: delKort(S) });
      },
    }),
  });
})();
