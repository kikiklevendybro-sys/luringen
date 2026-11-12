/* Bedreviteren (until November 2026 «Besserwisseren») — a party quiz on one phone.
   The quizmaster reads the question and four options aloud and everyone answers. «Vis svaret»
   lights up the right option with a short fun fact; then (when playing for points) the next step
   asks who – or which team – got it right. Harder questions give more points, and the last
   scoring can be undone. Playing alone? Tap your answer directly.
   «Dagens fem»: five questions a day, the same on every phone, answered alone. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;
  const ID = "bedreviteren";

  // The game was called «Besserwisseren» (id besserwisseren). Carry this phone's saved quiz, used
  // questions, records and evening scoreboard over once, before anything reads them.
  (function flyttFraGammeltNavn() {
    const GML = "besserwisseren";
    for (const del of ["v1", "brukt.sporsmal", "rekord"]) {
      const v = R.les(`${GML}.${del}`, null);
      if (v == null) continue;
      if (R.les(`${ID}.${del}`, null) == null) {
        // Old records were per round length only; they count as «blandet» (the default level).
        let ny = v;
        if (del === "rekord" && v && typeof v === "object") {
          ny = {};
          for (const [k, n] of Object.entries(v)) ny[/^\d+$/.test(k) ? `blandet.${k}` : k] = n;
        }
        R.skriv(`${ID}.${del}`, ny);
      }
      R.fjern(`${GML}.${del}`);
    }
    const kveld = R.les("kveld", null);
    if (kveld && Array.isArray(kveld.spill) && kveld.spill.some((s) => s && s.id === GML)) {
      kveld.spill.forEach((s) => s && s.id === GML && (s.id = ID));
      R.skriv("kveld", kveld);
    }
  })();

  const KATEGORIER = D.kategorier;
  const kategori = (id) => KATEGORIER.find((k) => k.id === id);
  // Every question in one list (files in name order), so the deck can remember what was asked.
  const ALLE = [];
  Object.keys(D)
    .filter((n) => n.startsWith("sporsmal-"))
    .sort()
    .forEach((n) => D[n].forEach((q) => ALLE.push(q)));
  const stokk = R.kortstokk("sporsmal", ALLE.length);

  const BOKSTAVER = ["A", "B", "C", "D"];
  const NIVA = { 1: R.t("Lett"), 2: R.t("Middels"), 3: R.t("Vanskelig") };
  const NIVA_ORD = { blandet: R.t("blandet"), 1: R.t("lett"), 2: R.t("middels"), 3: R.t("vanskelig") }; // mid-sentence: «rekord på middels»
  const MODUSER = ["spillere", "lag", "fri"];
  const NIVAER = ["blandet", "1", "2", "3"];
  const LENGDER = [10, 15, 20];
  const SEKUNDER = 20;
  const KORT_SVAR = 18; // options this short fit two by two on low screens
  const STANDARD_KAT = KATEGORIER.filter((k) => k.id !== "barn").map((k) => k.id);
  let H; // the actions, so one action can reuse another
  let opptatt = false; // a reveal animation is running

  const antallI = (kat) => ALLE.filter((q) => kat.includes(q.k)).length;
  const stjerner = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const poengTekst = (n) => R.flertall(n, "poeng", "poeng");
  const lagNavn = (i) => R.lagNavn(i);
  const deltakerNavn = (sp, i) => (sp.modus === "lag" ? lagNavn(i) : R.navn(i));
  const erSolo = (sp) => sp.modus === "spillere" && sp.deltakere === 1;
  const girPoeng = (sp) => sp.modus !== "fri" && !erSolo(sp); // the quizmaster hands out points
  const naa = (sp) => ALLE[sp.liste[sp.nr]];
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  // "A", "A og B", "A, B og C"
  const oppramsing = (navn) => R.ramsOpp(navn);

  // "1814" or "5 dager": options that are numbers with the same unit are shown in rising order;
  // all other options are shuffled so the right answer can be anywhere.
  // English writes 1,000 and 2.5, Danish 1.000 and 2,5: read them as the Norwegian 1 000 and 2,5.
  const TALLFORM = {
    en: (s) => s.replace(/(\d),(?=\d{3}(?!\d))/g, "$1 ").replace(/(\d)\.(?=\d)/g, "$1,"),
    da: (s) => s.replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1 "),
  };
  function somTall(t) {
    const s = String(t).trim();
    const m = /^(-?\d[\d\s ]*(?:,\d+)?)(.*)$/.exec(TALLFORM[R.sprak] ? TALLFORM[R.sprak](s) : s);
    return m ? { v: Number(m[1].replace(/[\s ]/g, "").replace(",", ".")), enhet: m[2].trim() } : null;
  }
  function rekkefolge(q, tilfeldig) {
    const tall = q.a.map(somTall);
    const idx = [0, 1, 2, 3];
    if (tall.every((t) => t && !Number.isNaN(t.v) && t.enhet === tall[0].enhet)) return idx.sort((x, y) => tall[x].v - tall[y].v);
    return R.stokk(idx, tilfeldig);
  }

  // Pick the questions for a round. "Blandet" goes from easy to hard (about 30/40/30 %).
  function lagRunde(o) {
    const valgt = new Set(o.kategorier);
    const n = o.lengde;
    const plan = Array.from({ length: n }, (_, i) =>
      o.niva === "blandet" ? (i < Math.round(n * 0.3) ? 1 : i < Math.round(n * 0.7) ? 2 : 3) : Number(o.niva),
    );
    const brukt = new Set();
    const liste = [];
    for (const niva of plan) {
      let i = stokk.neste((x) => !brukt.has(x) && valgt.has(ALLE[x].k) && ALLE[x].n === niva);
      if (i < 0 || brukt.has(i)) i = stokk.neste((x) => !brukt.has(x) && valgt.has(ALLE[x].k));
      if (i < 0 || brukt.has(i)) break;
      brukt.add(i);
      liste.push(i);
    }
    return liste;
  }

  function nyttSpill(S) {
    const o = S.oppsett;
    const liste = lagRunde(o);
    if (!liste.length) return false;
    const deltakere = o.modus === "spillere" ? R.klamp(S.antall || 1, 1, 20) : o.modus === "lag" ? o.lag : 0;
    S.spill = {
      modus: o.modus,
      niva: o.niva,
      deltakere,
      klokke: !!o.klokke,
      liste,
      rekke: liste.map((i) => rekkefolge(ALLE[i])),
      nr: 0,
      fase: "sporsmal", // sporsmal → svar → (hvem, when points are given) → next question
      riktige: [],
      valgt: null,
      poeng: Array(deltakere).fill(0),
      treff: Array(deltakere).fill(0),
      logg: [],
      angre: null,
      ferdig: false,
    };
    return true;
  }

  function rader(sp) {
    return Array.from({ length: sp.deltakere }, (_, i) => (sp.modus === "lag" ? { lag: i, poeng: sp.poeng[i] } : { i, poeng: sp.poeng[i] }));
  }

  // ---------- Tie-break ----------
  // Equal top scores after the last question: the leaders get one more question (a hard one if
  // there is one left); only they can score on it. Still equal after three: a shared win.
  const MAKS_UTSLAG = 3;
  function delteLedere(sp) {
    if (!girPoeng(sp)) return [];
    const topp = Math.max(...sp.poeng);
    const like = sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0);
    return topp > 0 && like.length > 1 ? like : [];
  }
  function leggTilUtslag(sp, o) {
    const valgt = new Set((o && o.kategorier) || []);
    const ny = (x) => !sp.liste.includes(x);
    let i = stokk.neste((x) => ny(x) && valgt.has(ALLE[x].k) && ALLE[x].n === 3);
    if (i < 0 || !ny(i)) i = stokk.neste((x) => ny(x) && valgt.has(ALLE[x].k));
    if (i < 0 || !ny(i)) i = stokk.neste(ny);
    if (i < 0 || !ny(i)) return false;
    sp.liste.push(i);
    sp.rekke.push(rekkefolge(ALLE[i]));
    return true;
  }
  const erUtslag = (sp) => !!(sp.utslag && sp.utslagNr && sp.nr >= sp.liste.length - sp.utslagNr);

  // ---------- «Dagens fem»: five questions a day, the same on every phone ----------
  // Every question except the children's ones, by level (each level shuffled once with a fixed
  // seed), cut into five columns of SYKLUS questions. Day j of a cycle takes question j of every
  // column, so a day goes from easy to hard and each question is used once per cycle. In cycle c
  // column s is shifted c·s days, so the same five never meet again and a question comes back after
  // SYKLUS − 4 days at the earliest. (New questions in the data reshuffle the days to come.)
  const DAGENS_START = 20768; // 11 November 2026 = «Dagens fem nr. 1»
  const DAGENS_ANTALL = 5;
  // The edition's own address (rusj.no/en/<slug>/ in English).
  const DAGENS_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/bedreviteren/" }).href;
  const DAGENS_REKKE = (() => {
    const tilfeldig = R.rng(DAGENS_START);
    const niva = (n) => ALLE.map((q, i) => i).filter((i) => ALLE[i].n === n && ALLE[i].k !== "barn");
    return [].concat(...[1, 2, 3].map((n) => R.stokk(niva(n), tilfeldig)));
  })();
  const SYKLUS = Math.floor(DAGENS_REKKE.length / DAGENS_ANTALL);
  function dagensSporsmal(nr) {
    const k = Math.max(0, nr - DAGENS_START);
    const c = Math.floor(k / SYKLUS);
    const j = k % SYKLUS;
    return Array.from({ length: DAGENS_ANTALL }, (_, s) => DAGENS_REKKE[s * SYKLUS + ((j + c * s) % SYKLUS)]);
  }
  const iDag = () => R.dag().nr;
  const dagensNr = (nr) => nr - DAGENS_START + 1;

  // Its own save slot (never part of a party quiz): { dag: today's round, stat: the streak }.
  const DAGENS_NOKKEL = ID + ".dagens";
  function lesDagens() {
    const v = R.les(DAGENS_NOKKEL, null) || {};
    const st = v.stat && typeof v.stat === "object" ? v.stat : {};
    const stat = { rekke: Math.max(0, Math.floor(Number(st.rekke)) || 0), sistVunnet: Number.isInteger(st.sistVunnet) ? st.sistVunnet : null, spilt: Math.max(0, Math.floor(Number(st.spilt)) || 0) };
    const d = v.dag;
    const ok =
      d &&
      Number.isInteger(d.nr) &&
      Array.isArray(d.liste) &&
      d.liste.length === DAGENS_ANTALL &&
      d.liste.every((i) => ALLE[i]) &&
      Array.isArray(d.rekke) &&
      d.rekke.length === DAGENS_ANTALL &&
      Array.isArray(d.svar) &&
      d.svar.length <= DAGENS_ANTALL &&
      d.svar.every((s) => s && typeof s.ok === "boolean") &&
      Number.isInteger(d.i) &&
      d.i >= 0 &&
      d.i < DAGENS_ANTALL;
    return { dag: ok ? d : null, stat };
  }
  const DG = lesDagens();
  const lagreDagens = () => R.skriv(DAGENS_NOKKEL, DG);
  // Today's round (made when it is first needed; yesterday's unfinished one gives way).
  function sikreDagens() {
    const nr = iDag();
    if (DG.dag && DG.dag.nr === nr) return DG.dag;
    const liste = dagensSporsmal(nr);
    const tilfeldig = R.rng(nr * 7 + 3); // the options in the same order on every phone
    DG.dag = { nr, liste, rekke: liste.map((i) => rekkefolge(ALLE[i], tilfeldig)), i: 0, svar: [], ferdig: false };
    lagreDagens();
    return DG.dag;
  }
  const dagensIDag = () => (DG.dag && DG.dag.nr === iDag() ? DG.dag : null);
  const dagensRiktige = (d) => d.svar.filter((s) => s.ok).length;
  const dagensVunnet = (d) => dagensRiktige(d) >= 3;
  const dagensRes = (d) => `${dagensRiktige(d)}/${DAGENS_ANTALL}`;
  // The streak shown today: days in a row with at least 3 right, broken once a whole day has passed.
  const rekkeNa = () => (DG.stat.sistVunnet != null && DG.stat.sistVunnet >= iDag() - 1 ? DG.stat.rekke : 0);
  const rekkeTekst = (n) => "🔥 " + R.t("{n} dag på rad|{n} dager på rad", { n });
  function meldDagens(d) {
    if (d.nr !== iDag()) return;
    if (d.ferdig) R.dagligFerdig({ vunnet: dagensVunnet(d), rekke: dagensVunnet(d) ? DG.stat.rekke : 0, res: dagensRes(d) });
    else if (d.svar.length) R.dagligIGang({ tekst: `${d.svar.length}/${DAGENS_ANTALL}` });
  }
  function fullforDagens(d) {
    if (d.ferdig) return;
    d.ferdig = true;
    const st = DG.stat;
    if (dagensVunnet(d)) {
      st.rekke = st.sistVunnet === d.nr - 1 ? st.rekke + 1 : st.sistVunnet === d.nr ? st.rekke : 1;
      st.sistVunnet = d.nr;
    } else st.rekke = 0;
    st.spilt += 1;
    lagreDagens();
    meldDagens(d);
    R.statistikk("ferdig", { modus: "dagens", riktige: dagensRiktige(d) });
  }
  // Shared text: the number, the score and the dots – never a question or an answer.
  const delTekst = (d) => `${R.t("Bedreviteren · Dagens fem nr. {nr}", { nr: dagensNr(d.nr) })} · ${dagensRes(d)} ${d.svar.map((s) => (s.ok ? "🟢" : "🔴")).join("")}`;

  // Countdown to the next round (midnight in the edition's time zone; 23 or 25 hours the nights the clocks change).
  function sekunderTilNeste() {
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
  const klokkeslett = (s) => `${to(Math.floor(s / 3600))}:${to(Math.floor((s % 3600) / 60))}:${to(s % 60)}`;
  const nedtellingHtml = () => `<p class="bw-nedtelling">${esc(R.t("Nye spørsmål om"))} <b>${klokkeslett(sekunderTilNeste())}</b></p>`;
  let tikker = null;
  function startNedtelling() {
    clearInterval(tikker);
    const dag = iDag();
    tikker = setInterval(() => {
      const el = R.$(".bw-nedtelling b");
      if (!el) return clearInterval(tikker);
      if (iDag() !== dag) {
        clearInterval(tikker);
        return R.S.skjerm === "dagensSlutt" ? R.gaTil("hjem") : R.vis(); // a new round is ready
      }
      el.textContent = klokkeslett(sekunderTilNeste());
    }, 1000);
    R.vedForlat(() => clearInterval(tikker));
  }

  // ---------- The clock (optional, 20 s per question) ----------

  function klokkeHtml() {
    return `<button class="bw-klokke" id="bw-klokke" data-h="timer-veksle" data-v="bw-klokke" data-stille aria-label="${esc(R.t("Klokke, {n} sekunder. Trykk for pause.", { n: SEKUNDER }))}">
      <span class="timer-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="spor" cx="60" cy="60" r="54"/><circle class="fyll" cx="60" cy="60" r="54"/></svg><span class="bw-tid">${SEKUNDER}</span></span>
    </button>`;
  }
  function startKlokke(S) {
    const sp = S.spill;
    if (!sp || !sp.klokke || sp.fase !== "sporsmal") return;
    new R.Timer({
      id: "bw-klokke",
      sekunder: SEKUNDER,
      vedTikk(sek) {
        const tid = R.$("#bw-klokke .bw-tid");
        if (tid) tid.textContent = String(sek);
      },
      vedSlutt() {
        const tid = R.$("#bw-klokke .bw-tid");
        if (tid) tid.textContent = "0";
        // Time is up: the answer is shown (alone: the question counts as unanswered).
        R.toast(R.t("Tiden er ute!"));
        H.vis(null, null, R.S);
      },
    }).start();
  }

  // ---------- Pieces of the question screen ----------

  function statusHtml(sp) {
    const ferdige = sp.nr + (sp.fase === "sporsmal" ? 0 : 1);
    return `<div class="bw-status">
      <div class="bw-fremdrift" role="progressbar" aria-label="${esc(R.t("Fremdrift"))}" aria-valuemin="0" aria-valuemax="${sp.liste.length}" aria-valuenow="${ferdige}"><i style="--andel: ${Math.round((ferdige / sp.liste.length) * 100)}%"></i></div>
      ${sp.fase === "sporsmal" && kanAngre(sp) ? `<button class="bw-angre" data-h="angre" aria-label="${esc(R.t("Angre poengene fra forrige spørsmål"))}"><span aria-hidden="true">↩</span> ${esc(R.t("Angre"))}</button>` : ""}
      ${sp.klokke && sp.fase === "sporsmal" ? klokkeHtml() : ""}
    </div>`;
  }

  function kortHtml(sp, q) {
    const kat = kategori(q.k) || { navn: q.k, ikon: "❓" };
    const lang = q.s.length > 95 ? " lang" : "";
    return `<article class="bw-kort${sp.fase === "sporsmal" ? "" : " avslort"}">
      <div class="bw-kort-topp">
        <span class="bw-kat" style="--kf: ${esc(kat.farge || "var(--aksent)")}" title="${esc(kat.navn)}"><span aria-hidden="true">${kat.ikon}</span> ${esc(kat.kort || kat.navn)}</span>
        <span class="bw-niva"><span class="vh">${NIVA[q.n]}, ${poengTekst(q.n)}</span><span class="bw-niva-ord" aria-hidden="true">${NIVA[q.n]}</span><span class="stjerner" aria-hidden="true">${stjerner(q.n)}</span></span>
      </div>
      <h1 class="bw-sporsmal${lang}" id="skjerm-tittel">${esc(q.s)}</h1>
    </article>`;
  }

  function valgHtml(sp, q, h = "svar") {
    const svar = sp.fase !== "sporsmal";
    const trykkbar = !svar && erSolo(sp);
    const kort = q.a.every((a) => a.length <= KORT_SVAR) ? " kort-svar" : "";
    return `<ol class="bw-valgliste${kort}${svar ? " avslort" : ""}" aria-label="${esc(R.t("Svaralternativer"))}">${sp.rekke[sp.nr]
      .map((ai, vis) => {
        let klasse = `bw-valg v${vis}`;
        let merke = "";
        if (svar) {
          if (ai === q.r) {
            klasse += " riktig";
            merke = `<span class="bw-merke" aria-hidden="true">✓</span><span class="vh"> – ${esc(R.t("riktig svar"))}</span>`;
          } else if (sp.valgt === vis) {
            klasse += " feil";
            merke = `<span class="bw-merke" aria-hidden="true">✗</span><span class="vh"> – ${esc(R.t("ditt svar"))}</span>`;
          } else klasse += " dempet";
        }
        const indre = `<span class="bw-bokstav" aria-hidden="true">${BOKSTAVER[vis]}</span><span class="bw-tekst"><span class="vh">${BOKSTAVER[vis]}: </span>${esc(q.a[ai])}</span>${merke}`;
        return `<li>${trykkbar ? `<button class="${klasse}" data-h="${h}" data-v="${vis}">${indre}</button>` : `<div class="${klasse}">${indre}</div>`}</li>`;
      })
      .join("")}</ol>`;
  }

  const faktaHtml = (q) =>
    `<aside class="bw-fakta" aria-label="${esc(R.t("Visste du?"))}"><p class="etikett"><span aria-hidden="true">💡</span> ${esc(R.t("Visste du?"))}</p><p>${esc(q.fakta)}</p></aside>`;

  function soloHtml(sp, q) {
    if (sp.riktige.includes(0)) return `<p class="bw-dom riktig" role="status"><span class="bw-dom-ord">${esc(R.t("Riktig!"))}</span> <span>+${poengTekst(q.n)}</span></p>`;
    if (sp.valgt == null) return `<p class="bw-dom" role="status"><span class="bw-dom-ord">${esc(R.t("Fasit"))}</span> <span>${esc(R.t("Ingen poeng denne gangen"))}</span></p>`;
    return `<p class="bw-dom feil" role="status"><span class="bw-dom-ord">${esc(R.t("Feil"))}</span> <span>${esc(R.t("Riktig svar er {bokstav}", { bokstav: BOKSTAVER[sp.rekke[sp.nr].indexOf(q.r)] }))}</span></p>`;
  }

  const kanAngre = (sp) => !!(sp.angre && girPoeng(sp) && sp.angre.riktige.length);
  const angreLenke = (sp) => (kanAngre(sp) ? R.ui.lenke(R.t("Angre poengene"), "angre") : "");

  // Step 3 (points): the right answer in short, then who got it.
  function hvemSkjerm(sp, q) {
    const riktigVis = sp.rekke[sp.nr].indexOf(q.r);
    const lag = sp.modus === "lag";
    const hvem = erUtslag(sp) ? sp.utslag : Array.from({ length: sp.deltakere }, (_, i) => i);
    const knapper = hvem.map((i) => {
      const merke = lag ? `<span class="avatar" style="--pf: ${R.LAG[i].farge}" aria-hidden="true"></span>` : R.avatar(i);
      return `<button class="velger bw-hvem" data-h="riktig" data-v="${i}" aria-pressed="${sp.riktige.includes(i)}">${merke}<span>${esc(deltakerNavn(sp, i))}</span></button>`;
    }).join("");
    const siste = sp.nr + 1 >= sp.liste.length;
    return `
      ${statusHtml(sp)}
      <div class="bw-fasitlinje">
        <span class="bw-bokstav" aria-hidden="true">${BOKSTAVER[riktigVis]}</span>
        <p><span class="etikett">${esc(R.t("Riktig svar"))}</span><b>${esc(q.a[q.r])}</b></p>
        <button class="lenke" data-h="tilbakeSvar">${esc(R.t("Se igjen"))}</button>
      </div>
      <section class="seksjon bw-hvem-seksjon">
        <div class="seksjon-hode"><h1 id="skjerm-tittel">${esc(lag ? R.t("Hvilke lag hadde rett?") : R.t("Hvem hadde rett?"))}</h1><span class="tall">+${poengTekst(q.n)}</span></div>
        <div class="velgere">${knapper}</div>
        <p class="hjelp">${esc(R.t("Trykk på alle som hadde rett – eller gå rett videre."))}</p>
      </section>
      ${R.ui.dokk(
        R.ui.knapp(siste ? R.t("Se kåringen") : R.t("Neste spørsmål"), "neste", { ikon: siste ? "🏆" : "→" }),
        R.ui.lenkerad(R.ui.lenke(R.t("Stillingen"), "stilling"), R.ui.lenke(R.t("Avslutt"), "avslutt")),
      )}`;
  }

  function sporsmalSkjerm(S) {
    const sp = S.spill;
    const q = naa(sp);
    if (sp.fase === "hvem") return hvemSkjerm(sp, q);
    const siste = sp.nr + 1 >= sp.liste.length;
    let under = "";
    let dokk = "";
    if (sp.fase === "sporsmal") {
      if (erUtslag(sp))
        under = `<p class="hjelp bw-hint"><b>${esc(R.t("Utslagsspørsmål!"))}</b> ${esc(R.t("{navn} har like mange poeng. Bare de kan få poeng nå.", { navn: oppramsing(sp.utslag.map((i) => deltakerNavn(sp, i))) }))}</p>`;
      else if (erSolo(sp)) under = `<p class="hjelp bw-hint">${esc(R.t("Trykk på svaret ditt – eller se fasiten."))}</p>`;
      else if (sp.nr === 0) under = `<p class="hjelp bw-hint">${esc(R.t("Les spørsmålet og de fire svarene høyt. Når alle har svart, trykker du «Vis svaret»."))}</p>`;
      dokk = R.ui.dokk(
        erSolo(sp) ? R.ui.knapp(R.t("Jeg vet ikke – vis svaret"), "vis", { variant: "papir" }) : R.ui.knapp(R.t("Vis svaret"), "vis", { variant: "stor", ikon: "👀" }),
      );
    } else {
      under = (erSolo(sp) ? soloHtml(sp, q) : "") + faktaHtml(q);
      const videre = girPoeng(sp)
        ? R.ui.knapp(R.t("Hvem hadde rett?"), "hvem", { ikon: "✋" })
        : R.ui.knapp(siste ? R.t("Se kåringen") : R.t("Neste spørsmål"), "neste", { ikon: siste ? "🏆" : "→" });
      dokk = R.ui.dokk(videre, `<div class="bw-valgfri">${R.ui.lenkerad(girPoeng(sp) ? R.ui.lenke(R.t("Stillingen"), "stilling") : "", R.ui.lenke(R.t("Avslutt"), "avslutt"))}</div>`);
    }
    return `${statusHtml(sp)}${kortHtml(sp, q)}${valgHtml(sp, q)}${under}${dokk}`;
  }

  // After the reveal everything should be in view without scrolling; on very low screens nudge the
  // fun fact up a little, but never so far that the right answer leaves the screen.
  function visFakta() {
    const fakta = R.$("#skjerm .bw-fakta");
    const riktig = R.$("#skjerm .bw-valg.riktig");
    const dokk = R.$("#skjerm .dokk");
    if (!fakta || !riktig) return;
    // (On a phone on its side the dock is a column beside the content: the screen's bottom is the limit.)
    const grense = (dokk && R.liggende() !== "side" ? dokk.getBoundingClientRect().top + 18 : window.innerHeight) - 6;
    const mangler = fakta.getBoundingClientRect().bottom - grense;
    const rom = riktig.getBoundingClientRect().top - 72;
    const steg = Math.min(mangler, rom);
    if (steg > 4) window.scrollBy({ top: steg, behavior: R.rolig() ? "auto" : "smooth" });
  }

  // ---------- Results ----------

  function vurdering(andel) {
    if (andel >= 1) return R.t("Feilfritt! Du er en ekte bedreviter.");
    if (andel >= 0.8) return R.t("Imponerende! Du vet nesten alt.");
    if (andel >= 0.6) return R.t("Sterkt! Litt bedreviter er du.");
    if (andel >= 0.4) return R.t("Godt jobba – og nå vet du litt mer!");
    return R.t("Det var noen tøffe spørsmål! Nå vet du i alle fall mer enn i stad.");
  }

  function bannerHtml(sp) {
    const antall = sp.logg.length;
    if (sp.modus === "fri")
      return `<div class="banner aksent">${R.figur()}<p class="etikett">${esc(R.t("Quizen er ferdig"))}</p><h1 id="skjerm-tittel">${esc(R.t("Godt jobba!"))}</h1><p class="ingress">${esc(R.t("Dere kom gjennom {n} spørsmål. Nå vet dere mer enn i stad.", { n: antall }))}</p></div>`;
    if (erSolo(sp)) {
      const riktige = sp.treff[0];
      const rek = sp.rekord || {};
      const rekord =
        rek.ny && rek.forrige > 0
          ? `<div class="stempel-sted"><span class="stempel mynte">${esc(R.t("Ny rekord!"))}</span></div>`
          : rek.forrige > 0
            ? `<p class="hjelp">${esc(R.t("Rekorden din på {niva} med {antall} spørsmål: {n} riktige", { niva: NIVA_ORD[sp.niva] || NIVA_ORD.blandet, antall, n: rek.forrige }))}</p>`
            : "";
      const rekke = `<ol class="bw-rekke" aria-label="${esc(R.t("Svarene dine"))}">${sp.logg
        .map((l, n) => `<li class="${l.riktige.length ? "ja" : "nei"}" style="animation-delay: ${n * 70}ms"><span class="vh">${esc(l.riktige.length ? R.t("Spørsmål {n}: riktig", { n: n + 1 }) : R.t("Spørsmål {n}: feil", { n: n + 1 }))}</span></li>`)
        .join("")}</ol>`;
      return `<div class="banner aksent">${R.figur()}<p class="etikett">${esc(R.t("{navn} fikk", { navn: R.navn(0) }))}</p><h1 id="skjerm-tittel">${esc(R.t("{n} av {antall} riktige", { n: riktige, antall }))}</h1><p class="ingress">${esc(vurdering(antall ? riktige / antall : 0))} <b class="bw-sum">${poengTekst(sp.poeng[0])}</b></p>${rekke}</div>${rekord}`;
    }
    const topp = Math.max(...sp.poeng);
    const vinnere = sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0);
    if (topp <= 0)
      return `<div class="banner">${R.figur()}<p class="etikett">${esc(R.t("Kåringen"))}</p><h1 id="skjerm-tittel">${esc(R.t("Ingen poeng i dag"))}</h1><p class="ingress">${esc(R.t("Kanskje en lettere runde neste gang?"))}</p></div>`;
    const navn = vinnere.map((i) => deltakerNavn(sp, i));
    const etikett = vinnere.length > 1 ? R.t("Delt seier!") : sp.modus === "lag" ? R.t("Vinnerlaget") : R.t("Rundens bedreviter");
    const verdier = { poeng: poengTekst(topp), n: sp.treff[vinnere[0]], antall };
    const ingress =
      vinnere.length > 1
        ? R.t("Like mange poeng: {n}.", { n: topp })
        : sp.utslagNr
          ? R.t("{poeng} og {n} av {antall} riktige – avgjort på utslagsspørsmål.", verdier)
          : R.t("{poeng} og {n} av {antall} riktige.", verdier);
    return `<div class="banner aksent">${R.figur()}<p class="etikett">${esc(etikett)}</p><h1 id="skjerm-tittel">${esc(R.t("{navn} vinner!", { navn: oppramsing(navn), n: navn.length }))}</h1><p class="ingress">${esc(ingress)}</p></div>`;
  }

  function fasitHtml(sp) {
    const punkt = sp.logg
      .map((l, n) => {
        const q = ALLE[l.q];
        const hvem = sp.modus === "fri" ? "" : l.riktige.length ? oppramsing(l.riktige.map((i) => deltakerNavn(sp, i))) : R.t("Ingen");
        return `<li><span class="bw-fasit-nr">${n + 1}</span><div><p class="bw-fasit-s">${esc(q.s)}</p><p class="bw-fasit-a">✓ ${esc(q.a[q.r])}</p>${
          hvem ? `<p class="bw-fasit-hvem">${esc(erSolo(sp) ? (l.riktige.length ? R.t("Du hadde rett") : R.t("Bom")) : R.t("Riktig: {navn}", { navn: hvem }))}</p>` : ""
        }</div></li>`;
      })
      .join("");
    return `<h2 id="ark-tittel">${esc(R.t("Fasiten"))}</h2><ol class="bw-fasit">${punkt}</ol><button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }

  // Celebrate in proportion: fanfare + confetti for a winner or a strong solo round.
  function feir(sp) {
    const antall = sp.logg.length || 1;
    const sterk = sp.modus === "fri" ? false : erSolo(sp) ? sp.treff[0] / antall >= 0.6 : sp.poeng.some((p) => p > 0);
    if (sterk) {
      R.lyd.fanfare();
      R.konfetti();
    } else R.lyd.pling();
  }

  // ---------- «Dagens fem»: screens ----------

  // The question card and options of the party quiz, drawn from today's round.
  function dagensVisning(d) {
    const svart = d.svar.length > d.i;
    return { modus: "spillere", deltakere: 1, fase: svart ? "svar" : "sporsmal", liste: d.liste, rekke: d.rekke, nr: d.i, valgt: svart ? d.svar[d.i].v : null, klokke: false, angre: null };
  }

  function dagensSkjerm() {
    const d = sikreDagens();
    if (d.ferdig) return dagensSluttSkjerm();
    const sp = dagensVisning(d);
    const q = naa(sp);
    const siste = d.i + 1 >= DAGENS_ANTALL;
    let under = "";
    let dokk = "";
    if (sp.fase === "sporsmal") {
      if (d.i === 0) under = `<p class="hjelp bw-hint">${esc(R.t("Fem spørsmål, fra lett til vanskelig. Trykk på svaret ditt."))}</p>`;
      dokk = R.ui.dokk(R.ui.knapp(R.t("Jeg vet ikke – vis svaret"), "dvis", { variant: "papir" }));
    } else {
      const s = d.svar[d.i];
      const riktigVis = d.rekke[d.i].indexOf(q.r);
      const dom = s.ok
        ? `<p class="bw-dom riktig" role="status"><span class="bw-dom-ord">${esc(R.t("Riktig!"))}</span></p>`
        : `<p class="bw-dom${s.v == null ? "" : " feil"}" role="status"><span class="bw-dom-ord">${esc(s.v == null ? R.t("Fasit") : R.t("Feil"))}</span> <span>${esc(R.t("Riktig svar er {bokstav}: {svar}", { bokstav: BOKSTAVER[riktigVis], svar: q.a[q.r] }))}</span></p>`;
      under = dom + (q.fakta ? faktaHtml(q) : "");
      dokk = R.ui.dokk(R.ui.knapp(siste ? R.t("Se resultatet") : R.t("Neste spørsmål"), "dneste", { ikon: siste ? "🏁" : "→" }));
    }
    return `${statusHtml(sp)}${kortHtml(sp, q)}${valgHtml(sp, q, "dsvar")}${under}${dokk}`;
  }

  function dagensSluttSkjerm() {
    const d = sikreDagens();
    if (!d.ferdig) return dagensSkjerm();
    const r = dagensRiktige(d);
    const rekke = dagensVunnet(d) ? rekkeNa() : 0;
    const prikker = `<ol class="bw-rekke bw-prikker" aria-label="${esc(R.t("Svarene dine"))}">${d.svar
      .map((s, n) => `<li class="${s.ok ? "ja" : "nei"}" style="animation-delay: ${n * 90}ms"><span aria-hidden="true">${s.ok ? "✓" : "✗"}</span><span class="vh">${esc(s.ok ? R.t("Spørsmål {n}: riktig", { n: n + 1 }) : R.t("Spørsmål {n}: feil", { n: n + 1 }))}</span></li>`)
      .join("")}</ol>`;
    return `
      ${R.ui.banner({
        klasse: "aksent",
        etikett: R.t("Dagens fem nr. {nr}", { nr: dagensNr(d.nr) }),
        tittel: R.t("{n} av {antall} riktige", { n: r, antall: DAGENS_ANTALL }),
        tekst: vurdering(r / DAGENS_ANTALL),
        stemning: r >= 3 ? "jubel" : r <= 1 ? "lei" : "",
      })}
      ${prikker}
      ${rekke ? `<p class="bw-dagens-rekke">${rekkeTekst(rekke)}</p>` : ""}
      ${nedtellingHtml()}
      <div class="stabel">${R.ui.knapp2(R.t("Se fasiten"), "dfasit", { ikon: "📋" })}</div>
      ${R.ui.flereSpill({ antall: 1 })}
      ${R.ui.dokk(R.ui.knapp(R.t("Del resultatet"), "ddel", { ikon: "📤" }), R.ui.lenkerad(R.ui.lenke(R.t("Til Bedreviteren"), "tilbake"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
  }

  function dagensFasit(d) {
    const punkt = d.liste
      .map((qi, n) => {
        const q = ALLE[qi];
        const s = d.svar[n];
        return `<li><span class="bw-fasit-nr">${n + 1}</span><div><p class="bw-fasit-s">${esc(q.s)}</p><p class="bw-fasit-a">✓ ${esc(q.a[q.r])}</p>${
          s ? `<p class="bw-fasit-hvem">${esc(s.ok ? R.t("Du hadde rett") : s.v == null ? R.t("Ikke svart") : R.t("Du svarte: {svar}", { svar: q.a[d.rekke[n][s.v]] }))}</p>` : ""
        }</div></li>`;
      })
      .join("");
    return `<h2 id="ark-tittel">${esc(R.t("Fasiten"))}</h2><ol class="bw-fasit">${punkt}</ol><button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }

  // Answer today's current question (vis = the option's place on screen, null = «Jeg vet ikke»).
  function dagensSvar(vis) {
    const d = dagensIDag();
    if (!d || d.ferdig || d.svar.length > d.i) return;
    const q = ALLE[d.liste[d.i]];
    const riktigVis = d.rekke[d.i].indexOf(q.r);
    const ok = vis === riktigVis;
    if (!d.svar.length) R.statistikk("start", { modus: "dagens" });
    d.svar.push({ v: vis, ok });
    lagreDagens();
    meldDagens(d);
    if (ok) {
      R.lyd.riktig();
      R.vibrer([30, 40, 60]);
    } else if (vis != null) {
      R.lyd.feil();
      R.vibrer(120);
    } else R.lyd.pling();
    R.vis();
    visFakta();
    R.si(`${R.t("Riktig svar: {bokstav}, {svar}.", { bokstav: BOKSTAVER[riktigVis], svar: q.a[q.r] })} ${q.fakta || ""}`);
  }

  // ---------- The game ----------

  R.start({
    id: ID,
    _dagens: { sporsmal: dagensSporsmal, syklus: SYKLUS, start: DAGENS_START, delTekst }, // for test/spill/bedreviteren.e2e.mjs
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also those with the game's own buttons in them
    pagar, // a quiz is in progress until the last question is answered

    tilstand: () => ({
      antall: 3,
      oppsett: { modus: "spillere", lag: 2, kategorier: STANDARD_KAT.slice(), niva: "blandet", lengde: 10, klokke: false },
      spill: null,
    }),

    // Repair saved settings and drop a saved game that no longer fits the questions.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "spillere", lag: 2, kategorier: STANDARD_KAT.slice(), niva: "blandet", lengde: 10, klokke: false }, S.oppsett || {}));
      if (!MODUSER.includes(o.modus)) o.modus = "spillere";
      o.lag = R.klamp(Number(o.lag) || 2, 2, 4);
      o.kategorier = (Array.isArray(o.kategorier) ? o.kategorier : []).filter((id) => kategori(id));
      if (!NIVAER.includes(String(o.niva))) o.niva = "blandet";
      o.niva = String(o.niva);
      if (!LENGDER.includes(Number(o.lengde))) o.lengde = 10;
      o.lengde = Number(o.lengde);
      o.klokke = !!o.klokke;
      const sp = S.spill;
      const ok =
        sp &&
        Array.isArray(sp.liste) &&
        sp.liste.length &&
        sp.liste.every((i) => ALLE[i]) &&
        Array.isArray(sp.rekke) &&
        sp.rekke.length === sp.liste.length &&
        Number.isInteger(sp.nr) &&
        sp.nr >= 0 &&
        sp.nr < sp.liste.length &&
        ["sporsmal", "svar", "hvem"].includes(sp.fase) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === sp.deltakere &&
        Array.isArray(sp.treff) &&
        Array.isArray(sp.riktige) &&
        Array.isArray(sp.logg);
      if (!ok) S.spill = null;
      // Today's «Dagens fem» tells the front page again on every load (the kit keeps it idempotent).
      const d = dagensIDag();
      if (d) meldDagens(d);
    },

    // rusj.no/bedreviteren/#dagens (the front page's «I dag»): today's round, or its result.
    vedHash(S, hash) {
      if (hash !== "dagens") return null;
      return sikreDagens().ferdig ? "dagensSlutt" : "dagens";
    },

    regler: {
      intro: R.t("En quiz for hele gjengen på én mobil. Fire svar – bare ett er riktig."),
      steg: [
        [R.t("Les høyt"), R.t("Den som holder mobilen, leser spørsmålet og de fire svarene høyt.")],
        [R.t("Alle svarer"), R.t("Rop ut, skriv på en lapp – eller hold opp 1–4 fingrer for A–D samtidig.")],
        [R.t("Vis svaret"), R.t("Trykk «Vis svaret», les faktabiten og trykk på alle som hadde rett.")],
      ],
      tips: [
        R.t("Stjernene viser hvor vanskelig spørsmålet er: ★ gir 1 poeng, ★★ gir 2 og ★★★ gir 3."),
        R.t("Spiller du alene? Velg én spiller, så trykker du rett på svaret ditt."),
        R.t("Den som leser, kan godt være med – svaret vises ikke før dere trykker."),
        R.t("Trykket feil? «Angre» øverst på neste spørsmål tar poengene tilbake."),
        R.t("«Blandet» starter lett og blir vanskeligere mot slutten."),
        R.t("Dagens fem: fem nye spørsmål hver dag, de samme for alle. Når du deler resultatet, røper du ikke svarene."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) => {
          const sp = S.spill;
          // «Dagens fem» is the main button until today's round is done (a running party quiz
          // keeps «Fortsett» on top); then its score, the streak and the time to the next one.
          const d = dagensIDag();
          const rekke = rekkeNa();
          const dagensForst = !pagar(S) && !(d && d.ferdig);
          const knapp = dagensForst ? R.ui.knapp : R.ui.knapp2;
          const dagens =
            d && d.ferdig
              ? R.ui.knapp2(`✓ ${R.t("{n} av {alle}", { n: dagensRiktige(d), alle: DAGENS_ANTALL })}${rekke ? " · " + rekkeTekst(rekke) : ""}`, "dagens") + nedtellingHtml()
              : d && d.svar.length
                ? knapp(`${R.t("Fortsett dagens fem")} · ${d.svar.length}/${DAGENS_ANTALL}`, "dagens")
                : knapp(R.t("Dagens fem"), "dagens", { variant: dagensForst ? "stor" : "", ikon: "📅" });
          const ekstra = (sp && sp.ferdig ? R.ui.knapp2(R.t("Se kåringen"), "resultat") : "") + R.ui.lenke(R.t("Slik spiller du"), "regler");
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Fire svar. Bare ett er riktig."))}<br><em>${esc(R.t("Hvem er den største bedreviteren?"))}</em>`,
            knapperHtml: dagensForst
              ? dagens + R.ui.knapp2(R.t("Start quiz"), "nytt") + ekstra
              : R.ui.startKnapper({
                  pagar: pagar(S),
                  fortsettTekst: sp ? R.t("Fortsett · spørsmål {n} av {antall}", { n: sp.nr + 1, antall: sp.liste.length }) : "",
                  startTekst: R.t("Start quiz"),
                }) +
                dagens +
                ekstra,
            merker: [
              ["1–20", R.t("spillere")],
              [String(ALLE.length), R.t("spørsmål")],
              ["0", R.t("reklame")],
            ],
          });
        },
        inn() {
          const d = dagensIDag();
          if (d && d.ferdig) startNedtelling();
        },
      },

      oppsett: {
        tittel: R.t("Ny quiz"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          let deltakere = "";
          if (o.modus === "spillere")
            deltakere = R.ui.spillere({ min: 1, max: 20, hjelp: S.antall === 1 ? R.t("Alene? Da trykker du rett på svaret ditt.") : R.t("Én spiller? Da trykker du rett på svaret.") });
          else if (o.modus === "lag")
            deltakere = `<section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvor mange lag?"))}</h2></div>
              ${R.ui.teller("lag", o.lag, 2, 4, { enhet: R.t("lag"), minus: R.t("Færre lag"), pluss: R.t("Flere lag") })}
              <div class="bw-lagrad">${Array.from({ length: o.lag }, (_, i) => R.ui.lagmerke(i)).join("")}</div>
            </section>`;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hvordan spiller dere?"))}</h2></div>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "spillere", ikon: "🙋", tittel: R.t("Hver for seg"), tekst: R.t("Alle mot alle – eller alene") },
                  { v: "lag", ikon: "👥", tittel: R.t("Lag mot lag"), tekst: R.t("2–4 lag samler poeng") },
                  { v: "fri", ikon: "💡", tittel: R.t("Uten poeng"), tekst: R.t("Bare spørsmål, svar og fakta") },
                ],
                o.modus,
              )}
            </section>
            ${deltakere}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Kategorier"))}</h2><span class="tall">${esc(R.t("{n} spørsmål", { n: antallI(o.kategorier) }))}</span></div>
              ${R.ui.brikker("kategori", KATEGORIER.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon })), o.kategorier, { alle: true, etikett: R.t("Kategorier") })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Vanskelighet"))}</h2></div>
              ${R.ui.seg("niva", [["blandet", R.t("Blandet")], ["1", R.t("Lett")], ["2", R.t("Middels")], ["3", R.t("Vanskelig")]], o.niva, { etikett: R.t("Vanskelighet") })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Antall spørsmål"))}</h2></div>
              ${R.ui.seg("lengde", LENGDER.map((n) => [n, String(n)]), o.lengde, { etikett: R.t("Antall spørsmål") })}
            </section>
            ${R.ui.bryter("klokke", o.klokke, R.t("Klokke på {n} s", { n: SEKUNDER }), R.t("Klokka tikker de siste sekundene. Trykk på den for pause."))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.kategorier.length, ikon: "🎓" }), o.kategorier.length ? "" : `<p class="hjelp">${esc(R.t("Velg minst én kategori."))}</p>`)}`;
        },
      },

      sporsmal: {
        // Short title on narrow phones, so it isn't cut off between the buttons.
        tittel: (S) =>
          erUtslag(S.spill) ? R.t("Utslag") : window.innerWidth < 380 ? `${S.spill.nr + 1}/${S.spill.liste.length}` : R.t("Spørsmål {n} av {antall}", { n: S.spill.nr + 1, antall: S.spill.liste.length }),
        tilbake: "hjem",
        vis: sporsmalSkjerm,
        inn(S) {
          R.holdVaken();
          startKlokke(S);
        },
      },

      dagens: {
        tittel: () => `${R.t("Dagens fem")} · ${Math.min((dagensIDag() || sikreDagens()).i + 1, DAGENS_ANTALL)}/${DAGENS_ANTALL}`,
        tilbake: "hjem",
        vis: dagensSkjerm,
      },

      dagensSlutt: {
        tittel: R.t("Dagens fem"), // the banner below says which number
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis: dagensSluttSkjerm,
        inn() {
          const d = sikreDagens();
          if (d.ferdig) startNedtelling();
          if (!d.ferdig || d.feiret) return;
          // Celebrate once, in proportion.
          d.feiret = true;
          lagreDagens();
          const r = dagensRiktige(d);
          if (r >= 4) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (r >= 3) R.lyd.riktig();
          else R.lyd.pling();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const flere = girPoeng(sp);
          return `
            ${bannerHtml(sp)}
            ${flere ? R.ui.pall(rader(sp)) + R.ui.poengliste(rader(sp)) : ""}
            <div class="stabel">${R.ui.knapp2(R.t("Se fasiten"), "fasit", { ikon: "📋" })}</div>
            ${R.ui.flereSpill(sp.modus === "spillere" ? { antall: sp.deltakere } : {})}
            ${R.ui.dokk(
              R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🔁" }),
              R.ui.lenkerad(angreLenke(sp), R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
            )}`;
        },
        inn(S) {
          R.slippVaken();
          feir(S.spill);
        },
      },
    },

    handlinger: (H = {
      dagens() {
        const d = sikreDagens();
        R.gaTil(d.ferdig ? "dagensSlutt" : "dagens");
      },
      dsvar(el) {
        dagensSvar(Number(el.dataset.v));
      },
      dvis() {
        dagensSvar(null);
      },
      dneste() {
        const d = dagensIDag();
        if (!d) return R.gaTil("hjem");
        if (d.ferdig || d.svar.length <= d.i) return;
        if (d.i + 1 >= DAGENS_ANTALL) {
          fullforDagens(d);
          R.gaTil("dagensSlutt");
          return;
        }
        d.i += 1;
        lagreDagens();
        R.gaTil("dagens");
      },
      ddel() {
        const d = dagensIDag();
        if (d && d.ferdig)
          R.del(R.t("Bedreviteren"), delTekst(d), DAGENS_URL + "#utfordring", {
            kort: { tittel: R.t("Dagens fem nr. {nr}", { nr: dagensNr(d.nr) }), linjer: [R.t("{res} riktige", { res: dagensRes(d) }), d.svar.map((s) => (s.ok ? "🟢" : "🔴")).join("")] },
          });
      },
      dfasit() {
        const d = dagensIDag();
        if (d && d.ferdig) R.ark(dagensFasit(d));
      },
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        R.stoppTimere();
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      fortsett: () => R.gaTil("sporsmal"),
      resultat: () => R.gaTil("slutt"),
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      lag(el, e, S) {
        S.oppsett.lag = R.klamp(S.oppsett.lag + Number(el.dataset.v), 2, 4);
        R.vis();
      },
      kategori(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.kategorier;
        if (id === "*") S.oppsett.kategorier = liste.length === KATEGORIER.length ? [] : KATEGORIER.map((k) => k.id);
        else S.oppsett.kategorier = liste.includes(id) ? liste.filter((x) => x !== id) : KATEGORIER.map((k) => k.id).filter((x) => x === id || liste.includes(x));
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      lengde(el, e, S) {
        S.oppsett.lengde = Number(el.dataset.v);
        R.vis();
      },
      klokke(el, e, S) {
        S.oppsett.klokke = !S.oppsett.klokke;
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.kategorier.length) return;
        if (!nyttSpill(S)) {
          R.toast(R.t("Fant ingen spørsmål – velg flere kategorier"));
          return;
        }
        R.statistikk("start", { modus: S.spill.modus, sporsmal: S.spill.liste.length });
        if (S.spill.liste.length < S.oppsett.lengde) R.toast(R.t("Bare {n} spørsmål passet – kjør på!", { n: S.spill.liste.length }));
        R.lyd.pop();
        R.gaTil("sporsmal");
      },
      // Solo: the player taps their answer.
      svar(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "sporsmal" || !erSolo(sp) || opptatt) return;
        sp.valgt = Number(el.dataset.v);
        H.vis(el, e, S);
      },
      async vis(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "sporsmal" || opptatt) return;
        opptatt = true;
        R.stoppTimere();
        const q = naa(sp);
        const liste = R.$("#skjerm .bw-valgliste");
        const fortsatt = R.vakt();
        if (liste && !R.rolig()) {
          liste.classList.add("bw-spenning");
          R.lyd.trommevirvel(0.55);
          await R.vent(600);
        }
        opptatt = false;
        if (!fortsatt() || R.S.spill !== sp || sp.fase !== "sporsmal") return;
        sp.fase = "svar";
        sp.angre = null; // the previous scoring is settled once the next answer is shown
        const riktigVis = sp.rekke[sp.nr].indexOf(q.r);
        if (erSolo(sp)) {
          sp.riktige = sp.valgt === riktigVis ? [0] : [];
          if (sp.valgt === riktigVis) {
            R.lyd.riktig();
            R.vibrer([30, 40, 60]);
          } else if (sp.valgt != null) {
            R.lyd.feil();
            R.vibrer(120);
          } else R.lyd.pling();
        } else {
          R.lyd.pling();
          R.vibrer(30);
        }
        R.vis();
        visFakta();
        R.si(`${R.t("Riktig svar: {bokstav}, {svar}.", { bokstav: BOKSTAVER[riktigVis], svar: q.a[q.r] })} ${q.fakta}`);
      },
      hvem(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "svar" || !girPoeng(sp)) return;
        sp.fase = "hvem";
        R.vis();
        window.scrollTo(0, 0);
        const h = R.$("#skjerm-tittel");
        if (h) {
          h.setAttribute("tabindex", "-1");
          h.focus({ preventScroll: true });
        }
      },
      tilbakeSvar(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "hvem") return;
        sp.fase = "svar";
        R.vis();
        window.scrollTo(0, 0);
      },
      riktig(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "hvem") return;
        const i = Number(el.dataset.v);
        sp.riktige = sp.riktige.includes(i) ? sp.riktige.filter((x) => x !== i) : [...sp.riktige, i].sort((a, b) => a - b);
        if (sp.riktige.includes(i)) R.lyd.pop();
        R.vis();
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || (sp.fase !== "hvem" && !(sp.fase === "svar" && !girPoeng(sp)))) return;
        const q = naa(sp);
        // Remember the scores before this question, so the scoring can be undone («Angre»).
        sp.angre = { nr: sp.nr, riktige: sp.riktige.slice(), valgt: sp.valgt, poeng: sp.poeng.slice(), treff: sp.treff.slice(), lengde: sp.liste.length, utslag: sp.utslag || null };
        if (sp.modus !== "fri") {
          for (const i of sp.riktige) {
            sp.poeng[i] += q.n;
            sp.treff[i] += 1;
          }
          if (sp.riktige.length && girPoeng(sp) && sp.nr + 1 < sp.liste.length)
            R.toast(R.t("+{poeng} til {navn}", { poeng: poengTekst(q.n), navn: oppramsing(sp.riktige.map((i) => deltakerNavn(sp, i))) }));
        }
        sp.logg.push({ q: sp.liste[sp.nr], riktige: sp.riktige.slice(), valgt: sp.valgt });
        if (sp.nr + 1 >= sp.liste.length) {
          // A shared lead after the last question: one tie-break question for the leaders (up to three).
          const like = delteLedere(sp);
          if (like.length > 1 && (sp.utslagNr || 0) < MAKS_UTSLAG && leggTilUtslag(sp, S.oppsett)) {
            sp.utslag = like;
            sp.utslagNr = (sp.utslagNr || 0) + 1;
            R.toast(R.t("Uavgjort! {navn} får et utslagsspørsmål", { navn: oppramsing(like.map((i) => deltakerNavn(sp, i))) }));
          } else {
            sp.ferdig = true;
            if (erSolo(sp)) {
              // Personal best per level and round length, on this device only.
              const rekorder = R.les(ID + ".rekord", {}) || {};
              const nokkel = `${sp.niva || "blandet"}.${sp.liste.length}`;
              const forrige = Number(rekorder[nokkel]) || 0;
              sp.rekord = { forrige, ny: sp.treff[0] > forrige };
              if (sp.rekord.ny) R.skriv(ID + ".rekord", Object.assign({}, rekorder, { [nokkel]: sp.treff[0] }));
            }
            // «Kveldens gjeng» on the front page: once per finished quiz with points.
            if (girPoeng(sp) && !sp.kveld) {
              sp.kveld = true;
              R.kveld.registrer(rader(sp));
            }
            R.statistikk("ferdig", { modus: sp.modus, sporsmal: sp.logg.length });
            R.gaTil("slutt");
            return;
          }
        }
        sp.nr += 1;
        sp.fase = "sporsmal";
        sp.riktige = [];
        sp.valgt = null;
        R.gaTil("sporsmal");
      },
      // Undo the last scoring: back to «Hvem hadde rett?» for that question, with the taps kept.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || !girPoeng(sp)) return;
        sp.poeng = a.poeng;
        sp.treff = a.treff;
        sp.logg.pop();
        if (a.lengde && sp.liste.length > a.lengde) {
          // Undoing the scoring that led to a tie-break question takes that question away again.
          sp.liste.length = a.lengde;
          sp.rekke.length = a.lengde;
          sp.utslagNr = Math.max(0, (sp.utslagNr || 1) - 1);
        }
        sp.utslag = a.utslag || null;
        sp.nr = a.nr;
        sp.fase = "hvem";
        sp.riktige = a.riktige;
        sp.valgt = a.valgt;
        sp.ferdig = false;
        sp.angre = null;
        R.toast(R.t("Poengene er tatt tilbake"));
        R.gaTil("sporsmal");
      },
      stilling(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.ark(
          `<h2 id="ark-tittel">${esc(R.t("Stillingen"))}</h2><p class="ingress">${esc(R.t("Etter {n} av {antall} spørsmål", { n: sp.logg.length, antall: sp.liste.length }))}</p>${R.ui.poengliste(rader(sp))}<button class="knapp" data-h="lukk-ark">${esc(R.t("Tilbake til quizen"))}</button>`,
        );
      },
      fasit(el, e, S) {
        if (S.spill) R.ark(fasitHtml(S.spill));
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft(R.t("Avslutte quizen?"), R.t("Poengene blir borte, men dere kan alltid starte en ny."), R.t("Avslutt"), R.t("Fortsett"))) && fortsatt()) {
          R.stoppTimere();
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
