/* Edderkoppen — a word hunt in a 4 × 4 grid of letters. Spin words from letter to letter: every next
   letter touches the one before (sideways, up, down or on the slant), and a letter is used once per
   word. Words of three letters or more; three minutes on the clock.
   Points: 3–4 letters 1, 5 letters 2, 6 letters 3, 7 letters 5, 8 or more 11.
   «Dagens rutenett»: everyone in the edition gets the same grid each day (R.dag); one go of three
   minutes; the day's goal is a fifth of the grid's points (R.dagligFerdig).
   «Fritt spill»: a grid from the free pool, as often as you like (best and last score on home).
   «Sammen»: two to eight players take turns on the same grid with the phone; at «Kåringen» a word
   that more than one player found is struck out (can be switched off), the rest score as usual.
   The grids and their answers are precomputed (data/rutenett.json, build/ordspill/lag-rutenett.mjs):
   a grid's answers are the words of the data's list that can be traced in it – the browser gets
   those words, never a whole dictionary.
   Input: drag a finger through the letters, tap them one by one (tap the last one again or «Send»),
   or type on a keyboard (the word is found in the grid by itself; Enter sends).
   The engine at the top has no kit and no data of its own, so test/edderkoppen.test.mjs can load
   this file in node:vm (window.Edderkoppen). */
