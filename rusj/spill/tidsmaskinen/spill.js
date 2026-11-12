/* Tidsmaskinen — «Tidslinja» on one phone.
   Every player (or team) builds a timeline of real events. Draw an event – its year is hidden –
   and put it where it belongs: drag the card into the timeline or tap a gap. «Sjekk året» rolls
   the year in like an old odometer: right, and the card stays; wrong, and it is thrown away (and
   you see where it belonged). First to the target wins – the round is played to the end, so
   everyone gets as many turns. Rekordjakt: one timeline, how many in a row before the first miss? */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;

  const KATEGORIER = D.kategorier;
  const KAT = Object.fromEntries(KATEGORIER.map((k) => [k.id, k]));
  // Every event in one list (files in name order), so the deck can remember what was drawn.
  const ALLE = [];
  Object.keys(D)
    .filter((n) => n.startsWith("hendelser-"))
    .sort()
    .forEach((n) => D[n].forEach((h) => ALLE.push(h)));
  const stokk = R.kortstokk("hendelser", ALLE.length);

  const MODUSER = ["spillere", "lag", "rekord"];
  const NIVAER = ["lett", "blandet", "vanskelig"];
  const MAL = [5, 7, 10];
  const ALLE_KAT = KATEGORIER.map((k) => k.id);
  const NIVANAVN = { lett: R.t("Lett"), blandet: R.t("Blandet"), vanskelig: R.t("Vanskelig") };
  const standardOppsett = () => ({ modus: "spillere", lag: 2, kategorier: ALLE_KAT.slice(), niva: "blandet", mal: 10, mer: false });
  // A phone on its side: the card and the buttons to the left, the timeline to the right.
  const LIGGENDE = window.matchMedia("(orientation: landscape) and (max-height: 600px) and (min-width: 560px)");
  // The reel behind each digit of the year: a question mark, then 0–9 three times.
  const STRIMMEL = "<i>?</i>" + "012345678901234567890123456789".replace(/\d/g, (d) => `<i>${d}</i>`);
  const SKJULT = '<span class="tm-skjult" aria-hidden="true"><i>?</i><i>?</i><i>?</i><i>?</i></span>';
  const GREP = '<svg class="tm-grep-ikon" viewBox="0 0 12 18" aria-hidden="true" focusable="false"><circle cx="3" cy="3" r="1.7"/><circle cx="9" cy="3" r="1.7"/><circle cx="3" cy="9" r="1.7"/><circle cx="9" cy="9" r="1.7"/><circle cx="3" cy="15" r="1.7"/><circle cx="9" cy="15" r="1.7"/></svg>';

  let H; // the actions, so one action can call another
  let opptatt = false; // the year is rolling in
  let sluppet = 0; // when a drag ended: a click right after it must not count as a tap on a gap

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erRekord = (sp) => sp.modus === "rekord";
  const lagNavn = (i) => R.lagNavn(i);
  const deltaker = (sp, i) => (sp.modus === "lag" ? lagNavn(i) : R.navn(i));
  // A team is the mascot on a disc in the team colour (as in Mimen and Nynneren).
  const lagFigur = (i, klasse) => `<span class="tm-lagfigur${klasse ? " " + klasse : ""}" style="--lf: ${R.LAG[i % R.LAG.length].farge}" aria-hidden="true">${R.figur()}</span>`;
  const aarTekst = (a) => (a < 0 ? R.t("{n} f.Kr.", { n: -a }) : String(a));
  const kortTekst = (n) => R.flertall(n, "kort", "kort");
  // «2 spillere» / «2 lag» when too many share a line to name them all.
  const flereTekst = (sp, n) => (sp.modus === "lag" ? R.flertall(n, "lag", "lag") : R.flertall(n, "spiller", "spillere"));
  // Where a gap is: «før 1905», «etter 1905» or «mellom 1905 og 1969».
  const hvorTekst = (f, e) => (f == null ? R.t("før {aar}", { aar: e }) : e == null ? R.t("etter {aar}", { aar: f }) : R.t("mellom {fra} og {til}", { fra: f, til: e }));
  const rader = (sp) => sp.linjer.map((l, i) => (sp.modus === "lag" ? { lag: i, poeng: l.length } : { i, poeng: l.length }));
  const rekorder = () => R.les("tidsmaskinen.rekord", {}) || {};
  const rekordFor = (niva) => Number(rekorder()[niva]) || 0;

  function passer(o, h) {
    if (!o.kategorier.includes(h.k)) return false;
    if (o.niva === "lett") return h.n <= 2; // well-known events
    if (o.niva === "vanskelig") return h.n === 3;
    return true;
  }
  const antallI = (o) => ALLE.reduce((s, h) => s + (passer(o, h) ? 1 : 0), 0);

  // Draw a card that hasn't been used in this game (the deck also avoids repeats between games).
  function trekk(sp) {
    const brukt = new Set(sp.brukt);
    let i = stokk.neste((x) => !brukt.has(x) && passer(sp.filter, ALLE[x]));
    if (i < 0 || brukt.has(i)) i = stokk.neste((x) => !brukt.has(x) && sp.filter.kategorier.includes(ALLE[x].k));
    if (i < 0 || brukt.has(i)) return -1;
    sp.brukt.push(i);
    return i;
  }

  // The gaps where a card from year a fits: every g with lo ≤ g ≤ hi (equal years fit on both sides).
  function luker(linje, a) {
    let lo = 0;
    while (lo < linje.length && ALLE[linje[lo]].a < a) lo++;
    let hi = lo;
    while (hi < linje.length && ALLE[linje[hi]].a <= a) hi++;
    return [lo, hi];
  }

  function nyttSpill(S) {
    const o = S.oppsett;
    const deltakere = o.modus === "spillere" ? R.klamp(S.antall || 2, 2, 10) : o.modus === "lag" ? o.lag : 1;
    const sp = {
      modus: o.modus,
      deltakere,
      mal: o.modus === "rekord" ? 0 : o.mal,
      filter: { kategorier: o.kategorier.slice(), niva: o.niva },
      linjer: [],
      tur: 0,
      runde: 1,
      kort: -1,
      plass: null,
      fase: "plasser", // plasser → svar → (next turn) plasser …
      svar: null,
      brukt: [],
      treff: Array(deltakere).fill(0),
      forsok: Array(deltakere).fill(0),
      rekke: 0,
      ferdig: false,
      slutt: null,
      vinnere: [],
      rekord: null,
    };
    for (let i = 0; i < deltakere; i++) {
      const k = trekk(sp);
      if (k < 0) return false;
      sp.linjer.push([k]); // everyone starts with one card, year showing
    }
    sp.kort = trekk(sp);
    if (sp.kort < 0) return false;
    S.spill = sp;
    return true;
  }

  // Who plays next, or -1 when the game is over. Once someone has reached the target, the round
  // is played to the end – but only by those who can still reach it this round.
  function hvemNeste(sp) {
    if (erRekord(sp)) return sp.svar && sp.svar.riktig ? 0 : -1;
    if (sp.linjer.some((l) => l.length >= sp.mal)) {
      for (let k = sp.tur + 1; k < sp.deltakere; k++) if (sp.linjer[k].length >= sp.mal - 1) return k;
      return -1;
    }
    return (sp.tur + 1) % sp.deltakere;
  }

  const siKort = (sp) => R.si(R.t("{hvem}: {kort}. Hvor i tidslinja hører det hjemme?", { hvem: erRekord(sp) ? R.t("Nytt kort") : deltaker(sp, sp.tur), kort: ALLE[sp.kort].t }));

  // ---------- Pieces of the turn screen ----------

  function hodeHtml(sp) {
    if (erRekord(sp)) {
      const best = rekordFor(sp.filter.niva);
      return `<div class="tm-hode tm-hode-rekord">
        <span class="tm-flamme" aria-hidden="true">🔥</span>
        <div class="tm-hvem"><p class="etikett">${esc(R.t("Rekka di"))}</p><h1 id="skjerm-tittel">${esc(R.t("{n} på rad", { n: sp.rekke }))}</h1></div>
        <p class="tm-best"><span>${esc(R.t("Rekord"))}</span><b>${best || "–"}</b></p>
      </div>`;
    }
    const i = sp.tur;
    const antall = sp.linjer[i].length;
    const merke = sp.modus === "lag" ? lagFigur(i) : R.avatar(i, "mid");
    const pips = Array.from({ length: sp.mal }, (_, n) => `<i class="${n < antall ? "fylt" : ""}"></i>`).join("");
    return `<div class="tm-hode">
      ${merke}
      <div class="tm-hvem"><p class="etikett">${esc(sp.modus === "lag" ? R.t("Lagets tur") : R.t("Din tur"))}</p><h1 id="skjerm-tittel">${esc(deltaker(sp, i))}</h1></div>
      <div class="tm-mal" role="img" aria-label="${esc(R.t("{n} av {av} kort", { n: antall, av: sp.mal }))}"><span class="tm-pips" aria-hidden="true">${pips}</span><span class="tm-mal-tall" aria-hidden="true">${antall}<small>/${sp.mal}</small></span></div>
    </div>`;
  }

  function handKortHtml(k) {
    const h = ALLE[k];
    const kat = KAT[h.k];
    return `<article class="tm-kort" id="tm-hand" data-dra="hand" style="--kf: ${kat.farge}" aria-label="${esc(R.t("Kortet: {kort}. Året er skjult.", { kort: h.t }))}">
      <div class="tm-kort-topp"><span class="tm-kat"><span aria-hidden="true">${kat.ikon}</span> ${esc(kat.kort)}</span><span class="tm-grep" aria-hidden="true">${GREP}<span class="tm-grep-tekst">${esc(R.t("Dra meg"))}</span></span></div>
      <p class="tm-kort-tekst">${esc(h.t)}</p>
      <div class="tm-kort-fot">${SKJULT}<span class="tm-kort-hint">${esc(R.t("Når skjedde det?"))}</span></div>
    </article>`;
  }

  function handHtml(sp) {
    if (sp.plass == null) {
      // The how-to line is for a player's first card; after that the timeline gets the room.
      const hjelp = sp.forsok[sp.tur]
        ? ""
        : `<p class="tm-hjelp">${esc(R.t("Dra kortet inn i tidslinja – eller trykk på {pluss} der det skal ligge.")).replace("{pluss}", '<b aria-hidden="true">+</b>')}</p>`;
      return `<section class="tm-hand" aria-label="${esc(R.t("Kortet du trakk"))}">${handKortHtml(sp.kort)}${hjelp}</section>`;
    }
    return `<section class="tm-hand tm-hand-tom" aria-label="${esc(R.t("Kortet du trakk"))}"><p class="tm-hjelp"><span aria-hidden="true">↓</span> ${esc(R.t("Kortet ligger i tidslinja. Flytt det – eller sjekk året!"))}</p></section>`;
  }

  function domHtml(sp) {
    const s = sp.svar;
    const h = ALLE[s.kort];
    const hendelse = `${esc(h.t)}: <b class="tm-dom-aar">${esc(aarTekst(h.a))}</b>`;
    let ord;
    let tekst;
    if (s.riktig) {
      const mal = !erRekord(sp) && sp.linjer[sp.tur].length >= sp.mal;
      ord = mal ? R.t("Mål!") : R.t("Riktig!");
      if (mal) tekst = esc(R.t("{navn} har {kort}!", { navn: deltaker(sp, sp.tur), kort: kortTekst(sp.mal) }) + (hvemNeste(sp) >= 0 ? " " + R.t("Runden spilles ferdig, så alle får like mange forsøk.") : ""));
      else tekst = `${hendelse}. ${esc(erRekord(sp) ? (sp.rekke % 5 === 0 ? R.t("{n} på rad – rekka vokser!", { n: sp.rekke }) : R.t("Rekka vokser!")) : R.t("Kortet blir liggende."))}`;
    } else {
      ord = R.t("Nesten!"); // one word for every miss, in every mode
      tekst = `${hendelse}. ${esc(R.t("Kortet kastes."))}`;
    }
    return `<div class="tm-dom ${s.riktig ? "riktig" : "feil"}" role="status"><span class="tm-dom-ord">${esc(ord)}</span><span class="tm-dom-tekst">${tekst}</span></div>`;
  }

  const aarKlasse = (a) => (aarTekst(a).length > 4 ? " lang" : "");

  function radHtml(k, klasse) {
    const h = ALLE[k];
    const merke = klasse === "tm-fersk" ? '<span class="tm-merke" aria-hidden="true">✓</span><span class="vh"> – ' + esc(R.t("nytt kort")) + "</span>" : "";
    return `<li class="tm-rad${klasse ? " " + klasse : ""}" style="--kf: ${KAT[h.k].farge}"><span class="tm-aar${aarKlasse(h.a)}">${esc(aarTekst(h.a))}</span><span class="tm-rad-tekst">${esc(h.t)}</span>${merke}</li>`;
  }

  // The drawn card lying in the timeline (or flying under the finger).
  function nyKortHtml(k, o = {}) {
    const h = ALLE[k];
    const aar = o.aar ? `<span class="tm-aar tm-vindu${aarKlasse(h.a)}">${esc(aarTekst(h.a))}</span>` : `<span class="tm-aar tm-vindu">${SKJULT}<span class="vh">${esc(R.t("Året er skjult"))}</span></span>`;
    const slutt = o.feil ? '<span class="tm-merke feil" aria-hidden="true">✗</span><span class="vh"> – ' + esc(R.t("feil plass")) + "</span>" : o.dra ? `<span class="tm-grep" aria-hidden="true">${GREP}</span>` : "";
    return `<div class="tm-rad tm-ny-kort${o.feil ? " tm-feil" : ""}"${o.dra ? ' data-dra="linje"' : ""} style="--kf: ${KAT[h.k].farge}">${aar}<span class="tm-rad-tekst">${esc(h.t)}</span>${slutt}</div>`;
  }

  function lukeHtml(sp, linje, g) {
    const f = g > 0 ? aarTekst(ALLE[linje[g - 1]].a) : null;
    const e = g < linje.length ? aarTekst(ALLE[linje[g]].a) : null;
    const hvor = hvorTekst(f, e);
    const synlig = f == null ? R.t("Før {aar}", { aar: e }) : e == null ? R.t("Etter {aar}", { aar: f }) : "";
    const her = sp.plass === g;
    return `<li class="tm-luke${her ? " tm-her" : ""}" data-luke="${g}">
      <button class="tm-gap" data-h="plasser" data-v="${g}" aria-label="${esc(R.t("Legg kortet {hvor}", { hvor }))}"><span class="tm-pluss" aria-hidden="true">+</span>${synlig ? `<span class="tm-gap-tekst" aria-hidden="true">${esc(synlig)}</span>` : ""}</button>
      ${her ? nyKortHtml(sp.kort, { dra: true }) : ""}
    </li>`;
  }

  function linjeHtml(sp) {
    const linje = sp.linjer[sp.tur];
    const s = sp.fase === "svar" ? sp.svar : null;
    const deler = [];
    if (!s) {
      for (let g = 0; g <= linje.length; g++) {
        deler.push(lukeHtml(sp, linje, g));
        if (g < linje.length) deler.push(radHtml(linje[g]));
      }
    } else if (s.riktig) {
      linje.forEach((k, n) => deler.push(radHtml(k, n === s.plass ? "tm-fersk" : "")));
    } else {
      // The card where it was put (wrong) and a ghost where it belonged.
      const fasit = s.plass < s.lo ? s.lo : s.hi;
      const h = ALLE[s.kort];
      for (let g = 0; g <= linje.length; g++) {
        if (g === s.plass) deler.push(`<li class="tm-ny tm-kastet">${nyKortHtml(s.kort, { aar: true, feil: true })}</li>`);
        if (g === fasit)
          deler.push(`<li class="tm-spokelse"><span class="tm-aar${aarKlasse(h.a)}">${esc(aarTekst(h.a))}</span><span class="tm-rad-tekst">${esc(R.t("Her hørte det hjemme"))}</span></li>`);
        if (g < linje.length) deler.push(radHtml(linje[g]));
      }
    }
    const antall = linje.length;
    return `<section class="tm-linje-boks" aria-labelledby="tm-linje-tittel">
      <div class="tm-linje-hode"><h2 id="tm-linje-tittel">${esc(R.t("Tidslinja"))}</h2><span class="tall">${kortTekst(antall)}</span></div>
      <ol class="tm-linje${s ? " tm-ferdig" : ""}">${deler.join("")}</ol>
    </section>`;
  }

  function dokkHtml(sp) {
    const lenker = R.ui.lenkerad(erRekord(sp) ? "" : R.ui.lenke(R.t("Stillingen"), "stilling"), R.ui.lenke(R.t("Avslutt"), "avslutt"));
    if (sp.fase === "plasser") return R.ui.dokk(R.ui.knapp(R.t("Sjekk året!"), "sjekk", { variant: "stor", id: "tm-sjekk", av: sp.plass == null }), lenker);
    const neste = hvemNeste(sp);
    let tekst = R.t("Til kåringen");
    if (erRekord(sp)) tekst = sp.svar.riktig ? R.t("Trekk neste kort") : R.t("Se resultatet");
    else if (neste >= 0) tekst = R.t("Neste: {navn}", { navn: deltaker(sp, neste) });
    return R.ui.dokk(R.ui.knapp(tekst, "neste", { id: "tm-neste" }), lenker);
  }

  const turSkjerm = (S) => {
    const sp = S.spill;
    const topp = `${hodeHtml(sp)}${sp.fase === "svar" ? domHtml(sp) : handHtml(sp)}`;
    // On its side, the card and the buttons are one column that follows the scrolling, next to
    // the timeline. Upright, the buttons come last (and stick to the bottom).
    return LIGGENDE.matches ? `<div class="tm-venstre">${topp}${dokkHtml(sp)}</div>${linjeHtml(sp)}` : `${topp}${linjeHtml(sp)}${dokkHtml(sp)}`;
  };

  // Scroll so the element is in view: under the top bar and above what the dock covers.
  function iSikte(el) {
    if (!el) return;
    const b = el.getBoundingClientRect();
    const dokk = R.$("#skjerm .dokk");
    const fast = dokk && getComputedStyle(dokk).position === "sticky";
    const bunn = fast ? dokk.getBoundingClientRect().top : window.innerHeight;
    if (b.top < 70 || b.bottom > bunn - 8) el.scrollIntoView({ block: "center", behavior: R.rolig() ? "auto" : "smooth" });
  }

  // ---------- Moving the card: FLIP from where it was to where it lands ----------

  function flyFra(el, fra) {
    if (!el || !fra || R.rolig() || !el.animate) return;
    const til = el.getBoundingClientRect();
    if (!til.width) return;
    const dx = fra.left - til.left;
    const dy = fra.top - til.top;
    const s = Math.max(0.6, Math.min(1.6, fra.width / til.width));
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: "0 0", opacity: 0.75 },
        { transform: "none", transformOrigin: "0 0", opacity: 1 },
      ],
      { duration: 340, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.1)" },
    );
  }

  function plasser(sp, g, fra) {
    sp.plass = g;
    R.skjulToast(); // «Dra kortet inn i tidslinja!» has done its job
    R.vis();
    const ny = R.$("#skjerm .tm-ny-kort");
    iSikte(ny); // «Sjekk året!» has come into the dock: the card must not end up behind it
    flyFra(ny, fra);
    R.lyd.pop();
    R.vibrer(12);
    const linje = sp.linjer[sp.tur];
    const f = g > 0 ? aarTekst(ALLE[linje[g - 1]].a) : null;
    const e = g < linje.length ? aarTekst(ALLE[linje[g]].a) : null;
    R.si(R.t("Kortet ligger {hvor}. Trykk «Sjekk året» når dere er sikre.", { hvor: hvorTekst(f, e) }));
  }

  // ---------- Drag & drop ----------
  // The card (in the hand or already in the timeline) follows the finger as a compact copy; the
  // timeline opens a slot where it would land. Which slot is decided from the middle of every row
  // measured once at the start, so the opening slot never makes the target jump back and forth.

  let dra = null;
  const lukeEl = (g) => R.$(`#skjerm .tm-luke[data-luke="${g}"]`);

  function draStart(e) {
    if (dra || opptatt || (e.button != null && e.button > 0)) return;
    const el = e.target.closest && e.target.closest("[data-dra]");
    const S = R.S;
    if (!el || !S || S.skjerm !== "tur" || !S.spill || S.spill.fase !== "plasser" || R.arkApent()) return;
    const b = el.getBoundingClientRect();
    dra = { id: e.pointerId, el, kilde: el.dataset.dra, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ox: e.clientX - b.left, aktiv: false, mal: null };
    try {
      el.setPointerCapture(e.pointerId);
    } catch (feil) {
      /* not every pointer can be captured */
    }
    if (e.pointerType === "mouse") e.preventDefault(); // no text selection
  }

  function loft() {
    const sp = R.S.spill;
    const liste = R.$("#skjerm .tm-linje");
    if (!liste) return false;
    dra.aktiv = true;
    if (dra.kilde === "linje") dra.el.closest(".tm-luke").classList.add("tm-loftet");
    else dra.el.classList.add("tm-loftet");
    document.documentElement.classList.add("tm-drar");
    const lb = liste.getBoundingClientRect();
    const klon = document.createElement("div");
    klon.className = "tm-flyt";
    klon.setAttribute("aria-hidden", "true");
    klon.innerHTML = nyKortHtml(sp.kort);
    klon.style.width = Math.round(lb.width) + "px";
    document.body.appendChild(klon);
    dra.klon = klon;
    dra.kh = klon.offsetHeight;
    dra.kb = klon.offsetWidth;
    dra.ox = R.klamp(dra.ox, 30, dra.kb - 30);
    dra.venstre = lb.left;
    // Measure the timeline once, without the card in it.
    const sy = window.scrollY;
    dra.topp = lb.top + sy;
    dra.midt = R.$$("#skjerm .tm-linje > .tm-rad").map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + sy + b.height / 2;
    });
    const enLuke = R.$("#skjerm .tm-linje > .tm-luke .tm-gap");
    dra.lukeH = enLuke ? enLuke.getBoundingClientRect().height : 44;
    dra.slot = Math.max(dra.kh + 12, dra.lukeH);
    liste.style.setProperty("--tm-slot", dra.slot + "px");
    // Where holding the card scrolls the page: near the top, and near the dock when it sticks to
    // the bottom (on its side it lies beside the timeline, so the edge of the screen counts).
    const dokk = R.$("#skjerm .dokk");
    const fast = dokk && getComputedStyle(dokk).position === "sticky";
    dra.bunnSone = fast ? dokk.getBoundingClientRect().top + 10 : window.innerHeight;
    dra.toppSone = Math.min(120, Math.round(window.innerHeight * 0.22));
    // On its side the card comes from the column beside the timeline, so the copy follows the finger.
    dra.fri = LIGGENDE.matches;
    R.lyd.pop();
    R.vibrer(12);
    dra.raf = requestAnimationFrame(autoRull);
    return true;
  }

  // Which gap the card's middle (in page coordinates) points at, or null above (or beside) the timeline.
  function malFor(y) {
    if (y < dra.topp - 24 || (dra.fri && dra.x < dra.venstre - 30)) return null;
    const ekstra = dra.slot - dra.lukeH;
    let g = 0;
    dra.midt.forEach((m, k) => {
      if (m + (dra.mal != null && k >= dra.mal ? ekstra : 0) < y) g = k + 1;
    });
    return g;
  }

  function settMal(g) {
    if (g === dra.mal) return;
    const gammel = dra.mal != null && lukeEl(dra.mal);
    if (gammel) gammel.classList.remove("tm-mal");
    dra.mal = g;
    const ny = g != null && lukeEl(g);
    if (ny) ny.classList.add("tm-mal");
    R.vibrer(6);
  }

  function flyttKlon() {
    const x = dra.fri ? R.klamp(dra.x - dra.ox, 4, Math.max(4, window.innerWidth - dra.kb - 4)) : dra.venstre + (dra.x - dra.x0) * 0.25;
    const y = dra.y - dra.kh / 2;
    dra.klon.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) rotate(-1.5deg)`; // sprak-ok
    settMal(malFor(dra.y + window.scrollY));
  }

  // Near the top or the action area: scroll the page while the card is held there.
  function autoRull() {
    if (!dra || !dra.aktiv) return;
    let v = 0;
    if (dra.y > dra.bunnSone - 40) v = Math.min(18, (dra.y - (dra.bunnSone - 40)) / 3 + 2);
    else if (dra.y < dra.toppSone) v = -Math.min(18, (dra.toppSone - dra.y) / 3 + 2);
    if (v) {
      const for0 = window.scrollY;
      window.scrollBy(0, v);
      if (window.scrollY !== for0) flyttKlon();
    }
    dra.raf = requestAnimationFrame(autoRull);
  }

  function draFlytt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    dra.x = e.clientX;
    dra.y = e.clientY;
    if (!dra.aktiv) {
      if (Math.hypot(dra.x - dra.x0, dra.y - dra.y0) < 8) return;
      if (!loft()) {
        dra = null;
        return;
      }
    }
    if (e.cancelable) e.preventDefault();
    flyttKlon();
  }

  function rydd(d) {
    cancelAnimationFrame(d.raf);
    document.documentElement.classList.remove("tm-drar");
    if (d.klon && d.klon.parentNode) d.klon.remove();
  }

  function draSlutt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    const d = dra;
    dra = null;
    if (!d.aktiv) {
      if (e.type === "pointerup" && d.kilde === "hand") {
        // A tap instead of a drag: the card wiggles and the how-to line under it lights up –
        // or comes as a toast at the top when the line isn't there any more.
        const hjelp = R.$("#skjerm .tm-hand .tm-hjelp");
        if (hjelp) {
          hjelp.classList.remove("tm-blunk");
          void hjelp.offsetWidth;
          hjelp.classList.add("tm-blunk");
        } else R.toast(R.t("Dra kortet inn i tidslinja!"), { topp: true });
        d.el.classList.remove("tm-vrikk");
        void d.el.offsetWidth;
        d.el.classList.add("tm-vrikk");
      }
      return;
    }
    cancelAnimationFrame(d.raf);
    sluppet = performance.now();
    const S = R.S;
    const sp = S && S.spill;
    const mal = e.type === "pointercancel" ? (d.kilde === "linje" ? sp && sp.plass : null) : d.mal;
    // Wait for the click that follows the release, so it lands on the old screen.
    setTimeout(() => slipp(d, mal), 0);
  }

  function slipp(d, mal) {
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || S.skjerm !== "tur" || sp.fase !== "plasser") return rydd(d);
    const fra = d.klon.getBoundingClientRect();
    rydd(d);
    if (mal == null) {
      const varLagt = sp.plass != null;
      sp.plass = null;
      R.vis();
      if (varLagt) R.lyd.sveip();
      return;
    }
    plasser(sp, mal, fra);
  }

  function avbrytDra() {
    if (!dra) return;
    const d = dra;
    dra = null;
    rydd(d);
  }

  document.addEventListener("pointerdown", draStart);
  document.addEventListener("pointermove", draFlytt, { passive: false });
  document.addEventListener("pointerup", draSlutt);
  document.addEventListener("pointercancel", draSlutt);
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest && e.target.closest("[data-dra]")) e.preventDefault();
  });

  // The phone is turned: draw the turn again with the layout that fits (not while the year rolls –
  // the screen is drawn anew right after that anyway).
  function snudd() {
    const S = R.S;
    if (!S || S.skjerm !== "tur" || !S.spill || opptatt) return;
    avbrytDra();
    R.vis();
  }
  if (LIGGENDE.addEventListener) LIGGENDE.addEventListener("change", snudd);
  else if (LIGGENDE.addListener) LIGGENDE.addListener(snudd);

  // ---------- The reveal: the year rolls in, digit by digit ----------

  function rullInn(a, riktig) {
    return new Promise((ferdig) => {
      const kort = R.$("#skjerm .tm-ny-kort");
      const vindu = kort && kort.querySelector(".tm-vindu");
      if (!kort || !vindu) return ferdig();
      const knapp = R.$("#tm-sjekk");
      if (knapp) knapp.classList.add("tm-venter");
      iSikte(kort);
      const siffer = String(Math.abs(a)).split("").map(Number);
      vindu.className = "tm-aar tm-vindu" + aarKlasse(a);
      vindu.innerHTML = `<span class="tm-rull" aria-hidden="true">${siffer.map(() => `<span class="tm-hjul"><span class="tm-strimmel">${STRIMMEL}</span></span>`).join("")}${a < 0 ? `<span class="tm-fkr">${esc(R.t("f.Kr."))}</span>` : ""}</span>`;
      kort.classList.add("tm-ruller");
      const strimler = R.$$(".tm-strimmel", vindu);
      const dom = () => {
        kort.classList.remove("tm-ruller");
        kort.classList.add(riktig ? "tm-riktig" : "tm-feil");
        if (riktig) {
          R.lyd.riktig();
          R.vibrer([30, 40, 70]);
        } else {
          R.lyd.feil();
          R.vibrer(140);
        }
        setTimeout(ferdig, R.rolig() ? 350 : 850);
      };
      if (R.rolig()) {
        strimler.forEach((s, j) => (s.style.transform = `translateY(${-(21 + siffer[j]) * 1.1}em)`));
        return setTimeout(dom, 250);
      }
      void vindu.offsetWidth;
      const varighet = (j) => 950 + j * 300;
      const total = varighet(strimler.length - 1);
      R.lyd.trommevirvel(total / 1000);
      strimler.forEach((s, j) => {
        s.style.transitionDuration = varighet(j) + "ms";
        s.style.transform = `translateY(${-(21 + siffer[j]) * 1.1}em)`;
        if (j < strimler.length - 1)
          setTimeout(() => {
            R.lyd.tikk();
            R.vibrer(8);
          }, varighet(j));
      });
      setTimeout(dom, total + 60);
    });
  }

  // ---------- End ----------

  function avslutt(S, grunn) {
    const sp = S.spill;
    sp.ferdig = true;
    sp.slutt = grunn;
    if (erRekord(sp)) {
      const alle = rekorder();
      const forrige = Number(alle[sp.filter.niva]) || 0;
      sp.rekord = { forrige, ny: sp.rekke > forrige };
      if (sp.rekord.ny) R.skriv("tidsmaskinen.rekord", Object.assign({}, alle, { [sp.filter.niva]: sp.rekke }));
    } else {
      const topp = Math.max(...sp.linjer.map((l) => l.length));
      sp.vinnere = sp.linjer.map((l, i) => (l.length === topp ? i : -1)).filter((i) => i >= 0);
      R.kveld.registrer(rader(sp));
    }
    R.statistikk("ferdig", { modus: sp.modus, runder: sp.runde, kort: sp.treff.reduce((s, n) => s + n, 0), rekke: sp.rekke, grunn });
    R.gaTil("slutt");
  }

  function vurdering(n) {
    if (n >= 15) return R.t("Utrolig! Du reiser gjennom historien som en ekte tidsreisende.");
    if (n >= 10) return R.t("Fantastisk! Du har tidslinja i blodet.");
    if (n >= 6) return R.t("Imponerende! Du vet når ting skjedde.");
    if (n >= 3) return R.t("Godt jobba! Neste gang blir rekka enda lengre.");
    if (n >= 1) return R.t("En fin start – tidsmaskinen er klar for en ny tur.");
    return R.t("Det kan skje den beste. Prøv igjen!");
  }

  const miniHtml = (linje, fersk) =>
    `<ol class="tm-mini">${linje.map((k) => `<li${k === fersk ? ' class="tm-fersk"' : ""}><b>${esc(aarTekst(ALLE[k].a))}</b><span>${esc(ALLE[k].t)}</span></li>`).join("")}</ol>`;

  function tidslinjerHtml(sp) {
    const rekke = sp.linjer
      .map((l, i) => ({ l, i }))
      .sort((x, y) => y.l.length - x.l.length)
      .map(({ l, i }) => {
        const merke = sp.modus === "lag" ? lagFigur(i, "mini") : R.avatar(i);
        return `<section class="tm-tavle"><h3>${merke}<span class="tm-tavle-navn">${esc(deltaker(sp, i))}</span><span class="tall">${kortTekst(l.length)}</span></h3>${miniHtml(l)}</section>`;
      })
      .join("");
    return `<h2 id="ark-tittel">${esc(R.t("Tidslinjene"))}</h2>${rekke}<button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }

  function rekordSlutt(sp) {
    const n = sp.rekke;
    const rek = sp.rekord || { forrige: 0, ny: false };
    const stempel = rek.ny && rek.forrige > 0 ? `<div class="stempel-sted"><span class="stempel mynte">${esc(R.t("Ny rekord!"))}</span></div>` : "";
    const om = rek.ny
      ? rek.forrige > 0
        ? R.t("Forrige rekord var {n} på rad.", { n: rek.forrige })
        : R.t("Det er rekorden din – klarer du å slå den?")
      : rek.forrige > 0
        ? R.t("Rekorden din er {n} på rad.", { n: rek.forrige })
        : "";
    const s = sp.svar;
    const glapp =
      sp.slutt === "feil" && s && !s.riktig
        ? `<div class="tm-glapp"><p class="etikett">${esc(R.t("Her glapp det"))}</p><p><b>${esc(aarTekst(ALLE[s.kort].a))}</b> ${esc(ALLE[s.kort].t)}</p></div>`
        : "";
    const linje = sp.linjer[0];
    return `
      <div class="banner aksent">${R.figur()}<p class="etikett">${esc(R.t("Rekka di"))}</p><h1 id="skjerm-tittel">${esc(n === 0 ? R.t("Første kort glapp!") : R.t("{n} på rad!", { n }))}</h1><p class="ingress">${esc(vurdering(n))}</p></div>
      ${stempel}
      ${om ? `<p class="hjelp">${esc(om)}</p>` : ""}
      ${glapp}
      <section class="seksjon"><div class="seksjon-hode"><h2>${esc(R.t("Tidslinja di"))}</h2><span class="tall">${kortTekst(linje.length)}</span></div>${miniHtml(linje)}</section>
      ${R.ui.flereSpill({})}
      ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
  }

  // An award next to the winner: the longest journey through time in one timeline.
  function prisHtml(sp) {
    const spenn = sp.linjer.map((l) => {
      const fra = ALLE[l[0]].a;
      const til = ALLE[l[l.length - 1]].a;
      return til - fra - (fra < 0 && til > 0 ? 1 : 0); // there was no year 0
    });
    const lengst = Math.max(...spenn);
    if (lengst <= 0) return "";
    const hvem = spenn.map((s, i) => (s === lengst ? i : -1)).filter((i) => i >= 0);
    const navn = hvem.length > 3 ? flereTekst(sp, hvem.length) : R.ramsOpp(hvem.map((i) => deltaker(sp, i)));
    const l = sp.linjer[hvem[0]];
    const tekst =
      hvem.length === 1
        ? R.t("Fra {fra} til {til} – {aar} år.", { fra: aarTekst(ALLE[l[0]].a), til: aarTekst(ALLE[l[l.length - 1]].a), aar: R.tall(lengst), n: lengst })
        : R.t("{aar} år fra første til siste kort.", { aar: R.tall(lengst), n: lengst });
    return `<div class="papirboks tm-pris">
      <span class="tm-pris-ikon" aria-hidden="true">⏳</span>
      <div><p class="etikett">${esc(R.t("Lengste tidsreise"))}</p><p class="tm-pris-navn">${esc(navn)}</p><p>${esc(tekst)}</p></div>
    </div>`;
  }

  function sluttSkjerm(S) {
    const sp = S.spill;
    if (erRekord(sp)) return rekordSlutt(sp);
    const v = sp.vinnere;
    const topp = sp.linjer[v[0]].length;
    const navn = v.length > 3 ? flereTekst(sp, v.length) : R.ramsOpp(v.map((i) => deltaker(sp, i)));
    const etikett = sp.slutt === "tom" ? R.t("Kortstokken er tom") : v.length > 1 ? R.t("Delt seier!") : sp.modus === "lag" ? R.t("Vinnerlaget") : R.t("Tidsreisens mester");
    const ingress =
      sp.slutt === "mal"
        ? R.t("Først til {kort} – etter {runder}.", { kort: kortTekst(sp.mal), runder: R.flertall(sp.runde, "runde", "runder") })
        : v.length > 1
          ? R.t("Like mange kort i tidslinja: {n}.", { n: topp })
          : R.t("Flest kort i tidslinja: {n}.", { n: topp });
    return `
      <div class="banner aksent">${R.figur()}<p class="etikett">${esc(etikett)}</p><h1 id="skjerm-tittel">${esc(R.t("{navn} vinner!|{navn} vinner!", { navn, n: v.length }))}</h1><p class="ingress">${esc(ingress)}</p></div>
      ${R.ui.pall(rader(sp))}
      ${R.ui.poengliste(rader(sp))}
      ${prisHtml(sp)}
      <div class="stabel">${R.ui.knapp2(R.t("Se tidslinjene"), "tidslinjer", { ikon: "🗂️" })}</div>
      ${R.ui.flereSpill(sp.modus === "spillere" ? { antall: sp.deltakere } : {})}
      ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
  }

  // Celebrate in proportion: fanfare and confetti for a win or a strong streak.
  function feir(sp) {
    const sterk = erRekord(sp) ? (sp.rekord && sp.rekord.ny && sp.rekord.forrige > 0) || sp.rekke >= 8 : true;
    if (sterk) {
      R.lyd.fanfare();
      R.konfetti();
    } else R.lyd.pling();
  }

  // ---------- The game ----------

  R.start({
    id: "tidsmaskinen",
    versjon: 1,
    pagar,

    tilstand: () => ({ antall: 3, oppsett: standardOppsett(), spill: null }),

    // Repair saved settings and drop a saved game that no longer fits the cards.
    lastet(S) {
      const o = (S.oppsett = Object.assign(standardOppsett(), S.oppsett || {}));
      if (!MODUSER.includes(o.modus)) o.modus = "spillere";
      o.lag = R.klamp(Number(o.lag) || 2, 2, 4);
      o.kategorier = (Array.isArray(o.kategorier) ? o.kategorier : []).filter((id) => KAT[id]);
      if (!NIVAER.includes(o.niva)) o.niva = "blandet";
      o.mal = MAL.includes(Number(o.mal)) ? Number(o.mal) : 10;
      o.mer = !!o.mer;
      const sp = S.spill;
      const kort = (k) => Number.isInteger(k) && k >= 0 && k < ALLE.length;
      const ok =
        sp &&
        MODUSER.includes(sp.modus) &&
        Number.isInteger(sp.deltakere) &&
        sp.deltakere >= 1 &&
        sp.deltakere <= 10 &&
        Array.isArray(sp.linjer) &&
        sp.linjer.length === sp.deltakere &&
        sp.linjer.every((l) => Array.isArray(l) && l.length && l.every(kort)) &&
        Number.isInteger(sp.tur) &&
        sp.tur >= 0 &&
        sp.tur < sp.deltakere &&
        ["plasser", "svar"].includes(sp.fase) &&
        kort(sp.kort) &&
        (sp.plass == null || (Number.isInteger(sp.plass) && sp.plass >= 0 && sp.plass <= sp.linjer[sp.tur].length)) &&
        (sp.fase !== "svar" || (sp.svar && kort(sp.svar.kort))) &&
        sp.filter &&
        Array.isArray(sp.filter.kategorier) &&
        Array.isArray(sp.brukt) &&
        Array.isArray(sp.treff) &&
        sp.treff.length === sp.deltakere &&
        Array.isArray(sp.forsok) &&
        (!sp.ferdig || (erRekord(sp) ? true : Array.isArray(sp.vinnere) && sp.vinnere.length > 0));
      if (!ok) S.spill = null;
    },

    regler: {
      intro: R.t("Når skjedde det? Alle bygger sin egen tidslinje – men året på kortet er skjult."),
      steg: [
        [R.t("Trekk et kort"), R.t("Du ser hendelsen, men ikke året. Alle starter med ett kort der året vises.")],
        [R.t("Legg det i tidslinja"), R.t("Dra kortet dit du tror det hører hjemme – før, etter eller mellom kortene du har. Eller trykk på +.")],
        [R.t("Sjekk året"), R.t("Riktig plass? Da får du beholde kortet. Feil? Da kastes det. Først til 10 kort vinner.")],
      ],
      tips: [
        R.t("Når noen når målet, spilles runden ferdig – så alle får like mange forsøk."),
        R.t("Skjedde to ting samme år? Da er begge plassene riktige."),
        R.t("Rekordjakt: én tidslinje – hvor mange klarer du på rad før første feil?"),
        R.t("Lag mot lag: snakk sammen og bli enige før dere sjekker året."),
        R.t("Det er lov å flytte kortet så mye dere vil før dere trykker «Sjekk året»."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) => {
          const sp = S.spill;
          return R.ui.spillhjem({
            // Non-breaking spaces keep the last three words together, so «tidslinja.» never stands alone.
            slagordHtml: `${esc(R.t("Når skjedde det?"))}<br><em>${esc(R.t("Legg hendelsen på riktig plass i tidslinja.")).replace(/ (\S+) (\S+)$/, "&nbsp;$1&nbsp;$2")}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: sp ? (erRekord(sp) ? R.t("Fortsett · {n} på rad", { n: sp.rekke }) : R.t("Fortsett · runde {n}", { n: sp.runde })) : "",
              ekstraHtml: (sp && sp.ferdig ? R.ui.knapp2(erRekord(sp) ? R.t("Se resultatet") : R.t("Til kåringen"), "resultat") : "") + R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["1–10", R.t("spillere")],
              [String(ALLE.length), R.t("hendelser")],
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
          const o = S.oppsett;
          const rekord = o.modus === "rekord";
          // Under the three tiles: who plays, and what the chosen way of playing means.
          let hvem = "";
          if (o.modus === "spillere") hvem = R.ui.spillere({ min: 2, max: 10, hjelp: R.t("Alle bygger hver sin tidslinje. Send mobilen videre etter hver tur.") });
          else if (o.modus === "lag")
            hvem = `<section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor mange lag?"))}</h2></div>
              ${R.ui.teller("lag", o.lag, 2, 4, { enhet: R.t("lag"), minus: R.t("Færre lag"), pluss: R.t("Flere lag") })}
              <div class="tm-lagrad">${Array.from({ length: o.lag }, (_, i) => R.ui.lagmerke(i)).join("")}</div>
              <p class="hjelp">${esc(R.t("Hvert lag bygger sin egen tidslinje. Snakk sammen før dere sjekker året."))}</p>
            </section>`;
          else {
            const best = rekordFor(o.niva);
            hvem = `<section class="seksjon tm-rekordvalg">
              <p class="hjelp">${esc(R.t("Én tidslinje – hvor mange klarer du på rad? Spill alene eller hjelp hverandre. Første feil avslutter rekka."))}</p>
              ${best ? `<p class="tm-rekordlinje"><span>${esc(R.t("Rekord · {niva}", { niva: NIVANAVN[o.niva] }))}</span><b>${esc(R.t("{n} på rad", { n: best }))}</b></p>` : ""}
            </section>`;
          }
          const antall = o.kategorier.length;
          const sammendrag = [antall === ALLE_KAT.length ? R.t("Alle kategorier") : antall ? R.flertall(antall, "kategori", "kategorier") : R.t("Ingen kategorier"), NIVANAVN[o.niva]];
          if (!rekord) sammendrag.push(R.t("Først til {n}", { n: o.mal }));
          // How to play and who plays come first; the rest has good defaults and folds into one row.
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvordan spiller dere?"))}</h2></div>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "spillere", ikon: "🙋", tittel: R.t("Hver for seg") },
                  { v: "lag", ikon: "👥", tittel: R.t("Lag mot lag") },
                  { v: "rekord", ikon: "🔥", tittel: R.t("Rekord­jakt") }, // may break at the soft hyphen on a narrow phone
                ],
                o.modus,
              )}
            </section>
            ${hvem}
            <section class="tm-mer${o.mer ? " apen" : ""}">
              <button type="button" class="tm-mer-knapp" data-h="mer" aria-expanded="${o.mer}"><span><b>${esc(R.t("Flere valg"))}</b><small>${esc(sammendrag.join(" · "))}</small></span><i aria-hidden="true"></i></button>
              ${
                o.mer
                  ? `<div class="tm-mer-innhold">
                <section class="seksjon">
                  <div class="seksjon-hode"><h3>${esc(R.t("Kategorier"))}</h3><span class="tall">${kortTekst(antallI(o))}</span></div>
                  ${R.ui.brikker("kategori", KATEGORIER.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon })), o.kategorier, { alle: true, etikett: R.t("Kategorier") })}
                </section>
                <section class="seksjon">
                  <h3>${esc(R.t("Vanskelighet"))}</h3>
                  ${R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), o.niva, { etikett: R.t("Vanskelighet") })}
                </section>
                ${
                  rekord
                    ? ""
                    : `<section class="seksjon">
                  <h3>${esc(R.t("Først til"))}</h3>
                  ${R.ui.seg("mal", MAL.map((n) => [n, kortTekst(n)]), o.mal, { etikett: R.t("Først til") })}
                </section>`
                }
              </div>`
                  : ""
              }
            </section>
            ${R.ui.dokk(antall ? "" : `<p class="hjelp">${esc(R.t("Velg minst én kategori under «Flere valg»."))}</p>`, R.ui.knapp(R.t("Start"), "start", { av: !antall }))}`;
        },
      },

      tur: {
        tittel: (S) => (erRekord(S.spill) ? R.t("Rekordjakt") : R.t("Runde {n}", { n: S.spill.runde })),
        tilbake: "hjem",
        vis: turSkjerm,
        inn() {
          R.holdVaken();
          R.vedForlat(avbrytDra);
        },
        ut: () => avbrytDra(),
      },

      slutt: {
        // «Kåringen» only when someone is ranked; a record hunt alone is named after the mode.
        tittel: (S) => (S.spill && erRekord(S.spill) ? R.t("Rekordjakt") : R.t("Kåringen")),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis: sluttSkjerm,
        inn(S) {
          R.slippVaken();
          feir(S.spill);
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
      endre: () => R.gaTil("oppsett"),
      fortsett: (el, e, S) => {
        if (pagar(S)) R.gaTil("tur");
      },
      resultat: (el, e, S) => {
        if (S.spill && S.spill.ferdig) R.gaTil("slutt");
      },
      modus(el, e, S) {
        if (!MODUSER.includes(el.dataset.v)) return;
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      lag(el, e, S) {
        S.oppsett.lag = R.klamp(S.oppsett.lag + Number(el.dataset.v), 2, 4);
        R.vis();
      },
      kategori(el, e, S) {
        const id = el.dataset.v;
        const valgt = S.oppsett.kategorier;
        if (id === "*") S.oppsett.kategorier = valgt.length === ALLE_KAT.length ? [] : ALLE_KAT.slice();
        else S.oppsett.kategorier = valgt.includes(id) ? valgt.filter((x) => x !== id) : ALLE_KAT.filter((x) => x === id || valgt.includes(x));
        R.vis();
      },
      niva(el, e, S) {
        if (NIVAER.includes(el.dataset.v)) S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      mal(el, e, S) {
        const n = Number(el.dataset.v);
        if (MAL.includes(n)) S.oppsett.mal = n;
        R.vis();
      },
      mer(el, e, S) {
        S.oppsett.mer = !S.oppsett.mer;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.kategorier.length) return;
        if (!nyttSpill(S)) {
          R.toast(R.t("Fant ikke nok kort – velg flere kategorier"));
          return;
        }
        R.statistikk("start", { modus: o.modus, deltakere: S.spill.deltakere, mal: S.spill.mal, niva: o.niva });
        R.lyd.pop();
        R.gaTil("tur");
        siKort(S.spill);
      },

      // Tap a gap: the card flies there. It can be moved until «Sjekk året».
      plasser(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "plasser" || opptatt || dra || performance.now() - sluppet < 400) return;
        const g = Number(el.dataset.v);
        if (!Number.isInteger(g) || g < 0 || g > sp.linjer[sp.tur].length || g === sp.plass) return;
        const kilde = R.$("#tm-hand") || R.$("#skjerm .tm-ny-kort");
        plasser(sp, g, kilde && kilde.getBoundingClientRect());
        if (e && e.detail === 0) {
          const knapp = R.$("#tm-sjekk");
          if (knapp) knapp.focus(); // keyboard: straight on to «Sjekk året»
        }
      },

      async sjekk(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "plasser" || sp.plass == null || opptatt || dra) return;
        const t = sp.tur;
        const linje = sp.linjer[t];
        const h = ALLE[sp.kort];
        const [lo, hi] = luker(linje, h.a);
        const riktig = sp.plass >= lo && sp.plass <= hi;
        // Settle the result before the show, so a reload during it can't give a second try.
        sp.svar = { kort: sp.kort, plass: sp.plass, lo, hi, riktig };
        sp.forsok[t] += 1;
        if (riktig) {
          linje.splice(sp.plass, 0, sp.kort);
          sp.treff[t] += 1;
          if (erRekord(sp)) sp.rekke += 1;
        }
        sp.fase = "svar";
        R.lagre();
        opptatt = true;
        const fortsatt = R.vakt();
        try {
          await rullInn(h.a, riktig);
        } finally {
          opptatt = false;
        }
        if (!fortsatt() || R.S.spill !== sp) return;
        R.vis();
        const mal = riktig && !erRekord(sp) && linje.length >= sp.mal;
        if (mal) R.lyd.fanfare();
        iSikte(R.$("#skjerm .tm-fersk, #skjerm .tm-spokelse"));
        R.si(`${riktig ? R.t("Riktig!") : R.t("Feil plass.")} ${h.t}: ${aarTekst(h.a)}.`);
      },

      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "svar" || opptatt) return;
        const k = hvemNeste(sp);
        if (k < 0) return avslutt(S, erRekord(sp) ? "feil" : "mal");
        if (!erRekord(sp)) {
          if (k <= sp.tur) sp.runde += 1;
          sp.tur = k;
        }
        const kort = trekk(sp);
        if (kort < 0) return avslutt(S, "tom");
        sp.kort = kort;
        sp.plass = null;
        sp.fase = "plasser";
        sp.svar = null;
        R.lyd.snu();
        R.gaTil("tur");
        siKort(sp);
      },

      stilling(el, e, S) {
        const sp = S.spill;
        if (!sp || erRekord(sp)) return;
        R.ark(
          `<h2 id="ark-tittel">${esc(R.t("Stillingen"))}</h2><p class="ingress">${esc(R.t("Runde {n} · først til {kort}", { n: sp.runde, kort: kortTekst(sp.mal) }))}</p>${R.ui.poengliste(rader(sp))}<button class="knapp" data-h="lukk-ark">${esc(R.t("Tilbake til spillet"))}</button>`,
        );
      },

      tidslinjer(el, e, S) {
        if (S.spill && !erRekord(S.spill)) R.ark(tidslinjerHtml(S.spill));
      },

      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        const rekord = erRekord(sp);
        const harKort = sp.treff.some((n) => n > 0);
        const tekst = rekord
          ? R.t("Rekka di stopper på {n}.", { n: sp.rekke })
          : harKort
            ? R.t("Dere går rett til kåringen. Den med flest kort i tidslinja vinner.")
            : R.t("Ingen har fått kort ennå, så spillet avsluttes uten kåring.");
        const ja = await R.bekreft(rekord ? R.t("Avslutte rekordjakten?") : R.t("Avslutte spillet?"), tekst, R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || R.S.spill !== sp || sp.ferdig || opptatt) return;
        avbrytDra();
        if (rekord || harKort) return avslutt(S, "avsluttet");
        S.spill = null;
        R.gaTil("hjem");
      },

      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
