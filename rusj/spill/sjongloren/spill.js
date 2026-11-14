/* Sjongløren — anagrams in five rounds. Each round the juggler throws up the letters of one word
   (six letters in rounds 1–2, seven in rounds 3–5); make as many words as you can from them, each
   letter at most as often as it is in the air, three letters or more. The «helord» uses every
   letter (some sets have more than one).
   Points: one per letter beyond two (3 letters 1 … 7 letters 5); a helord gives 10 more.
   «På tid»: two minutes a round. «Uten klokke»: as long as you like; «Neste runde» moves on.
   After each round every answer is shown (the found ones marked). Best and last score per mode on
   home, a sticker for finding all five helord in one game, share card.
   The letter sets and their answers are precomputed (data/bokstaver.json,
   build/ordspill/lag-bokstaver.mjs): a set's answers are the words of the data's list made of its
   letters – the browser gets those words, never a whole dictionary.
   The engine at the top has no kit and no data of its own, so test/sjongloren.test.mjs can load
   this file in node:vm (window.Sjongloren). */
(function () {
  "use strict";

  // ---------- Engine (pure) ----------

  const MIN_LENGDE = 3;
  const PLAN = [6, 6, 7, 7, 7]; // letters per round
  const TID = 120; // seconds a round on the clock
  const HELBONUS = 10;

  const bokstaver = (o) => Array.from(String(o || ""));
  const telling = (o) => {
    const t = new Map();
    for (const b of bokstaver(o)) t.set(b, (t.get(b) || 0) + 1);
    return t;
  };
  // Can `ord` be made of the letters of `sett` (each letter at most as often as it is there)?
  function passer(ord, sett) {
    const t = telling(sett);
    for (const b of bokstaver(ord)) {
      const n = t.get(b) || 0;
      if (!n) return false;
      t.set(b, n - 1);
    }
    return true;
  }
  // A set's answers (3+ letters) in the list's order.
  const svarFor = (sett, liste) => liste.filter((o) => bokstaver(o).length >= MIN_LENGDE && bokstaver(o).length <= bokstaver(sett).length && passer(o, sett));
  const erHelord = (o, sett) => bokstaver(o).length === bokstaver(sett).length && passer(o, sett);
  const helordFor = (sett, liste) => svarFor(sett, liste).filter((o) => erHelord(o, sett));
  const poeng = (o, sett) => Math.max(0, bokstaver(o).length - 2) + (erHelord(o, sett) ? HELBONUS : 0);
  const sumPoeng = (ord, sett) => ord.reduce((s, o) => s + poeng(o, sett), 0);
  // Why a word is not taken ("" when it is a new answer).
  function vurder(ord, sett, svar, funnet) {
    if (bokstaver(ord).length < MIN_LENGDE) return "kort";
    if (!passer(ord, sett)) return "bokstav";
    if (funnet.includes(ord)) return "funnet";
    if (!svar.includes(ord)) return "ukjent";
    return "";
  }
  // How many answers of each length (for the board's progress row).
  function perLengde(svar, funnet) {
    const ut = {};
    for (const o of svar) {
      const n = bokstaver(o).length;
      ut[n] = ut[n] || { alle: 0, funnet: 0 };
      ut[n].alle++;
      if (funnet.includes(o)) ut[n].funnet++;
    }
    return ut;
  }
  // The letters as tiles: which of them a typed word takes (the first free one of each letter), or null.
  function brikkerFor(ord, sett) {
    const b = bokstaver(sett);
    const brukt = new Array(b.length).fill(false);
    const ut = [];
    for (const x of bokstaver(ord)) {
      const i = b.findIndex((y, k) => y === x && !brukt[k]);
      if (i < 0) return null;
      brukt[i] = true;
      ut.push(i);
    }
    return ut;
  }

  // What is wrong with one set (an empty list when it is fine). Used by the unit test.
  function sjekkSett(sett, liste) {
    const feil = [];
    const svar = svarFor(sett, liste);
    if (svar.length < 10) feil.push(`«${sett}» har bare ${svar.length} svar`); // sprak-ok (the unit test's own words)
    if (!svar.some((o) => erHelord(o, sett))) feil.push(`«${sett}» har ikke noe helord`); // sprak-ok
    return feil;
  }

  const MOTOR = { MIN_LENGDE, PLAN, TID, HELBONUS, passer, svarFor, erHelord, helordFor, poeng, sumPoeng, vurder, perLengde, brikkerFor, sjekkSett };

  const R = window.Rusj;
  if (!R) {
    window.Sjongloren = MOTOR;
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const D = window.RUSJ_DATA;
  const SEKS = D.bokstaver.seks;
  const SJU = D.bokstaver.sju;
  const LISTE = D.bokstaver.ord.split(" ");
  const NAVN = (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Sjongløren"; // sprak-ok
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "sjongloren") + "/";
  const stor = (o) => String(o).toLocaleUpperCase(R.lokale || "nb");
  const MODUSNAVN = { tid: R.t("På tid"), rolig: R.t("Uten klokke") };
  const MERKE = "sjongloren-helord";

  let H;
  let valg = []; // the tiles picked for the word being made, by index into the set (not saved)
  let melding = null;
  let meldingId = null;
  let klokkeId = null;
  let sistTikk = 0;
  let sistLagret = 0;
  let nyFeiring = false;
  let opptatt = false;

  const svarCache = new Map();
  const svarAv = (sett) => {
    if (!svarCache.has(sett)) svarCache.set(sett, svarFor(sett, LISTE));
    return svarCache.get(sett);
  };
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const runde = (sp) => sp.runder[sp.nr];
  const totalt = (sp) => sp.runder.reduce((s, r) => s + sumPoeng(r.funnet, r.sett), 0);
  const helordFunnet = (r) => r.funnet.some((o) => erHelord(o, r.sett));
  const antallHelord = (sp) => sp.runder.filter(helordFunnet).length;
  const alleFunnet = (r) => r.funnet.length >= svarAv(r.sett).length;

  // ---------- Sounds ----------

  const lyd = {
    tast: (n) => R.lyd.tone(620 + n * 60, 0, 0.04, "sine", 0.05),
    nei: () => R.lyd.tone(220, 0, 0.16, "triangle", 0.12, 170),
    ord: (n) => [660, 880, 1100].slice(0, 1 + Math.min(2, n)).forEach((f, i) => R.lyd.tone(f, i * 0.07, 0.12, "triangle", 0.09)),
    helord: () => [523, 659, 784, 1047, 1319].forEach((f, i) => R.lyd.tone(f, i * 0.08, 0.18, "triangle", 0.1)),
    kast: () => R.lyd.tone(420, 0, 0.12, "sine", 0.05, 760),
  };

  // ---------- The clock (two minutes a round; stops while the page is hidden or a sheet is open) ----------

  const klokkeTekst = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  function stoppKlokke() {
    clearInterval(klokkeId);
    klokkeId = null;
  }
  function startKlokke() {
    stoppKlokke();
    const sp = R.S.spill;
    if (!sp || sp.modus !== "tid") return;
    sistTikk = performance.now();
    klokkeId = setInterval(tikk, 250);
    R.vedForlat(stoppKlokke);
  }
  function tikk() {
    const S = R.S;
    const sp = S && S.spill;
    const na = performance.now();
    const dt = na - sistTikk;
    sistTikk = na;
    if (!sp || S.skjerm !== "spill" || sp.ferdig || runde(sp).ferdig) return stoppKlokke();
    if (document.hidden || R.arkApent() || opptatt) return;
    const r = runde(sp);
    const for_ = Math.ceil(r.igjen / 1000);
    r.igjen = Math.max(0, r.igjen - dt);
    const etter = Math.ceil(r.igjen / 1000);
    const el = R.$(".sj-klokke");
    if (el) {
      el.querySelector("b").textContent = klokkeTekst(r.igjen);
      el.style.setProperty("--andel", String(r.igjen / (TID * 1000)));
      el.classList.toggle("lite", r.igjen <= 10000);
    }
    if (etter !== for_ && etter > 0 && etter <= 5) {
      R.lyd.tikk();
      R.vibrer(8);
    }
    if (etter !== for_ && (etter === 60 || etter === 30 || etter === 10)) R.si(R.t("{n} sekunder igjen.", { n: etter }));
    if (na - sistLagret > 2000) {
      sistLagret = na;
      R.lagre();
    }
    if (r.igjen <= 0) slutterRunden(S, "tid");
  }

  // ---------- Markup ----------

  function infoHtml(sp) {
    const r = runde(sp);
    const svar = svarAv(r.sett);
    const klokke =
      sp.modus === "tid"
        ? `<div class="sj-klokke${r.igjen <= 10000 ? " lite" : ""}" style="--andel:${r.igjen / (TID * 1000)}" role="timer" aria-label="${esc(R.t("Tid igjen"))}"><b>${esc(klokkeTekst(r.igjen))}</b><i aria-hidden="true"></i></div>`
        : `<div class="sj-klokke rolig"><b>${esc(R.t("{n}/{av}", { n: sp.nr + 1, av: PLAN.length }))}</b><small>${esc(R.t("runde"))}</small></div>`;
    return `<div class="sj-info">
        ${klokke}
        <button class="sj-funnet" data-h="ordene" aria-label="${esc(R.t("Ordene dine: {n} av {av}. {p}. Vis alle.", { n: r.funnet.length, av: svar.length, p: R.t("{n} poeng", { n: totalt(sp) }) }))}">
          <b>${esc(R.t("{n} av {av} ord", { n: r.funnet.length, av: svar.length }))}</b><span>${esc(sp.modus === "tid" ? R.t("Runde {n} av {av}", { n: sp.nr + 1, av: PLAN.length }) + " · " : "")}${esc(R.t("{n} p", { n: totalt(sp) }))}</span><i aria-hidden="true">›</i>
        </button>
      </div>`;
  }
  // Progress per length: «3 ●●○○», the helord as a star.
  function lengderHtml(r) {
    const svar = svarAv(r.sett);
    const per = perLengde(svar, r.funnet);
    const n = bokstaver(r.sett).length;
    const rader = Object.keys(per)
      .map(Number)
      .sort((a, b) => a - b)
      .map((l) => {
        const p = per[l];
        const hel = l === n;
        return `<li class="${hel ? "hel" : ""}${p.funnet === p.alle || (hel && p.funnet > 0) ? " ferdig" : ""}"><b>${hel ? "★" : l}</b><span>${esc(R.t("{n}/{av}", { n: p.funnet, av: p.alle }))}</span></li>`;
      })
      .join("");
    const tekst = Object.keys(per)
      .map(Number)
      .sort((a, b) => a - b)
      .map((l) => R.t("{l} bokstaver: {n} av {av}", { l, n: per[l].funnet, av: per[l].alle }))
      .join(", ");
    return `<ul class="sj-lengder" role="img" aria-label="${esc(tekst)}">${rader}</ul>`;
  }
  function ordHtml(r) {
    const b = bokstaver(r.sett);
    return valg.length ? valg.map((i) => `<span>${esc(stor(b[i]))}</span>`).join("") : `<span class="sj-tom">${esc(R.t("Trykk på bokstavene"))}</span>`;
  }
  const hjelpHtml = () => (melding ? `<span class="sj-varsel ${melding.klasse || ""}">${esc(melding.tekst)}</span>` : "");
  // The letters in the air: round balls on an arc, the picked ones left as rings.
  function ballerHtml(r, av) {
    const b = bokstaver(r.sett);
    const n = b.length;
    return `<div class="sj-baller" role="group" aria-label="${esc(R.t("Bokstavene"))}" style="--n:${n}">${r.rekkefolge
      .map((i, k) => {
        const tatt = valg.includes(i);
        // In the air: high and low in turn, the middle ones a little higher, evenly across.
        const a = ((n > 1 ? -60 + (120 * k) / (n - 1) : 0) * Math.PI) / 180;
        const x = (((k + 0.5) / n) * 100).toFixed(1);
        const y = ((k % 2 ? 72 : 30) - 8 * Math.cos(a) + 4).toFixed(1);
        return `<button class="sj-ball${tatt ? " tatt" : ""}" data-h="ball" data-v="${i}" data-stille style="--k:${k};--x:${x}%;--y:${y}%" aria-label="${esc(stor(b[i]))}" aria-pressed="${tatt}"${av ? " disabled" : ""}><span>${esc(stor(b[i]))}</span></button>`;
      })
      .join("")}</div>`;
  }
  const STOKK_IKON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>';
  function knapperHtml(av) {
    return `<div class="sj-knapper">
        <button class="knapp-2 sj-slett" data-h="slett" data-stille${av ? " disabled" : ""}>${esc(R.t("Slett"))}</button>
        <button class="knapp-2 sj-stokk" data-h="stokk" data-stille aria-label="${esc(R.t("Kast bokstavene opp igjen"))}"${av ? " disabled" : ""}>${STOKK_IKON}</button>
        <button class="knapp sj-send" data-h="send" data-stille${av ? " disabled" : ""}>${esc(R.t("Send"))}</button>
      </div>`;
  }
  // Words in a list: longest first; the missed ones dimmed, the helord marked.
  function ordlisteHtml(r, alle) {
    const svar = svarAv(r.sett);
    const liste = (alle ? svar : r.funnet).slice().sort((a, b) => bokstaver(b).length - bokstaver(a).length || a.localeCompare(b, R.lokale));
    if (!liste.length) return `<p class="hjelp">${esc(R.t("Ingen ord ennå."))}</p>`;
    return `<ul class="sj-ordliste">${liste
      .map((o) => {
        const fant = r.funnet.includes(o);
        const hel = erHelord(o, r.sett);
        return `<li class="${hel ? "hel" : ""}${fant ? "" : " glemt"}">${hel ? "★ " : ""}${esc(stor(o))}${!fant ? `<span class="vh"> ${esc(R.t("(ikke funnet)"))}</span>` : ""}</li>`;
      })
      .join("")}</ul>`;
  }
  function ordArk(S) {
    const r = runde(S.spill);
    return `<h2 id="ark-tittel">${esc(R.t("Ordene dine"))}</h2>
      <p class="hjelp">${esc(R.t("{n} av {av} ord", { n: r.funnet.length, av: svarAv(r.sett).length }))} · ${esc(R.t("{n} poeng", { n: sumPoeng(r.funnet, r.sett) }))}</p>
      ${ordlisteHtml(r, false)}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }

  // ---------- Playing ----------

  function oppdaterOrd(S) {
    const r = runde(S.spill);
    const el = R.$(".sj-ord");
    if (el) el.innerHTML = ordHtml(r);
    document.querySelectorAll(".sj-ball").forEach((k) => {
      const tatt = valg.includes(Number(k.dataset.v));
      k.classList.toggle("tatt", tatt);
      k.setAttribute("aria-pressed", String(tatt));
    });
  }
  function visHjelp() {
    const el = R.$(".sj-hjelp");
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
    }, ms || 1800);
  }
  function rist() {
    const el = R.$(".sj-ord");
    if (!el || R.rolig()) return;
    el.classList.remove("risting");
    void el.offsetWidth;
    el.classList.add("risting");
  }
  const kanSpille = (S) => !!(S.spill && S.skjerm === "spill" && !S.spill.ferdig && !runde(S.spill).ferdig && !opptatt);

  function velgBall(S, i) {
    if (!kanSpille(S)) return;
    const r = runde(S.spill);
    if (!Number.isInteger(i) || i < 0 || i >= bokstaver(r.sett).length) return;
    if (valg.includes(i)) {
      // A picked letter tapped again: the word goes back to just before it.
      valg = valg.slice(0, valg.indexOf(i));
    } else valg.push(i);
    lyd.tast(valg.length);
    oppdaterOrd(S);
  }
  function skriv(S, x) {
    if (!kanSpille(S)) return;
    const r = runde(S.spill);
    const b = bokstaver(r.sett);
    const i = b.findIndex((y, k) => y === x && !valg.includes(k));
    if (i < 0) {
      lyd.nei();
      return settMelding(R.t("Den bokstaven er ikke i lufta"), "feil", 1400);
    }
    valg.push(i);
    lyd.tast(valg.length);
    oppdaterOrd(S);
  }
  function slett(S) {
    if (!kanSpille(S) || !valg.length) return;
    valg.pop();
    lyd.tast(0);
    oppdaterOrd(S);
  }
  function stokk(S) {
    if (!kanSpille(S)) return;
    const r = runde(S.spill);
    let ny = R.stokk(r.rekkefolge);
    for (let n = 0; n < 5 && ny.join() === r.rekkefolge.join(); n++) ny = R.stokk(r.rekkefolge);
    r.rekkefolge = ny;
    R.lagre();
    lyd.kast();
    const el = R.$(".sj-baller");
    if (el) {
      const ny2 = document.createElement("div");
      ny2.innerHTML = ballerHtml(r, false);
      el.replaceWith(ny2.firstElementChild);
      if (!R.rolig()) R.$(".sj-baller").classList.add("kastet");
    }
    R.si(R.t("Bokstavene er kastet opp igjen."));
  }

  const ROS = [R.t("Bra!"), R.t("Fint!"), R.t("Flott!"), R.t("Supert!")];
  function send(S) {
    if (!kanSpille(S)) return;
    const sp = S.spill;
    const r = runde(sp);
    const b = bokstaver(r.sett);
    const ord = valg.map((i) => b[i]).join("");
    valg = [];
    if (!ord) return oppdaterOrd(S);
    const grunn = vurder(ord, r.sett, svarAv(r.sett), r.funnet);
    if (grunn) {
      const tekst = { kort: R.t("For kort – minst tre bokstaver"), bokstav: R.t("Den bokstaven er ikke i lufta"), funnet: R.t("Det ordet har du alt"), ukjent: R.t("Ikke i ordlista") }[grunn];
      lyd.nei();
      R.vibrer(30);
      oppdaterOrd(S);
      rist();
      settMelding(tekst, "feil");
      R.si(tekst);
      return;
    }
    r.funnet.push(ord);
    const p = poeng(ord, r.sett);
    const hel = erHelord(ord, r.sett);
    R.lagre();
    if (hel) {
      lyd.helord();
      R.vibrer([30, 40, 30]);
      if (!R.rolig()) R.konfetti();
    } else {
      lyd.ord(bokstaver(ord).length - 3);
      R.vibrer(20);
    }
    melding = { tekst: hel ? R.t("Helordet! +{p}", { p }) : `${ROS[Math.min(3, bokstaver(ord).length - 3)]} +${p}`, klasse: hel ? "hel" : "ok" };
    clearTimeout(meldingId);
    meldingId = setTimeout(() => {
      melding = null;
      meldingId = null;
      visHjelp();
    }, 1600);
    R.vis();
    R.si(hel ? R.t("{ord} er helordet! {poeng}.", { ord: stor(ord), poeng: R.t("{n} poeng", { n: p }) }) : R.t("{ord} gir {poeng}.", { ord: stor(ord), poeng: R.t("{n} poeng", { n: p }) }));
    if (alleFunnet(r)) {
      // Every word: a moment on the board, then the round's summary.
      const fortsatt = R.vakt();
      opptatt = true;
      R.lyd.fanfare();
      setTimeout(() => {
        opptatt = false;
        if (fortsatt()) slutterRunden(R.S, "alle");
      }, R.rolig() ? 400 : 1200);
    }
  }

  // The round ends: time up, every word found, or «Neste runde».
  function slutterRunden(S, hvorfor) {
    const sp = S.spill;
    if (!sp || runde(sp).ferdig) return;
    stoppKlokke();
    valg = [];
    const r = runde(sp);
    r.ferdig = true;
    if (hvorfor === "tid") {
      R.lyd.alarm();
      R.vibrer([150, 80, 150]);
    }
    R.lagre();
    R.gaTil("runde");
  }
  async function nesteRundeNa(S) {
    const sp = S.spill;
    if (!sp || runde(sp).ferdig) return;
    const fortsatt = R.vakt();
    const r = runde(sp);
    if (!helordFunnet(r)) {
      const ok = await R.bekreft(R.t("Gå videre?"), R.t("Du har ikke funnet helordet ennå. Det vises når runden er over."), R.t("Neste runde"), R.t("Spill videre"));
      if (!ok || !fortsatt() || S.spill !== sp || runde(sp) !== r) return;
    }
    slutterRunden(S, "neste");
  }

  // ---------- Starting ----------

  const kortstokker = {};
  const stokkFor = (n) => kortstokker[n] || (kortstokker[n] = R.kortstokk(n === 6 ? "seks" : "sju", (n === 6 ? SEKS : SJU).length));
  function nyRunde(n) {
    const liste = n === 6 ? SEKS : SJU;
    const i = Math.max(0, stokkFor(n).neste());
    const sett = liste[i];
    const b = bokstaver(sett);
    // Never thrown up in the order of the word itself.
    let rekkefolge = R.stokk(b.map((_, k) => k));
    for (let k = 0; k < 6 && rekkefolge.map((x) => b[x]).join("") === sett; k++) rekkefolge = R.stokk(rekkefolge);
    return { sett, funnet: [], igjen: TID * 1000, ferdig: false, rekkefolge };
  }
  function nyttSpill(S, modus) {
    S.spill = { modus, nr: 0, runder: PLAN.map(nyRunde), ferdig: false, registrert: false };
    R.statistikk("start", { modus });
  }
  function avslutt(S) {
    const sp = S.spill;
    sp.ferdig = true;
    const rek = S.rekord[sp.modus];
    const p = totalt(sp);
    const helt = sp.runder.every((r) => r.ferdig);
    if (helt) {
      rek.spilt += 1;
      rek.sist = p;
      rek.best = Math.max(rek.best, p);
      if (antallHelord(sp) === PLAN.length) R.merke(MERKE);
    }
    R.statistikk("ferdig", { modus: sp.modus, poeng: p, helord: antallHelord(sp), helt });
    nyFeiring = helt;
    R.lagre();
    R.gaTil("slutt");
  }

  // Physical keyboard (computers, tablets with a keyboard).
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || e.ctrlKey || e.metaKey || e.altKey || (R.arkApent && R.arkApent())) return;
    const el = e.target;
    if (el && el.closest && el.closest("input, textarea, select")) return;
    if ((e.key === "Enter" || e.key === " ") && el && el.closest && el.closest("button, a")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      return send(S);
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      return slett(S);
    }
    if (e.key === "Escape" && valg.length) {
      valg = [];
      return oppdaterOrd(S);
    }
    if (e.key && e.key.length === 1 && /\p{L}/u.test(e.key)) {
      e.preventDefault();
      skriv(S, e.key.toLocaleLowerCase(R.lokale || "nb"));
    }
  });
  // The on-screen keys never take the focus from a finger, so Enter on a real keyboard always sends.
  document.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.closest && e.target.closest(".sj-ball, .sj-knapper button")) e.preventDefault();
  });

  // ---------- Sharing (points and helord count, never the words) ----------

  function delLinjer(sp) {
    return [R.t("{n} poeng", { n: totalt(sp) }), R.t("{n} av {av} helord", { n: antallHelord(sp), av: PLAN.length }), sp.runder.map((r) => (helordFunnet(r) ? "★" : "☆")).join(""), MODUSNAVN[sp.modus]];
  }

  const tall = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
  const tomRekord = () => ({ spilt: 0, best: 0, sist: null });

  R.start({
    id: "sjongloren",
    versjon: 1,
    pagar,
    _motor: MOTOR,
    _svar: (sett) => svarAv(sett).slice(),

    tilstand: () => ({ spill: null, rekord: { tid: tomRekord(), rolig: tomRekord() } }),

    lastet(S) {
      const sp = S.spill;
      const okRunde = (r) =>
        r &&
        typeof r.sett === "string" &&
        (SEKS.includes(r.sett) || SJU.includes(r.sett)) &&
        Array.isArray(r.funnet) &&
        r.funnet.every((o) => typeof o === "string") &&
        Array.isArray(r.rekkefolge) &&
        r.rekkefolge.slice().sort((a, b) => a - b).join() === bokstaver(r.sett).map((_, k) => k).join() &&
        Number.isFinite(r.igjen);
      if (!(sp && ["tid", "rolig"].includes(sp.modus) && Array.isArray(sp.runder) && sp.runder.length === PLAN.length && sp.runder.every(okRunde) && Number.isInteger(sp.nr) && sp.nr >= 0 && sp.nr < PLAN.length)) S.spill = null;
      if (S.spill) {
        for (const r of S.spill.runder) {
          const svar = svarAv(r.sett);
          r.funnet = r.funnet.filter((o, i, a) => svar.includes(o) && a.indexOf(o) === i);
          r.igjen = R.klamp(r.igjen, 0, TID * 1000);
          r.ferdig = !!r.ferdig || (S.spill.modus === "tid" && r.igjen <= 0);
        }
        S.spill.ferdig = !!S.spill.ferdig;
      }
      const rk = S.rekord && typeof S.rekord === "object" ? S.rekord : {};
      S.rekord = {};
      for (const m of ["tid", "rolig"]) {
        const x = rk[m] && typeof rk[m] === "object" ? rk[m] : {};
        S.rekord[m] = { spilt: tall(x.spilt), best: tall(x.best), sist: Number.isInteger(x.sist) && x.sist >= 0 ? x.sist : null };
      }
      const sp2 = S.spill;
      if (!sp2 && ["spill", "runde", "slutt"].includes(S.skjerm)) S.skjerm = "hjem";
      if (sp2 && sp2.ferdig && ["spill", "runde"].includes(S.skjerm)) S.skjerm = "slutt";
      if (sp2 && !sp2.ferdig && S.skjerm === "slutt") S.skjerm = "spill";
      if (sp2 && !sp2.ferdig && S.skjerm === "spill" && runde(sp2).ferdig) S.skjerm = "runde";
      if (sp2 && !sp2.ferdig && S.skjerm === "runde" && !runde(sp2).ferdig) S.skjerm = "spill";
    },

    regler: {
      intro: R.t("Sjongløren kaster seks eller sju bokstaver i lufta. Lag så mange ord du kan av dem – og finn helordet som bruker alle."),
      steg: [
        [R.t("Lag et ord"), R.t("Trykk på bokstavene, eller skriv på tastaturet, og trykk «Send». Ordet må ha minst tre bokstaver, og hver bokstav kan bare brukes så mange ganger som den er i lufta.")],
        [R.t("Samle poeng"), R.t("Tre bokstaver gir 1 poeng, fire gir 2, fem gir 3, seks gir 4 og sju gir 5. Helordet gir 10 poeng ekstra.")],
        [R.t("Fem runder"), R.t("Seks bokstaver i de to første rundene, sju i de tre siste. På tid har hver runde to minutter; uten klokke går du videre når du vil.")],
      ],
      tips: [
        R.t("Bøyde former teller også, som flertall og fortid."),
        R.t("Kast bokstavene opp igjen for å se dem i en ny rekkefølge – det gir ofte nye ideer."),
        R.t("Raden over bokstavene viser hvor mange ord det finnes av hver lengde. Stjernen er helordet."),
        R.t("Når runden er over, ser du alle ordene du kunne ha funnet."),
        R.t("Ordlista bygger på Norsk ordbank – bokmål 2005 fra Språkbanken ved Nasjonalbiblioteket (CC BY 4.0). Stygge, grove og svært sjeldne ord er tatt ut."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = pagar(S);
          const linje = (m) => {
            const rk = S.rekord[m];
            return rk.sist != null ? `<li><b>${esc(MODUSNAVN[m])}</b><span>${esc(R.t("sist {sist} p · rekord {best} p", { sist: rk.sist, best: rk.best }))}</span></li>` : "";
          };
          const rekorder = linje("tid") + linje("rolig");
          const knapper = aktiv
            ? R.ui.knapp(R.t("Fortsett · runde {n} av {av}", { n: sp.nr + 1, av: PLAN.length }), "fortsett") + R.ui.knapp2(R.t("På tid"), "ny", { v: "tid" }) + R.ui.knapp2(R.t("Uten klokke"), "ny", { v: "rolig" })
            : R.ui.knapp(R.t("På tid"), "ny", { v: "tid", variant: "stor", ikon: "⏱️" }) + R.ui.knapp2(R.t("Uten klokke"), "ny", { v: "rolig" });
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Bokstaver i lufta. Ord i hånda."))}<br><em>${esc(R.t("Finner du helordet?"))}</em>`,
            knapperHtml: knapper + (rekorder ? `<ul class="sj-rekorder" aria-label="${esc(R.t("Rekorder"))}">${rekorder}</ul>` : "") + R.ui.lenkerad(R.ui.lenke(R.t("Slik spiller du"), "regler")),
            merker: [["5", R.t("runder")], ["6–7", R.t("bokstaver")], ["2:00", R.t("per runde på tid")]],
          });
        },
        inn: () => R.slippVaken(),
      },

      spill: {
        tittel: (S) => (S.spill ? R.t("Runde {n} av {av}", { n: S.spill.nr + 1, av: PLAN.length }) : ""),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = runde(sp);
          const av = !kanSpille(S);
          const lenker = sp.modus === "rolig" ? R.ui.lenkerad(R.ui.lenke(R.t("Neste runde"), "neste"), R.ui.lenke(R.t("Avslutt"), "avslutt")) : R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt"));
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{navn}, runde {n} av {av}", { navn: NAVN, n: sp.nr + 1, av: PLAN.length }))}</h1>
            ${infoHtml(sp)}
            ${lengderHtml(r)}
            <div class="sj-ordfelt">
              <p class="sj-ord" aria-live="off">${ordHtml(r)}</p>
              <p class="sj-hjelp">${hjelpHtml()}</p>
            </div>
            ${ballerHtml(r, av)}
            ${R.ui.dokk(knapperHtml(av), lenker)}`;
        },
        inn(S) {
          valg = [];
          melding = null;
          opptatt = false;
          if (!S.spill || S.spill.ferdig) return R.gaTil("hjem");
          if (runde(S.spill).ferdig) return R.gaTil("runde");
          R.holdVaken();
          startKlokke();
        },
        ut() {
          stoppKlokke();
          valg = [];
          melding = null;
          clearTimeout(meldingId);
          meldingId = null;
          R.lagre();
        },
      },

      runde: {
        tittel: (S) => (S.spill ? R.t("Runde {n} av {av}", { n: S.spill.nr + 1, av: PLAN.length }) : ""),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = runde(sp);
          const svar = svarAv(r.sett);
          const hel = helordFunnet(r);
          const helord = svar.filter((o) => erHelord(o, r.sett));
          const sist = sp.nr === PLAN.length - 1;
          return `
            ${R.ui.banner({
              etikett: R.t("Runde {n} av {av}", { n: sp.nr + 1, av: PLAN.length }),
              tittel: alleFunnet(r) ? R.t("Alle ordene!") : hel ? R.t("Du fant helordet!") : R.t("Helordet var {ord}", { ord: R.ramsOpp(helord.map(stor)) }),
              tekst: `${R.t("{n} av {av} ord", { n: r.funnet.length, av: svar.length })} · ${R.t("{n} poeng", { n: sumPoeng(r.funnet, r.sett) })}`,
              klasse: "sj-banner",
              stemning: hel ? "jubel" : r.funnet.length >= 3 ? "" : "lei",
            })}
            ${sp.nr ? `<p class="sj-total">${esc(R.t("Totalt {n} poeng", { n: totalt(sp) }))}</p>` : ""}
            <section class="seksjon" aria-labelledby="sj-alle-tittel">
              <div class="seksjon-hode"><h2 id="sj-alle-tittel">${esc(R.t("Alle ordene"))}</h2><span class="tall">${esc(R.t("{n}/{av}", { n: r.funnet.length, av: svar.length }))}</span></div>
              ${ordlisteHtml(r, true)}
            </section>
            ${R.ui.dokk(sist ? R.ui.knapp(R.t("Se resultatet"), "resultat", { ikon: "🏆" }) : R.ui.knapp(R.t("Neste runde"), "videre", { ikon: "🤹" }), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          R.slippVaken();
          const r = runde(S.spill);
          if (helordFunnet(r)) R.lyd.riktig();
          else R.lyd.pling();
        },
      },

      slutt: {
        tittel: R.t("Resultatet"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const p = totalt(sp);
          const rk = S.rekord[sp.modus];
          const n = antallHelord(sp);
          const helt = sp.runder.every((r) => r.ferdig);
          const ny = helt && rk.spilt > 1 && p >= rk.best && p > 0;
          const rader = sp.runder
            .map((r, k) => {
              const hel = helordFunnet(r);
              const helord = svarAv(r.sett).filter((o) => erHelord(o, r.sett));
              return `<li class="${hel ? "hel" : ""}"><span class="sj-nr">${k + 1}</span><b>${r.ferdig ? `${hel ? "★" : "☆"} ${esc(R.ramsOpp(helord.map(stor)))}` : "–"}</b><span>${esc(r.ferdig ? R.t("{n} p", { n: sumPoeng(r.funnet, r.sett) }) : R.t("ikke spilt"))}</span></li>`;
            })
            .join("");
          return `
            ${R.ui.banner({
              etikett: `${MODUSNAVN[sp.modus]} · ${R.t("{n} av {av} helord", { n, av: PLAN.length })}`,
              tittel: n === PLAN.length ? R.t("Alle fem helordene!") : ny ? R.t("Ny rekord: {n} poeng!", { n: p }) : R.t("{n} poeng", { n: p }),
              tekst: n === PLAN.length ? R.t("{n} poeng – sjonglørkunst!", { n: p }) : n >= 3 ? R.t("Godt jobba!") : R.t("Takk for runden – neste gang lander flere ord."),
              stemning: n >= 3 || ny ? "jubel" : n >= 1 ? "" : "lei",
            })}
            <ol class="sj-runder" aria-label="${esc(R.t("Rundene"))}">${rader}</ol>
            ${rk.spilt ? `<p class="sj-total">${esc(R.t("{modus}: rekord {best} p · {n} spill", { modus: MODUSNAVN[sp.modus], best: rk.best, n: rk.spilt }))}</p>` : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🤹" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          R.slippVaken();
          if (!nyFeiring) return;
          nyFeiring = false;
          const sp = S.spill;
          if (antallHelord(sp) >= 3) {
            R.lyd.fanfare();
            if (!R.rolig()) R.konfetti();
          } else R.lyd.pling();
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && R.visInstallTips(), 3000);
        },
      },
    },

    handlinger: (H = {
      async ny(el, e, S) {
        const modus = el.dataset.v === "rolig" ? "rolig" : "tid";
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S), true)) || !fortsatt()) return;
        nyttSpill(S, modus);
        lyd.kast();
        R.gaTil("spill");
      },
      fortsett(el, e, S) {
        if (!S.spill) return;
        R.gaTil(S.spill.ferdig ? "slutt" : runde(S.spill).ferdig ? "runde" : "spill");
      },
      igjen(el, e, S) {
        nyttSpill(S, S.spill ? S.spill.modus : "tid");
        lyd.kast();
        R.gaTil("spill");
      },
      hjem() {
        R.gaTil("hjem");
      },
      ball(el, e, S) {
        velgBall(S, Number(el.dataset.v));
      },
      send(el, e, S) {
        send(S);
      },
      slett(el, e, S) {
        slett(S);
      },
      stokk(el, e, S) {
        stokk(S);
      },
      neste(el, e, S) {
        nesteRundeNa(S);
      },
      videre(el, e, S) {
        const sp = S.spill;
        if (!sp || !runde(sp).ferdig) return;
        if (sp.nr >= PLAN.length - 1) return avslutt(S);
        sp.nr++;
        lyd.kast();
        R.gaTil("spill");
      },
      resultat(el, e, S) {
        const sp = S.spill;
        if (sp && !sp.ferdig && runde(sp).ferdig) avslutt(S);
      },
      ordene(el, e, S) {
        R.ark(ordArk(S));
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Du ser poengene så langt. Spillet teller ikke i rekorden før alle fem rundene er spilt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp || sp.ferdig) return;
        if (!runde(sp).ferdig) runde(sp).ferdig = true;
        // Rounds not reached count as not played.
        for (let k = sp.nr + 1; k < PLAN.length; k++) sp.runder[k].ferdig = false;
        avslutt(S);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const l = delLinjer(sp);
        R.del(NAVN, `${NAVN} · ${l[3]}\n${l[0]} · ${l[1]}\n${l[2]}\n`, DEL_URL, { kort: { tittel: NAVN, linjer: l } });
      },
    }),
  });
})();