(function () {
  "use strict";

  // ---------- Engine (pure) ----------

  // FROZEN: «Edderkoppen nr. 1» is 14 November 2026 (data/rutenett.json «dagens»[0]).
  const FORSTE = Math.floor(Date.UTC(2026, 10, 14) / 86400000);
  const STR = 4;
  const N = STR * STR;
  const MIN_LENGDE = 3;
  const TID = 180; // seconds per go
  const POENG = [0, 0, 0, 1, 1, 2, 3, 5];
  const MAAL_ANDEL = 0.2; // the day's goal: a fifth of the grid's points
  const STJERNER = [0.2, 0.35, 0.5]; // ★, ★★, ★★★

  const bokstaver = (o) => Array.from(String(o || ""));
  const indeksFor = (nr, antall) => ((((nr - FORSTE) % antall) + antall) % antall);
  const nrFor = (nr) => nr - FORSTE + 1;

  const NABO = Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / STR);
    const c = i % STR;
    const ut = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && r + dr < STR && c + dc >= 0 && c + dc < STR) ut.push((r + dr) * STR + c + dc);
    return ut;
  });
  const erNabo = (a, b) => NABO[a] && NABO[a].includes(b);
  // A path: cells in order, each once, each touching the one before.
  const gyldigSti = (sti) => Array.isArray(sti) && sti.every((c, k) => Number.isInteger(c) && c >= 0 && c < N && sti.indexOf(c) === k && (!k || erNabo(sti[k - 1], c)));
  const lesSti = (rute, sti) => sti.map((c) => rute[c]).join("");

  // One way to trace a word in a grid (an array of 16 letters), or null. `start` (optional) is a
  // path to try to keep: the first cells of the answer follow it as long as they can.
  function finnSti(rute, ord, start) {
    const b = bokstaver(ord);
    if (!b.length) return [];
    const brukt = new Array(N).fill(false);
    const sti = [];
    const forslag = start || [];
    const gaa = (i, k) => {
      if (rute[i] !== b[k]) return false;
      brukt[i] = true;
      sti.push(i);
      if (k === b.length - 1) return true;
      const neste = NABO[i].slice().sort((x, y) => (y === forslag[k + 1]) - (x === forslag[k + 1]));
      for (const j of neste) if (!brukt[j] && gaa(j, k + 1)) return true;
      brukt[i] = false;
      sti.pop();
      return false;
    };
    const forsok = Array.from({ length: N }, (_, i) => i).sort((x, y) => (y === forslag[0]) - (x === forslag[0]));
    for (const i of forsok) if (gaa(i, 0)) return sti;
    return null;
  }
  const kanSpores = (rute, ord) => !!finnSti(rute, ord);

  // A grid's answers: the words of the list (3+ letters) that can be traced in it, in the list's
  // order. The list is put into a letter tree once (kept per list), then every path of the grid is
  // walked as long as it is the start of some word.
  const treCache = new WeakMap();
  function treFor(liste) {
    let rot = treCache.get(liste);
    if (rot) return rot;
    rot = { b: Object.create(null), i: -1 };
    liste.forEach((o, i) => {
      const b = bokstaver(o);
      if (b.length < MIN_LENGDE || b.length > N) return;
      let n = rot;
      for (const x of b) n = n.b[x] || (n.b[x] = { b: Object.create(null), i: -1 });
      n.i = i;
    });
    treCache.set(liste, rot);
    return rot;
  }
  function svarFor(rute, liste) {
    const rot = treFor(liste);
    const funnet = new Set();
    const brukt = new Array(N).fill(false);
    const gaa = (i, n) => {
      const neste = n.b[rute[i]];
      if (!neste) return;
      if (neste.i >= 0) funnet.add(neste.i);
      brukt[i] = true;
      for (const j of NABO[i]) if (!brukt[j]) gaa(j, neste);
      brukt[i] = false;
    };
    for (let i = 0; i < N; i++) gaa(i, rot);
    return [...funnet].sort((a, b) => a - b).map((i) => liste[i]);
  }
  const poeng = (o) => {
    const n = bokstaver(o).length;
    return n >= POENG.length ? 11 : POENG[n];
  };
  const sumPoeng = (ord) => ord.reduce((s, o) => s + poeng(o), 0);
  const maalFor = (maks) => Math.max(5, Math.round(maks * MAAL_ANDEL));
  const stjernerFor = (p, maks) => STJERNER.filter((a) => p >= Math.max(5, Math.round(maks * a))).length;

  // Why a word is not taken ("" when it is a new answer).
  function vurder(ord, svar, funnet) {
    if (bokstaver(ord).length < MIN_LENGDE) return "kort";
    if (funnet.includes(ord)) return "funnet";
    if (!svar.includes(ord)) return "ukjent";
    return "";
  }

  // Together: a word that two or more players found is struck out (when «stryk» is on).
  function stroket(lister) {
    const antall = new Map();
    for (const l of lister) for (const o of new Set(l)) antall.set(o, (antall.get(o) || 0) + 1);
    return new Set([...antall].filter(([, n]) => n > 1).map(([o]) => o));
  }
  function gruppePoeng(lister, stryk) {
    const ut = stryk ? stroket(lister) : new Set();
    return lister.map((l) => sumPoeng(l.filter((o) => !ut.has(o))));
  }

  // What is wrong with one grid (an empty list when it is fine). Used by the unit test.
  function sjekkRutenett(r, liste) {
    const feil = [];
    const b = bokstaver(r);
    if (b.length !== N) feil.push(`«${r}» har ikke 16 bokstaver`); // sprak-ok (the unit test's own words)
    const svar = svarFor(b, liste);
    if (svar.length < 30) feil.push(`«${r}» har bare ${svar.length} svar`); // sprak-ok
    return feil;
  }

  const MOTOR = { FORSTE, STR, N, MIN_LENGDE, TID, POENG, NABO, indeksFor, nrFor, erNabo, gyldigSti, lesSti, finnSti, kanSpores, svarFor, poeng, sumPoeng, maalFor, stjernerFor, vurder, stroket, gruppePoeng, sjekkRutenett };

  const R = window.Rusj;
  if (!R) {
    window.Edderkoppen = MOTOR;
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const D = window.RUSJ_DATA;
  const DAGER = D.rutenett.dagens;
  const FRI = D.rutenett.fri;
  const LISTE = D.rutenett.ord.split(" ");
  const NAVN = (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Edderkoppen"; // sprak-ok
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "edderkoppen") + "/";
  const stor = (o) => String(o).toLocaleUpperCase(R.lokale || "nb");
  const MAKS_SKREVET = 16;

  let H;
  let valg = []; // the cells being traced (not saved)
  let skrevet = ""; // letters typed on a keyboard (not saved)
  let melding = null; // { tekst, klasse }
  let meldingId = null;
  let peker = null; // a finger or a mouse on the grid: { start, beveget, id }
  let sistPeker = 0;
  let klokkeId = null;
  let sistTikk = 0;
  let sistLagret = 0;
  let nyFeiring = false;

  const iDag = () => R.dag().nr;
  const ruteFor = (sp) => bokstaver(sp.r);
  const svarCache = new Map();
  const svarAv = (r) => {
    if (!svarCache.has(r)) svarCache.set(r, svarFor(bokstaver(r), LISTE));
    return svarCache.get(r);
  };
  const dagRute = (nr) => DAGER[indeksFor(nr, DAGER.length)];
  // The game being played on the board: today's, a free one, or the current player's go together.
  const aktiv = (S) => (S.modus === "fri" ? S.fri : S.modus === "sammen" ? S.sammen : S.dag);
  const funnetAv = (S, sp) => (S.modus === "sammen" ? sp.funnet[sp.tur] : sp.funnet);
  const ferdig = (sp) => !!(sp && sp.ferdig);
  const dagenIGang = (S) => !!(S.dag && S.dag.nr === iDag() && !S.dag.ferdig && S.dag.igjen < TID * 1000);
  const pagar = (S) => dagenIGang(S) || !!(S.fri && !S.fri.ferdig && S.fri.igjen < TID * 1000) || !!(S.sammen && !S.sammen.ferdig);
  const info = (r, funnet) => {
    const svar = svarAv(r);
    const maks = sumPoeng(svar);
    const p = sumPoeng(funnet);
    return { svar, maks, p, maal: maalFor(maks), stjerner: stjernerFor(p, maks) };
  };

  // ---------- Statistics ----------

  const tall = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
  const tomStat = () => ({ spilt: 0, maal: 0, rekke: 0, best: 0, sistMaal: null, sistSpilt: null, toppPoeng: 0 });
  function registrerDag(S) {
    const sp = S.dag;
    const st = S.stat;
    if (st.sistSpilt === sp.nr) return meldDagen(S);
    const inf = info(sp.r, sp.funnet);
    const vunnet = inf.p >= inf.maal;
    st.sistSpilt = sp.nr;
    st.spilt += 1;
    st.toppPoeng = Math.max(st.toppPoeng, inf.p);
    if (vunnet) {
      st.maal += 1;
      st.rekke = st.sistMaal === sp.nr - 1 ? st.rekke + 1 : 1;
      st.sistMaal = sp.nr;
      st.best = Math.max(st.best, st.rekke);
    } else st.rekke = 0;
    meldDagen(S);
  }
  // The front page's «✓ i dag»: the points and the stars (never a word).
  function meldDagen(S) {
    const sp = S.dag;
    if (!sp || sp.nr !== iDag() || S.stat.sistSpilt !== sp.nr) return;
    const inf = info(sp.r, sp.funnet);
    const vunnet = S.stat.sistMaal === sp.nr;
    R.dagligFerdig({ vunnet, rekke: vunnet ? S.stat.rekke : 0, res: `${R.t("{n} p", { n: inf.p })}${inf.stjerner ? " " + "★".repeat(inf.stjerner) : ""}` });
  }
  const rekkeNa = (S) => (S.stat.sistMaal != null && S.stat.sistMaal >= iDag() - 1 ? S.stat.rekke : 0);

  // ---------- Sounds ----------

  const lyd = {
    tast: (n) => R.lyd.tone(700 + Math.min(n, 10) * 45, 0, 0.04, "sine", 0.05),
    nei: () => R.lyd.tone(220, 0, 0.16, "triangle", 0.12, 170),
    ord: (n) => [660, 880, 1100].slice(0, 1 + Math.min(2, n)).forEach((f, i) => R.lyd.tone(f, i * 0.07, 0.12, "triangle", 0.09)),
    langt: () => [523, 659, 784, 1047].forEach((f, i) => R.lyd.tone(f, i * 0.08, 0.16, "triangle", 0.1)),
  };

  // ---------- The clock (three minutes, paused while the page is hidden or a sheet is open) ----------

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
    sistTikk = performance.now();
    klokkeId = setInterval(tikk, 250);
    R.vedForlat(stoppKlokke);
  }
  function tikk() {
    const S = R.S;
    const sp = S && aktiv(S);
    const na = performance.now();
    const dt = na - sistTikk;
    sistTikk = na;
    if (!sp || S.skjerm !== "brett" || ferdig(sp) || (S.modus === "sammen" && sp.fase !== "spill")) return stoppKlokke();
    if (document.hidden || R.arkApent()) return;
    const for_ = Math.ceil(sp.igjen / 1000);
    sp.igjen = Math.max(0, sp.igjen - dt);
    const etter = Math.ceil(sp.igjen / 1000);
    tegnKlokke(sp);
    if (etter !== for_ && etter > 0 && etter <= 5) {
      R.lyd.tikk();
      R.vibrer(8);
    }
    if (etter !== for_ && (etter === 60 || etter === 30 || etter === 10)) R.si(R.t("{n} sekunder igjen.", { n: etter }));
    if (na - sistLagret > 2000) {
      sistLagret = na;
      R.lagre();
    }
    if (sp.igjen <= 0) tidenErUte(S);
  }
  function tegnKlokke(sp) {
    const el = R.$(".ed-klokke");
    if (!el) return;
    el.querySelector("b").textContent = klokkeTekst(sp.igjen);
    el.style.setProperty("--andel", String(Math.max(0, sp.igjen) / (TID * 1000)));
    el.classList.toggle("lite", sp.igjen <= 10000);
  }

  // ---------- Markup ----------

  function infoHtml(S, sp) {
    const funnet = funnetAv(S, sp);
    const inf = info(sp.r, funnet);
    return `<div class="ed-info">
        <div class="ed-klokke${sp.igjen <= 10000 ? " lite" : ""}" style="--andel:${Math.max(0, sp.igjen) / (TID * 1000)}" role="timer" aria-label="${esc(R.t("Tid igjen"))}"><b>${esc(klokkeTekst(sp.igjen))}</b><i aria-hidden="true"></i></div>
        <button class="ed-funnet" data-h="ordene" aria-label="${esc(R.t("Ordene dine: {n}, {p}. Vis alle.", { n: funnet.length, p: R.t("{n} poeng", { n: inf.p }) }))}">
          <b>${esc(R.t("{n} ord", { n: funnet.length }))}</b><span>${esc(R.t("{n} p", { n: inf.p }))}${S.modus === "dag" ? ` · ${esc(R.t("mål {n}", { n: inf.maal }))}` : ""}</span><i aria-hidden="true">›</i>
        </button>
      </div>`;
  }
  function ordfeltHtml(sp) {
    const rute = ruteFor(sp);
    const ord = valg.length ? lesSti(rute, valg) : skrevet;
    return ord
      ? bokstaver(ord).map((x) => `<span>${esc(stor(x))}</span>`).join("") + (valg.length ? "" : skrevet && !finnSti(rute, skrevet) ? `<em class="ed-ikke">${esc(R.t("ikke i rutenettet"))}</em>` : "")
      : `<span class="ed-tom">${esc(R.t("Dra over bokstavene"))}</span>`;
  }
  const hjelpHtml = () => (melding ? `<span class="ed-varsel ${melding.klasse || ""}">${esc(melding.tekst)}</span>` : "");

  // The thread through the chosen cells (an SVG line over the grid, 100 units per cell).
  function traadHtml(sti) {
    if (sti.length < 2) return "";
    const pkt = sti.map((c) => `${(c % STR) * 100 + 50},${Math.floor(c / STR) * 100 + 50}`).join(" ");
    return `<polyline points="${pkt}" />`;
  }
  function gjeldendeSti(sp) {
    if (valg.length) return valg;
    if (skrevet) return finnSti(ruteFor(sp), skrevet) || [];
    return [];
  }
  function ruteHtml(sp, av) {
    const rute = ruteFor(sp);
    const sti = gjeldendeSti(sp);
    const celler = rute
      .map((b, i) => {
        const k = sti.indexOf(i);
        return `<button class="ed-celle${k >= 0 ? " valgt" : ""}${k >= 0 && k === sti.length - 1 ? " siste" : ""}" data-i="${i}" tabindex="${i === 0 ? 0 : -1}" aria-label="${esc(stor(b))}"${av ? " disabled" : ""}><span>${esc(stor(b))}</span></button>`;
      })
      .join("");
    return `<div class="ed-rute" role="group" aria-label="${esc(R.t("Bokstavene, fire og fire"))}">
        <svg class="ed-traad" viewBox="0 0 400 400" aria-hidden="true" focusable="false">${traadHtml(sti)}</svg>
        ${celler}
      </div>`;
  }
  function knapperHtml(av) {
    return `<div class="ed-knapper">
        <button class="knapp-2 ed-slett" data-h="slett" data-stille${av ? " disabled" : ""}>${esc(R.t("Slett"))}</button>
        <button class="knapp ed-send" data-h="send" data-stille${av ? " disabled" : ""}>${esc(R.t("Send"))}</button>
      </div>`;
  }
  // A small grid for the result screens.
  const miniHtml = (r) => `<div class="ed-mini" aria-hidden="true">${bokstaver(r).map((b) => `<span>${esc(stor(b))}</span>`).join("")}</div>`;

  // Words in a list: longest first; the found ones marked, struck ones crossed.
  function ordlisteHtml(liste, o = {}) {
    if (!liste.length) return `<p class="hjelp">${esc(o.tom || R.t("Ingen ord ennå."))}</p>`;
    const sortert = liste.slice().sort((a, b) => bokstaver(b).length - bokstaver(a).length || a.localeCompare(b, R.lokale));
    return `<ul class="ed-ordliste">${sortert
      .map((w) => {
        const fant = !o.funnet || o.funnet.includes(w);
        const ut = o.stroket && o.stroket.has(w);
        return `<li class="${fant ? "" : "glemt"}${ut ? " ut" : ""}">${esc(stor(w))}<small>${poeng(w)}</small>${!fant ? `<span class="vh"> ${esc(R.t("(ikke funnet)"))}</span>` : ""}${ut ? `<span class="vh"> ${esc(R.t("(strøket)"))}</span>` : ""}</li>`;
      })
      .join("")}</ul>`;
  }
  function ordArk(S) {
    const sp = aktiv(S);
    const funnet = funnetAv(S, sp);
    return `<h2 id="ark-tittel">${esc(R.t("Ordene dine"))}</h2>
      <p class="hjelp">${esc(R.t("{n} ord", { n: funnet.length }))} · ${esc(R.t("{n} poeng", { n: sumPoeng(funnet) }))}</p>
      ${ordlisteHtml(funnet, { tom: R.t("Du har ikke funnet noen ord ennå.") })}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }
  function tallHtml(S) {
    const st = S.stat;
    return `<div class="ed-tall">
        <div><b>${R.tall(st.spilt)}</b><span>${esc(R.t("spilt"))}</span></div>
        <div><b>${R.tall(st.maal)}</b><span>${esc(R.t("nådd målet"))}</span></div>
        <div><b>${R.tall(rekkeNa(S))}</b><span>${esc(R.t("på rad"))}</span></div>
        <div><b>${R.tall(st.toppPoeng)}</b><span>${esc(R.t("beste poeng"))}</span></div>
      </div>`;
  }
  function statistikkArk(S) {
    return `<h2 id="ark-tittel">${esc(R.t("Statistikk"))}</h2>
      ${S.stat.spilt ? tallHtml(S) + `<p class="hjelp">${esc(R.t("Beste rekke: {n} dager på rad.", { n: R.tall(S.stat.best) }))}</p>` : `<p class="ingress">${esc(R.t("Du har ikke spilt dagens rutenett ennå. Gjør det, så dukker statistikken opp her."))}</p>`}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }

  // ---------- Playing ----------

  function oppdaterBrett(S) {
    const sp = aktiv(S);
    if (!sp) return;
    const felt = R.$(".ed-ord");
    if (felt) felt.innerHTML = ordfeltHtml(sp);
    const sti = gjeldendeSti(sp);
    document.querySelectorAll(".ed-rute .ed-celle").forEach((k) => {
      const i = Number(k.dataset.i);
      const n = sti.indexOf(i);
      k.classList.toggle("valgt", n >= 0);
      k.classList.toggle("siste", n >= 0 && n === sti.length - 1);
    });
    const svg = R.$(".ed-traad");
    if (svg) svg.innerHTML = traadHtml(sti);
  }
  function visHjelp() {
    const el = R.$(".ed-hjelp");
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
    const el = R.$(".ed-ord");
    if (!el || R.rolig()) return;
    el.classList.remove("risting");
    void el.offsetWidth;
    el.classList.add("risting");
  }
  const kanSpille = (S) => {
    const sp = aktiv(S);
    return !!(sp && S.skjerm === "brett" && !ferdig(sp) && sp.igjen > 0 && (S.modus !== "sammen" || sp.fase === "spill"));
  };

  // A tap on a cell: start, add a neighbour, go back, or send when the last one is tapped again.
  function trykkCelle(S, i) {
    if (!kanSpille(S)) return;
    skrevet = "";
    const siste = valg[valg.length - 1];
    if (!valg.length) valg = [i];
    else if (i === siste) return send(S);
    else if (valg.includes(i)) valg = valg.slice(0, valg.indexOf(i) + 1);
    else if (erNabo(siste, i)) valg.push(i);
    else valg = [i];
    lyd.tast(valg.length);
    oppdaterBrett(S);
  }
  function skriv(S, b) {
    if (!kanSpille(S)) return;
    valg = [];
    if (bokstaver(skrevet).length >= MAKS_SKREVET) return;
    skrevet += b;
    lyd.tast(bokstaver(skrevet).length);
    oppdaterBrett(S);
  }
  function slett(S) {
    if (!kanSpille(S)) return;
    if (valg.length) valg.pop();
    else skrevet = bokstaver(skrevet).slice(0, -1).join("");
    lyd.tast(0);
    oppdaterBrett(S);
  }

  const ROS = [R.t("Bra!"), R.t("Fint!"), R.t("Flott!"), R.t("Supert!"), R.t("Wow!")];
  function send(S) {
    if (!kanSpille(S)) return;
    const sp = aktiv(S);
    const rute = ruteFor(sp);
    const ord = valg.length ? lesSti(rute, valg) : skrevet;
    const kunSkrevet = !valg.length;
    valg = [];
    skrevet = "";
    if (!ord) return oppdaterBrett(S);
    const funnet = funnetAv(S, sp);
    let grunn = vurder(ord, svarAv(sp.r), funnet);
    if (grunn === "ukjent" && kunSkrevet && !finnSti(rute, ord)) grunn = "rute";
    if (grunn) {
      const tekst = { kort: R.t("For kort – minst tre bokstaver"), funnet: R.t("Det ordet har du alt"), ukjent: R.t("Ikke i ordlista"), rute: R.t("Finnes ikke i rutenettet") }[grunn];
      lyd.nei();
      R.vibrer(30);
      oppdaterBrett(S);
      rist();
      settMelding(tekst, "feil");
      R.si(tekst);
      return;
    }
    funnet.push(ord);
    const p = poeng(ord);
    const n = bokstaver(ord).length;
    if (S.modus === "dag" && sp.nr === iDag()) R.dagligIGang({ tekst: R.t("{n} ord", { n: funnet.length }) });
    R.lagre();
    if (n >= 6) {
      lyd.langt();
      R.vibrer([25, 30, 25]);
    } else {
      lyd.ord(n - 3);
      R.vibrer(20);
    }
    melding = { tekst: `${ROS[Math.min(4, n - 3)]} +${p}`, klasse: n >= 6 ? "langt" : "ok" };
    clearTimeout(meldingId);
    meldingId = setTimeout(() => {
      melding = null;
      meldingId = null;
      visHjelp();
    }, 1600);
    R.vis();
    R.si(R.t("{ord} gir {poeng}.", { ord: stor(ord), poeng: R.t("{n} poeng", { n: p }) }));
  }

  // Time is up (or «Ferdig»): the go ends.
  function tidenErUte(S, tidlig) {
    const sp = aktiv(S);
    if (!sp || ferdig(sp)) return;
    stoppKlokke();
    valg = [];
    skrevet = "";
    if (!tidlig) {
      R.lyd.alarm();
      R.vibrer([150, 80, 150]);
    }
    if (S.modus === "sammen") {
      sp.igjen = 0;
      sp.fase = "gi";
      const hvem = sp.spillere[sp.tur];
      const antall = sp.funnet[sp.tur].length;
      sp.tur++;
      if (sp.tur >= sp.spillere.length) {
        sp.ferdig = true;
        R.statistikk("ferdig", { modus: "sammen", spillere: sp.spillere.length });
        R.lagre();
        return R.gaTil("kaaring");
      }
      R.lagre();
      R.gaTil("gi");
      R.toast(R.t("Tiden er ute! {navn} fant {n} ord.", { navn: R.navn(hvem), n: antall }));
      return;
    }
    sp.ferdig = true;
    sp.igjen = 0;
    const inf = info(sp.r, sp.funnet);
    if (S.modus === "dag") registrerDag(S);
    else {
      S.fritt.spilt += 1;
      S.fritt.sist = inf.p;
      S.fritt.best = Math.max(S.fritt.best, inf.p);
    }
    R.statistikk("ferdig", { modus: S.modus, ord: sp.funnet.length, poeng: inf.p });
    nyFeiring = true;
    R.lagre();
    R.gaTil("resultat");
  }

  async function avsluttTidlig(S) {
    const sp = aktiv(S);
    if (!sp || ferdig(sp)) return;
    const fortsatt = R.vakt();
    const dag = S.modus === "dag";
    const ok = await R.bekreft(
      R.t("Stoppe klokka?"),
      dag ? R.t("Da er dagens rutenett ferdig, og du ser alle ordene. Du får ikke et nytt forsøk i dag.") : S.modus === "sammen" ? R.t("Da er turen din over, og mobilen går videre.") : R.t("Da er runden over, og du ser alle ordene."),
      R.t("Stopp"),
      R.t("Spill videre"),
    );
    if (!ok || !fortsatt() || aktiv(S) !== sp || ferdig(sp)) return;
    tidenErUte(S, true);
  }

  // ---------- Sharing (points and stars, never the words) ----------

  function delTekst(S) {
    const sp = S.dag;
    const inf = info(sp.r, sp.funnet);
    const rekke = rekkeNa(S);
    return `${R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) })}${inf.stjerner ? " " + "★".repeat(inf.stjerner) : ""}\n${R.t("{n} poeng", { n: inf.p })} · ${R.t("{n} av {av} ord", { n: sp.funnet.length, av: inf.svar.length })}${rekke > 1 ? `\n🔥 ${R.t("{n} på rad", { n: rekke })}` : ""}\n`;
  }
  function delKort(S) {
    const sp = S.dag;
    const inf = info(sp.r, sp.funnet);
    const rekke = rekkeNa(S);
    return {
      tittel: R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) }),
      linjer: [R.t("{n} poeng", { n: inf.p }), R.t("{n} av {av} ord", { n: sp.funnet.length, av: inf.svar.length }), inf.stjerner ? "★".repeat(inf.stjerner) : "", rekke > 1 ? `🔥 ${R.t("{n} på rad", { n: rekke })}` : ""].filter(Boolean),
    };
  }

  // ---------- Fingers, mouse and keyboard on the grid ----------

  // The cell under a point, only when the point is well inside it (so a slanting drag does not
  // catch the cells beside the line).
  function celleVed(x, y) {
    const el = document.elementFromPoint(x, y);
    const k = el && el.closest && el.closest(".ed-rute .ed-celle");
    if (!k) return -1;
    const r = k.getBoundingClientRect();
    return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) <= r.width * 0.42 ? Number(k.dataset.i) : -1;
  }
  document.addEventListener("pointerdown", (e) => {
    const S = R.S;
    const k = e.target && e.target.closest && e.target.closest(".ed-rute .ed-celle");
    if (!S || !k || (e.pointerType === "mouse" && e.button !== 0) || !kanSpille(S)) return;
    e.preventDefault(); // keeps the focus off the cell, so Enter on a keyboard always sends
    if (k.hasPointerCapture && k.hasPointerCapture(e.pointerId)) k.releasePointerCapture(e.pointerId);
    peker = { start: Number(k.dataset.i), beveget: false, id: e.pointerId };
  });
  document.addEventListener("pointermove", (e) => {
    const S = R.S;
    if (!peker || !S || e.pointerId !== peker.id || !kanSpille(S)) return;
    const i = celleVed(e.clientX, e.clientY);
    if (i < 0) return;
    if (!peker.beveget) {
      if (i === peker.start) return;
      peker.beveget = true;
      skrevet = "";
      valg = [peker.start];
    }
    const siste = valg[valg.length - 1];
    if (i === siste) return;
    if (valg.length > 1 && i === valg[valg.length - 2]) valg.pop();
    else if (!valg.includes(i) && erNabo(siste, i)) valg.push(i);
    else return;
    lyd.tast(valg.length);
    oppdaterBrett(S);
    e.preventDefault();
  });
  function pekerSlutt(e) {
    const S = R.S;
    if (!peker || !S || (e && e.pointerId !== peker.id)) return;
    const p = peker;
    peker = null;
    sistPeker = Date.now();
    if (p.beveget) send(S);
    else trykkCelle(S, p.start);
  }
  document.addEventListener("pointerup", pekerSlutt);
  document.addEventListener("pointercancel", () => {
    peker = null;
  });
  // A click without a pointer gesture: the keyboard on a focused cell, a switch, a screen reader.
  document.addEventListener("click", (e) => {
    const S = R.S;
    const k = e.target && e.target.closest && e.target.closest(".ed-rute .ed-celle");
    if (!S || !k || Date.now() - sistPeker < 700) return;
    trykkCelle(S, Number(k.dataset.i));
  });
  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "brett" || e.ctrlKey || e.metaKey || e.altKey || (R.arkApent && R.arkApent())) return;
    const el = e.target;
    if (el && el.closest && el.closest("input, textarea, select")) return;
    const celle = el && el.closest && el.closest(".ed-rute .ed-celle");
    // Arrow keys move between the cells.
    const flytt = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -STR, ArrowDown: STR }[e.key];
    if (celle && flytt != null) {
      e.preventDefault();
      const i = Number(celle.dataset.i);
      let j = i + flytt;
      if ((e.key === "ArrowLeft" && i % STR === 0) || (e.key === "ArrowRight" && i % STR === STR - 1) || j < 0 || j >= N) j = i;
      const alle = Array.from(document.querySelectorAll(".ed-rute .ed-celle"));
      alle.forEach((x) => (x.tabIndex = -1));
      alle[j].tabIndex = 0;
      alle[j].focus();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && el && el.closest && el.closest("button, a")) return;
    if (e.key === "Escape" && (valg.length || skrevet)) {
      valg = [];
      skrevet = "";
      return oppdaterBrett(S);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      return send(S);
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      return slett(S);
    }
    if (e.key && e.key.length === 1 && /\p{L}/u.test(e.key)) {
      e.preventDefault();
      skriv(S, e.key.toLocaleLowerCase(R.lokale || "nb"));
    }
  });

  // ---------- Starting a go ----------

  const nyGang = (r) => ({ r, funnet: [], igjen: TID * 1000, ferdig: false });
  function nyttDagspill(S) {
    S.dag = Object.assign(nyGang(dagRute(iDag())), { nr: iDag() });
    R.statistikk("start", { modus: "dag" });
  }
  function nyttFritt(S) {
    const i = R.kortstokk("fri", FRI.length).neste();
    S.fri = Object.assign(nyGang(FRI[Math.max(0, i)]), { i: Math.max(0, i) });
    R.statistikk("start", { modus: "fri" });
  }
  function nyttSammen(S) {
    const n = R.klamp(S.antall || 2, 2, 8);
    const i = R.kortstokk("fri", FRI.length).neste();
    S.sammen = { r: FRI[Math.max(0, i)], i: Math.max(0, i), spillere: Array.from({ length: n }, (_, k) => k), tur: 0, funnet: Array.from({ length: n }, () => []), igjen: TID * 1000, fase: "gi", stryk: S.oppsett.stryk, ferdig: false, registrert: false };
    R.statistikk("start", { modus: "sammen", spillere: n });
  }

  // ---------- Screens ----------

  const DATO = new Intl.DateTimeFormat(R.lokale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const datoFor = (nr) => DATO.format(new Date(nr * 86400000 + 12 * 3600000));

  R.start({
    id: "edderkoppen",
    versjon: 1,
    pagar,
    _motor: MOTOR,
    _svar: (r) => svarAv(r).slice(),

    tilstand: () => ({
      modus: "dag",
      antall: 2,
      oppsett: { stryk: true },
      dag: null, // { nr, r, funnet, igjen (ms), ferdig }
      fri: null, // { i, r, funnet, igjen, ferdig }
      sammen: null, // { i, r, spillere, tur, funnet: [[]], igjen, fase ("gi" | "spill"), stryk, ferdig, registrert }
      stat: tomStat(),
      fritt: { spilt: 0, best: 0, sist: null },
    }),

    lastet(S) {
      const okGang = (sp) =>
        sp && typeof sp.r === "string" && bokstaver(sp.r).length === N && Array.isArray(sp.funnet) && sp.funnet.length <= 400 && sp.funnet.every((o) => typeof o === "string") && Number.isFinite(sp.igjen);
      if (!okGang(S.dag) || !Number.isInteger(S.dag.nr)) S.dag = null;
      if (!okGang(S.fri)) S.fri = null;
      const g = S.sammen;
      if (
        !(
          g &&
          typeof g.r === "string" &&
          bokstaver(g.r).length === N &&
          Array.isArray(g.spillere) &&
          g.spillere.length >= 2 &&
          g.spillere.length <= 8 &&
          Array.isArray(g.funnet) &&
          g.funnet.length === g.spillere.length &&
          g.funnet.every((l) => Array.isArray(l) && l.every((o) => typeof o === "string")) &&
          Number.isInteger(g.tur) &&
          g.tur >= 0 &&
          g.tur <= g.spillere.length &&
          Number.isFinite(g.igjen)
        )
      )
        S.sammen = null;
      for (const sp of [S.dag, S.fri]) {
        if (!sp) continue;
        const svar = svarAv(sp.r);
        sp.funnet = sp.funnet.filter((o, i, a) => svar.includes(o) && a.indexOf(o) === i);
        sp.igjen = R.klamp(sp.igjen, 0, TID * 1000);
        sp.ferdig = !!sp.ferdig || sp.igjen <= 0;
      }
      if (S.sammen) {
        const sp = S.sammen;
        sp.igjen = R.klamp(sp.igjen, 0, TID * 1000);
        if (sp.tur >= sp.spillere.length) sp.ferdig = true;
        if (sp.fase !== "spill") sp.fase = "gi";
        if (sp.fase === "spill" && sp.igjen <= 0) sp.fase = "gi";
      }
      if (!["dag", "fri", "sammen"].includes(S.modus)) S.modus = "dag";
      S.oppsett = Object.assign({ stryk: true }, S.oppsett);
      S.oppsett.stryk = S.oppsett.stryk !== false;
      const st = S.stat && typeof S.stat === "object" ? S.stat : {};
      S.stat = {
        spilt: tall(st.spilt),
        maal: tall(st.maal),
        rekke: tall(st.rekke),
        best: tall(st.best),
        toppPoeng: tall(st.toppPoeng),
        sistMaal: Number.isInteger(st.sistMaal) ? st.sistMaal : null,
        sistSpilt: Number.isInteger(st.sistSpilt) ? st.sistSpilt : null,
      };
      const fr = S.fritt && typeof S.fritt === "object" ? S.fritt : {};
      S.fritt = { spilt: tall(fr.spilt), best: tall(fr.best), sist: Number.isInteger(fr.sist) && fr.sist >= 0 ? fr.sist : null };
      // A finished day that was never counted, and the front page kept in step.
      if (S.dag && S.dag.ferdig) registrerDag(S);
      const sp = aktiv(S);
      if (S.modus === "sammen") {
        // A player's go survives a reload (with the time that was left); otherwise the hand-over screen.
        if (S.skjerm === "resultat" || (S.skjerm === "brett" && !(sp && !sp.ferdig && sp.fase === "spill"))) S.skjerm = !sp ? "hjem" : sp.ferdig ? "kaaring" : "gi";
      } else {
        if (["brett", "resultat"].includes(S.skjerm) && !sp) S.skjerm = "hjem";
        if (S.skjerm === "brett" && sp && ferdig(sp)) S.skjerm = "resultat";
      }
      if (["gi", "kaaring"].includes(S.skjerm) && !S.sammen) S.skjerm = "hjem";
      if (S.skjerm === "gi" && S.sammen && S.sammen.ferdig) S.skjerm = "kaaring";
      if (S.skjerm === "kaaring" && S.sammen && !S.sammen.ferdig) S.skjerm = "gi";
    },

    regler: {
      intro: R.t("Finn så mange ord du kan i de seksten bokstavene før tre minutter er gått."),
      steg: [
        [R.t("Spinn et ord"), R.t("Dra fingeren over bokstavene, eller trykk på dem én etter én. Hver ny bokstav må ligge ved siden av den forrige – bortover, opp, ned eller på skrå.")],
        [R.t("Én gang per ord"), R.t("En rute kan bare brukes én gang i hvert ord. Ordet må ha minst tre bokstaver.")],
        [R.t("Samle poeng"), R.t("Tre og fire bokstaver gir 1 poeng, fem gir 2, seks gir 3, sju gir 5 og åtte eller flere gir 11.")],
      ],
      tips: [
        R.t("Bøyde former teller også, som flertall og fortid."),
        R.t("Har du tastatur, kan du bare skrive ordet og trykke Enter – Edderkoppen finner veien selv."),
        R.t("Dagens rutenett er det samme for alle. Målet er en femtedel av poengene i rutenettet."),
        R.t("Sammen: Alle får det samme rutenettet etter tur. Ord som flere har funnet, strykes – bare dine egne ord gir poeng."),
        R.t("Klokka står stille hvis du går ut av appen eller åpner reglene."),
        R.t("Ordlista bygger på Norsk ordbank – bokmål 2005 fra Språkbanken ved Nasjonalbiblioteket (CC BY 4.0). Stygge, grove og svært sjeldne ord er tatt ut."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = S.dag && S.dag.nr === iDag() ? S.dag : null;
          const ferdigIDag = !!(d && d.ferdig);
          const dagKnapp = ferdigIDag
            ? R.ui.knapp(R.t("Se dagens resultat"), "se-resultat")
            : R.ui.knapp(d && d.igjen < TID * 1000 ? R.t("Fortsett dagens rutenett · {tid}", { tid: klokkeTekst(d.igjen) }) : R.t("Dagens rutenett"), "dag", { variant: d && d.igjen < TID * 1000 ? "" : "stor" });
          const friIGang = S.fri && !S.fri.ferdig && S.fri.igjen < TID * 1000;
          const grIGang = S.sammen && !S.sammen.ferdig;
          const rekke = rekkeNa(S);
          const sist =
            S.fritt.sist != null
              ? `<p class="ed-sist">${esc(R.t("Fritt spill: sist {sist} p · rekord {best} p", { sist: S.fritt.sist, best: S.fritt.best }))}</p>`
              : "";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Seksten bokstaver. Tre minutter."))}<br><em>${esc(R.t("Spinn ord fra nabo til nabo."))}</em>`,
            knapperHtml:
              dagKnapp +
              R.ui.knapp2(friIGang ? R.t("Fortsett fritt spill · {tid}", { tid: klokkeTekst(S.fri.igjen) }) : R.t("Fritt spill"), "fri") +
              R.ui.knapp2(grIGang ? R.t("Fortsett sammen") : R.t("Spill sammen"), "sammen") +
              sist +
              R.ui.lenkerad(R.ui.lenke(R.t("Statistikk"), "statistikk"), R.ui.lenke(R.t("Slik spiller du"), "regler")),
            merker: [["4 × 4", R.t("bokstaver")], ["3:00", R.t("på klokka")], rekke ? [`🔥 ${rekke}`, rekke === 1 ? R.t("dag på rad") : R.t("dager på rad")] : ["1–8", R.t("spillere")]],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Spill sammen"),
        tilbake: "hjem",
        vis(S) {
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.spillere({ min: 2, max: 8, hjelp: R.t("Alle får det samme rutenettet, tre minutter hver. Send mobilen videre mellom rundene.") })}
            <section class="seksjon">
              ${R.ui.bryter("stryk", S.oppsett.stryk, R.t("Like ord strykes"), R.t("Et ord som flere har funnet, gir ingen poeng."))}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start-sammen", { variant: "stor", ikon: "🕸️" }))}`;
        },
      },

      gi: {
        tittel: R.t("Spill sammen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.sammen;
          const hvem = sp.spillere[sp.tur];
          return R.ui.giTil({ i: hvem, h: "klar", knapp: R.t("Jeg er {navn} – start klokka", { navn: R.navn(hvem) }), advarsel: R.t("De andre ser bort"), prikker: [sp.spillere.length, sp.tur] });
        },
        inn: () => R.slippVaken(),
      },

      brett: {
        tittel: (S) => (S.modus === "dag" && S.dag ? R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(S.dag.nr) }) : S.modus === "sammen" && S.sammen ? R.navn(S.sammen.spillere[S.sammen.tur]) : R.t("Fritt spill")),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const av = !kanSpille(S);
          const tittel = S.modus === "dag" ? R.t("Dagens rutenett") : S.modus === "sammen" ? R.t("{navn} sin tur", { navn: R.navn(sp.spillere[sp.tur]) }) : R.t("Fritt spill");
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(tittel)}</h1>
            ${infoHtml(S, sp)}
            <div class="ed-ordfelt">
              <p class="ed-ord" aria-live="off">${ordfeltHtml(sp)}</p>
              <p class="ed-hjelp">${hjelpHtml()}</p>
            </div>
            ${ruteHtml(sp, av)}
            ${R.ui.dokk(knapperHtml(av), R.ui.lenkerad(R.ui.lenke(R.t("Stopp klokka"), "stopp")))}`;
        },
        inn(S) {
          valg = [];
          skrevet = "";
          melding = null;
          const sp = aktiv(S);
          if (!sp || ferdig(sp)) return R.gaTil("hjem");
          R.holdVaken();
          startKlokke();
        },
        ut() {
          stoppKlokke();
          valg = [];
          skrevet = "";
          melding = null;
          clearTimeout(meldingId);
          meldingId = null;
          R.lagre();
        },
      },

      resultat: {
        tittel: (S) => (S.modus === "dag" && S.dag ? R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(S.dag.nr) }) : R.t("Fritt spill")),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const inf = info(sp.r, sp.funnet);
          const dag = S.modus === "dag";
          const gammel = dag && sp.nr !== iDag();
          const tittel = dag ? (inf.p >= inf.maal ? R.t("Du nådde dagens mål!") : R.t("Du fant {n} ord", { n: sp.funnet.length })) : inf.stjerner >= 2 ? R.t("Godt jobba!") : R.t("Du fant {n} ord", { n: sp.funnet.length });
          const banner = R.ui.banner({
            etikett: dag ? `${datoFor(sp.nr)}${inf.stjerner ? " · " + "★".repeat(inf.stjerner) : ""}` : `${R.t("Fritt spill")}${inf.stjerner ? " · " + "★".repeat(inf.stjerner) : ""}`,
            tittel,
            tekst: `${R.t("{n} poeng", { n: inf.p })} · ${R.t("{n} av {av} ord", { n: sp.funnet.length, av: inf.svar.length })}${dag ? ` · ${R.t("mål {n}", { n: inf.maal })}` : ""}`,
            klasse: "ed-banner",
            stemning: inf.stjerner >= 1 ? "jubel" : sp.funnet.length >= 5 ? "" : "lei",
          });
          const lengst = inf.svar.slice().sort((a, b) => bokstaver(b).length - bokstaver(a).length)[0];
          const ordSeksjon = `<section class="seksjon ed-ordene" aria-labelledby="ed-ordene-tittel">
              <div class="seksjon-hode"><h2 id="ed-ordene-tittel">${esc(R.t("Alle ordene"))}</h2><span class="tall">${esc(R.t("{n} av {av}", { n: sp.funnet.length, av: inf.svar.length }))}</span></div>
              ${miniHtml(sp.r)}
              ${lengst ? `<p class="hjelp">${esc(R.t("Lengste ord: {ord}", { ord: stor(lengst) }))}</p>` : ""}
              ${ordlisteHtml(inf.svar, { funnet: sp.funnet })}
            </section>`;
          if (!dag) {
            return `${banner}
              ${S.fritt.best ? `<p class="ed-sist">${esc(R.t("Rekord i fritt spill: {n} p", { n: S.fritt.best }))}</p>` : ""}
              ${ordSeksjon}
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "fri-ny", { ikon: "🕸️" }), R.ui.lenkerad(R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
          }
          return `${banner}
            ${ordSeksjon}
            <section class="seksjon ed-stat" aria-labelledby="ed-stat-tittel">
              <h2 id="ed-stat-tittel">${esc(R.t("Statistikk"))}</h2>
              ${tallHtml(S)}
            </section>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(
              gammel ? R.ui.knapp(R.t("Spill dagens rutenett"), "dag") : R.ui.knapp(R.t("Del resultatet"), "del"),
              R.ui.lenkerad(R.ui.lenke(R.t("Fritt spill"), "fri-ny"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
            )}`;
        },
        inn(S) {
          R.slippVaken();
          if (!nyFeiring) return;
          nyFeiring = false;
          const sp = aktiv(S);
          const inf = info(sp.r, sp.funnet);
          const fortsatt = R.vakt();
          if (inf.stjerner >= 1) {
            R.lyd.fanfare();
            if (!R.rolig()) R.konfetti();
          } else R.lyd.pling();
          if (S.modus === "dag") setTimeout(() => fortsatt() && R.visInstallTips(), 3000);
        },
      },

      kaaring: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.sammen;
          const ut = sp.stryk ? stroket(sp.funnet) : new Set();
          const p = gruppePoeng(sp.funnet, sp.stryk);
          const rader = sp.spillere.map((i, k) => ({ i, poeng: p[k] }));
          const topp = Math.max(...p);
          const vinnere = topp > 0 ? sp.spillere.filter((i, k) => p[k] === topp) : [];
          const tittel = !vinnere.length ? R.t("Ingen poeng denne gangen") : vinnere.length === 1 ? R.t("{navn} vinner!", { navn: R.navn(vinnere[0]) }) : R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((i) => R.navn(i))), n: vinnere.length });
          const per = sp.spillere
            .map(
              (i, k) => `<details class="ed-spiller">
                <summary>${R.avatar(i)}<b>${esc(R.navn(i))}</b><span>${esc(R.t("{n} ord", { n: sp.funnet[k].length }))} · ${esc(R.t("{n} p", { n: p[k] }))}</span></summary>
                ${ordlisteHtml(sp.funnet[k], { stroket: ut, tom: R.t("Ingen ord.") })}
              </details>`,
            )
            .join("");
          const svar = svarAv(sp.r);
          const ingen = svar.filter((w) => !sp.funnet.some((l) => l.includes(w)));
          return `
            ${R.ui.banner({ tittel, etikett: sp.stryk ? R.t("Like ord er strøket") : R.t("Alle ord teller"), tekst: R.t("{n} ord i rutenettet", { n: svar.length }), stemning: vinnere.length ? "jubel" : "" })}
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            <section class="seksjon" aria-labelledby="ed-hver-tittel"><h2 id="ed-hver-tittel">${esc(R.t("Hva fant dere?"))}</h2>${miniHtml(sp.r)}${per}
              <details class="ed-spiller"><summary><b>${esc(R.t("Ord ingen fant"))}</b><span>${esc(R.t("{n} ord", { n: ingen.length }))}</span></summary>${ordlisteHtml(ingen, { tom: R.t("Dere fant alt!") })}</details>
            </section>
            ${R.ui.flereSpill({ antall: sp.spillere.length })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen-sammen", { ikon: "🕸️" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del-sammen"), R.ui.lenke(R.t("Endre oppsett"), "oppsett"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.sammen;
          R.slippVaken();
          if (!sp || sp.registrert) return;
          sp.registrert = true;
          const p = gruppePoeng(sp.funnet, sp.stryk);
          R.kveld.registrer(sp.spillere.map((i, k) => ({ i, poeng: p[k] })));
          R.lagre();
          if (Math.max(...p) > 0) {
            R.lyd.fanfare();
            if (!R.rolig()) R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    // rusj.no/edderkoppen/#dagens: today's grid, or its result when it is done.
    vedHash(S, hash) {
      if (hash !== "dagens") return null;
      if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
      S.modus = "dag";
      return S.dag.ferdig ? "resultat" : "brett";
    },


    handlinger: (H = {
      dag(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
        S.modus = "dag";
        R.gaTil(S.dag.ferdig ? "resultat" : "brett");
      },
      "se-resultat"(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag() || !S.dag.ferdig) return H.dag(el, e, S);
        S.modus = "dag";
        R.gaTil("resultat");
      },
      fri(el, e, S) {
        if (!S.fri || S.fri.ferdig) nyttFritt(S);
        S.modus = "fri";
        R.gaTil("brett");
      },
      "fri-ny"(el, e, S) {
        nyttFritt(S);
        S.modus = "fri";
        R.gaTil("brett");
      },
      async sammen(el, e, S) {
        if (S.sammen && !S.sammen.ferdig) {
          S.modus = "sammen";
          return R.gaTil(S.sammen.fase === "spill" ? "brett" : "gi");
        }
        R.gaTil("oppsett");
      },
      oppsett(el, e, S) {
        R.gaTil("oppsett");
      },
      stryk(el, e, S) {
        S.oppsett.stryk = !S.oppsett.stryk;
        R.vis();
      },
      async "start-sammen"(el, e, S) {
        const fortsatt = R.vakt();
        if (S.sammen && !S.sammen.ferdig && !(await R.bekreftNytt(true)) && fortsatt()) return;
        if (!fortsatt()) return;
        nyttSammen(S);
        S.modus = "sammen";
        R.gaTil("gi");
      },
      "igjen-sammen"(el, e, S) {
        nyttSammen(S);
        S.modus = "sammen";
        R.gaTil("gi");
      },
      klar(el, e, S) {
        const sp = S.sammen;
        if (!sp || sp.ferdig) return R.gaTil("hjem");
        sp.fase = "spill";
        sp.igjen = TID * 1000;
        S.modus = "sammen";
        R.lyd.snu();
        R.gaTil("brett");
      },
      hjem() {
        R.gaTil("hjem");
      },
      send(el, e, S) {
        send(S);
      },
      slett(el, e, S) {
        slett(S);
      },
      stopp(el, e, S) {
        avsluttTidlig(S);
      },
      ordene(el, e, S) {
        R.ark(ordArk(S));
      },
      statistikk(el, e, S) {
        R.ark(statistikkArk(S));
      },
      del(el, e, S) {
        if (S.dag && S.dag.ferdig) return R.del(NAVN, delTekst(S), DEL_URL + "#utfordring", { kort: delKort(S) });
      },
      "del-sammen"(el, e, S) {
        const sp = S.sammen;
        if (!sp || !sp.ferdig) return;
        const p = gruppePoeng(sp.funnet, sp.stryk);
        const rekke = sp.spillere.map((i, k) => [R.navn(i), p[k]]).sort((a, b) => b[1] - a[1]);
        const linjer = rekke.map(([n, x]) => `${n}: ${R.t("{n} p", { n: x })}`);
        R.del(NAVN, `${NAVN}\n${linjer.join("\n")}\n`, DEL_URL, { kort: { tittel: NAVN, linjer: linjer.slice(0, 8) } });
      },
    }),
  });
})();
