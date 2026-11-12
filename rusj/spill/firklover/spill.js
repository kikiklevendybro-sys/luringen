/* Firkløveren — «Dagens kløver»: sixteen words, four groups of four. Pick four words that belong
   together and press «Prøv». A right group locks in as a paper strip with its theme; a wrong guess
   costs one of the clover's four leaves («Én unna!» when three of the four are right). The groups
   have four levels, shown by rusj's own colours AND a small clover with one to four leaves (so it
   never rests on colour alone): lett = mynte, middels = himmel, vrien = lampe, vriest = rosa.
   Everyone in the edition's country gets the same puzzle each day (R.dag); older puzzles can be
   played as practice. The English and Danish editions have their own puzzles (data.en/, data.da/).
   The share text is hearts in the level colours, never the words.
   The engine at the top has no kit and no data of its own, so test/firklover.test.mjs can load
   this file in node:vm (window.Firklover) and test the grading. */
(function () {
  "use strict";

  // ---------- Engine (pure) ----------

  // R.t before the kit is there (the unit test loads this file without it): the Norwegian key.
  const Rt = { t: (s, v) => (typeof window !== "undefined" && window.Rusj && window.Rusj.t ? window.Rusj.t(s, v) : String(s).replace(/\{(\w+)\}/g, (h, k) => (v && k in v ? String(v[k]) : h))) };

  // FROZEN: «Firkløveren nr. 1» is 1 November 2026 (data/klovere.json «dagens»[0]); the day numbers are
  // R.dag()'s (days since 1.1.1970 of the Oslo date).
  const FORSTE = Math.floor(Date.UTC(2026, 10, 1) / 86400000);
  const NIVA = ["lett", "middels", "vrien", "vriest"];
  const FARGE = ["mynte", "himmel", "lampe", "rosa"];
  const HJERTE = ["💚", "💙", "💛", "💗"]; // the share text: one heart per word, in its group's colour
  const MAKS_FEIL = 4;

  const indeksFor = (nr, antall) => ((((nr - FORSTE) % antall) + antall) % antall);
  const nrFor = (nr) => nr - FORSTE + 1;
  const gruppeAv = (i) => Math.floor(i / 4);

  // A small seeded generator of our own (mulberry32), so the day's starting order never changes
  // with the kit.
  function rng(fro) {
    let a = fro >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stokk(liste, tilfeldig) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(tilfeldig() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // The day's first order of the sixteen words (index i = word i % 4 of group i / 4). The same on
  // every phone, and no group starts on one row.
  function startRekkefolge(nr) {
    const r = rng(nr * 2654435761);
    for (let forsok = 0; forsok < 50; forsok++) {
      const o = stokk([...Array(16).keys()], r);
      let ok = true;
      for (let rad = 0; rad < 4 && ok; rad++) if (new Set(o.slice(rad * 4, rad * 4 + 4).map(gruppeAv)).size === 1) ok = false;
      if (ok) return o;
    }
    return [...Array(16).keys()];
  }

  const nokkel = (gjett) => gjett.slice().sort((a, b) => a - b).join(",");
  const gyldigGjett = (g) => Array.isArray(g) && g.length === 4 && g.every((i) => Number.isInteger(i) && i >= 0 && i < 16) && new Set(g).size === 4;

  // One guess: the group if all four belong to it, and whether three of four do («Én unna!»).
  function vurder(gjett) {
    const telling = [0, 0, 0, 0];
    for (const i of gjett) telling[gruppeAv(i)] += 1;
    const maks = Math.max(...telling);
    return { gruppe: maks === 4 ? telling.indexOf(4) : -1, enUnna: maks === 3 };
  }

  // Everything else follows from the guesses.
  function status(forsok) {
    const funnet = [];
    let feil = 0;
    for (const g of forsok) {
      if (funnet.length === 4 || feil >= MAKS_FEIL) break;
      const v = vurder(g);
      if (v.gruppe >= 0 && !funnet.includes(v.gruppe)) funnet.push(v.gruppe);
      else if (v.gruppe < 0) feil += 1;
    }
    const vunnet = funnet.length === 4;
    return { funnet, feil, vunnet, ferdig: vunnet || feil >= MAKS_FEIL };
  }

  // «Perfekt», «2 feil» or «Ikke løst» — the result as the player would say it (≤ 14 characters).
  const resTekst = (st) => (!st.ferdig ? Rt.t("{n} av 4", { n: st.funnet.length }) : !st.vunnet ? Rt.t("Ikke løst") : st.feil ? Rt.t("{n} feil", { n: st.feil }) : Rt.t("Perfekt"));
  // The guesses as rows of hearts (never the words).
  const delRader = (forsok) => forsok.map((g) => g.map((i) => HJERTE[gruppeAv(i)]).join(""));

  const normaliser = (ord) =>
    String(ord)
      .normalize("NFC")
      .toLocaleLowerCase("nb")
      .normalize("NFD")
      .replace(/(?![̊̈])[̀-ͯ]/g, "")
      .normalize("NFC")
      .replace(/[^a-zæøå0-9]/g, "");

  // What is wrong with one puzzle (an empty list when it is fine). Used by the unit test.
  function sjekkKlover(k) {
    const feil = [];
    if (!Array.isArray(k) || k.length !== 4) return ["må ha fire grupper"]; // sprak-ok (the unit test's own words)
    const alle = [];
    k.forEach((g, n) => {
      if (!g || typeof g.t !== "string" || !g.t.trim()) feil.push(`gruppe ${n + 1} mangler tema`);
      else if (g.t.length > 40) feil.push(`temaet «${g.t}» er for langt`); // sprak-ok
      if (!g || !Array.isArray(g.o) || g.o.length !== 4) return feil.push(`gruppe ${n + 1} må ha fire ord`); // sprak-ok
      for (const o of g.o) {
        if (typeof o !== "string" || !o.trim() || o.trim() !== o) feil.push(`tomt eller utrimmet ord i gruppe ${n + 1}`); // sprak-ok
        else if (/\s/.test(o)) feil.push(`«${o}» har mellomrom`); // sprak-ok
        else if (Array.from(o).length > 12) feil.push(`«${o}» er for langt`); // sprak-ok
        alle.push(normaliser(o));
      }
    });
    const sett = new Set(alle);
    if (alle.length === 16 && sett.size !== 16) feil.push(`ord går igjen: ${alle.filter((o, i) => alle.indexOf(o) !== i).join(", ")}`); // sprak-ok
    return feil;
  }

  const MOTOR = { FORSTE, NIVA, HJERTE, MAKS_FEIL, indeksFor, nrFor, gruppeAv, startRekkefolge, nokkel, gyldigGjett, vurder, status, resTekst, delRader, normaliser, sjekkKlover };

  const R = window.Rusj;
  if (!R) {
    window.Firklover = MOTOR;
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const D = window.RUSJ_DATA;
  const KLOVERE = D.klovere.dagens;
  const N = KLOVERE.length;
  // The game's name and address in this edition (the share text, titles and links).
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "firklover") + "/";
  const ROS = [R.t("Perfekt!"), R.t("Strålende!"), R.t("Godt jobba!"), R.t("Puh, det holdt!")];
  const NAVN = (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Firkløveren"; // sprak-ok
  // The four levels by name (lett, middels, vrien, vriest).
  const NIVANAVN = [R.t("lett"), R.t("middels"), R.t("vrien"), R.t("vriest")];

  let H; // the actions
  let opptatt = false; // an answer is being shown: taps wait
  let melding = null; // { tekst, klasse } shown in the helper line for a short while
  let meldingId = null;
  let nyttBlad = -1; // the leaf that just fell (animated once)
  let nyStripe = -1; // the group that just locked in (animated once)
  let nyFeiring = false;
  let tikker = null;

  const iDag = () => R.dag().nr;
  const klover = (nr) => KLOVERE[indeksFor(nr, N)];
  const ordAv = (sp, i) => klover(sp.nr)[gruppeAv(i)].o[i % 4];
  const aktiv = (S) => (S.modus === "ov" ? S.ov : S.dag);
  const iGang = (sp) => !!(sp && !status(sp.forsok).ferdig && (sp.forsok.length || sp.valgt.length));
  const dagenIGang = (S) => iGang(S.dag) && S.dag.nr === iDag();
  const pagar = (S) => dagenIGang(S) || iGang(S.ov);

  const nyttSpill = (nr) => ({ nr, rekkefolge: startRekkefolge(nr), valgt: [], forsok: [] });
  function nyttDagspill(S) {
    S.dag = nyttSpill(iDag());
    R.statistikk("start", { modus: "dag" });
  }

  // Older puzzles: the days before today, newest first (at most one round of the list, so none repeats).
  function eldre() {
    const d = iDag();
    const liste = [];
    for (let nr = d - 1; nr >= Math.max(FORSTE, d - N + 1); nr--) liste.push(nr);
    return liste;
  }

  // ---------- Statistics ----------

  const tall = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
  const tomStat = () => ({ spilt: 0, vunnet: 0, perfekt: 0, rekke: 0, best: 0, sistVunnet: null, sistSpilt: null });

  function registrerDag(S, sp) {
    const st = S.stat;
    const s = status(sp.forsok);
    if (st.sistSpilt === sp.nr) return;
    st.sistSpilt = sp.nr;
    st.spilt += 1;
    if (s.vunnet) {
      st.vunnet += 1;
      if (!s.feil) st.perfekt += 1;
      st.rekke = st.sistVunnet === sp.nr - 1 ? st.rekke + 1 : 1;
      st.sistVunnet = sp.nr;
      st.best = Math.max(st.best, st.rekke);
    } else st.rekke = 0;
    if (sp.nr === iDag()) R.dagligFerdig({ vunnet: s.vunnet, rekke: st.rekke, res: resTekst(s) });
  }
  // The streak shown today: broken once a whole day has passed without a solved clover.
  const rekkeNa = (S) => (S.stat.sistVunnet != null && S.stat.sistVunnet >= iDag() - 1 ? S.stat.rekke : 0);

  // ---------- Countdown to the next clover (midnight in the edition's country) ----------

  function sekunderTilNy() {
    const na = Date.now();
    const deler = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: R.tidssone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(na))
      .forEach((p) => (deler[p.type] = Number(p.value)));
    let igjen = 86400 - ((deler.hour % 24) * 3600 + deler.minute * 60 + deler.second);
    const dag = R.dag(new Date(na)).nr;
    // The two nights a year the clocks change, the day is 23 or 25 hours long.
    if (R.dag(new Date(na + igjen * 1000)).nr === dag) igjen += 3600;
    else if (igjen > 3600 && R.dag(new Date(na + (igjen - 3600) * 1000)).nr !== dag) igjen -= 3600;
    return Math.max(1, igjen);
  }
  const to = (n) => String(n).padStart(2, "0");
  const klokke = (s) => `${to(Math.floor(s / 3600))}:${to(Math.floor((s % 3600) / 60))}:${to(s % 60)}`;
  const nedtellingHtml = () => `<p class="fk-nedtelling">${esc(R.t("Ny kløver om"))} <b>${klokke(sekunderTilNy())}</b></p>`;

  function startNedtelling() {
    clearInterval(tikker);
    const dag = iDag();
    tikker = setInterval(() => {
      const el = R.$(".fk-nedtelling b");
      if (!el) return clearInterval(tikker);
      if (iDag() !== dag) {
        clearInterval(tikker);
        return R.vis(); // a new clover is ready
      }
      el.textContent = klokke(sekunderTilNy());
    }, 1000);
    R.vedForlat(() => clearInterval(tikker));
  }

  // ---------- Drawings ----------

  // One heart-shaped leaf, its point at the centre (0,0), pointing up before it is turned.
  const BLAD = "M0 -2 C-3 -10 -21 -14 -20 -28 C-19 -38 -6 -40 0 -31 C6 -40 19 -38 20 -28 C21 -14 3 -10 0 -2Z";
  const VINKLER = [-45, 45, 135, 225];

  // The level mark: a clover with as many leaves filled as the level (1–4), the rest as outlines.
  function nivaIkon(n, klasse) {
    return `<svg class="fk-niva ${klasse || ""}" viewBox="-44 -44 88 88" aria-hidden="true" focusable="false">${VINKLER.map(
      (v, i) => `<path d="${BLAD}" transform="rotate(${v})" class="${i < n ? "fylt" : "tom"}"/>`,
    ).join("")}</svg>`;
  }

  // The mistakes left: the clover's four leaves; a lost leaf stays as a dashed outline.
  function kloverHtml(feil) {
    const igjen = MAKS_FEIL - feil;
    return `<span class="fk-klover" role="img" aria-label="${esc(R.t("{feil} igjen", { feil: R.flertall(igjen, "feil", "feil") }))}">
      <svg viewBox="-50 -50 100 112" aria-hidden="true" focusable="false">
        <path class="stilk" d="M2 4 C8 26 18 40 30 54"/>
        ${VINKLER.map((v, i) => {
          const borte = i >= igjen;
          return `<g transform="rotate(${v})"><path d="${BLAD}" class="blad${borte ? " borte" : ""}${borte && i === nyttBlad ? " faller" : ""}"/></g>`;
        }).join("")}
        <circle r="5" class="midt"/>
      </svg>
    </span>`;
  }

  // ---------- Markup ----------

  const stor = (o) => String(o).toLocaleUpperCase("nb");
  const ordListe = (ord) => R.ramsOpp(ord);
  // Longer words get a smaller size (the tile's container query scales it).
  const lengde = (o) => Math.min(10, Math.max(5, Array.from(o).length));

  function stripeHtml(sp, g, o = {}) {
    const k = klover(sp.nr)[g];
    const n = g + 1;
    const etikett = R.t("{gruppe}, {niva}: {tema}. {ord}.", { gruppe: o.avslort ? R.t("Gruppe") : R.t("Riktig gruppe"), niva: NIVANAVN[g], tema: k.t, ord: ordListe(k.o) });
    return `<div class="fk-stripe fk-${FARGE[g]}${o.ny ? " ny" : ""}${o.avslort ? " avslort" : ""}" role="group" aria-label="${esc(etikett)}">
      ${nivaIkon(n)}
      <span class="fk-stripe-tekst"><b>${esc(k.t)}</b><span>${esc(k.o.join(" · "))}</span></span>
    </div>`;
  }

  function brettHtml(S, sp) {
    const st = status(sp.forsok);
    const avslort = st.ferdig && !st.vunnet ? [0, 1, 2, 3].filter((g) => !st.funnet.includes(g)) : [];
    const striper = st.funnet.map((g) => stripeHtml(sp, g, { ny: g === nyStripe })).join("") + avslort.map((g) => stripeHtml(sp, g, { avslort: true })).join("");
    const igjen = sp.rekkefolge.filter((i) => !st.funnet.includes(gruppeAv(i)) && !avslort.includes(gruppeAv(i)));
    const ruter = igjen
      .map((i) => {
        const o = ordAv(sp, i);
        const valgt = sp.valgt.includes(i);
        return `<button class="fk-rute${valgt ? " valgt" : ""}" data-h="velg" data-v="${i}" data-stille aria-pressed="${valgt}" style="--n:${lengde(o)}"${st.ferdig ? " disabled" : ""}><span>${esc(o)}</span></button>`; // sprak-ok (action names)
      })
      .join("");
    return `<div class="fk-brett" role="group" aria-label="${esc(R.t("Ordene"))}">${striper}${ruter}</div>`;
  }

  function hjelpTekst(sp) {
    if (melding) return `<span class="fk-varsel ${melding.klasse || ""}">${esc(melding.tekst)}</span>`;
    const n = sp.valgt.length;
    if (!n) return esc(R.t("Velg fire ord som hører sammen."));
    return esc(n === 4 ? R.t("Fire valgt – trykk «Prøv».") : R.t("{n} av 4 valgt", { n }));
  }

  function dokkHtml(S, sp) {
    const st = status(sp.forsok);
    const ov = S.modus === "ov";
    if (st.ferdig) return R.ui.dokk(R.ui.knapp(R.t("Se resultatet"), "resultat"), ov ? R.ui.lenkerad(R.ui.lenke(R.t("Flere kløvere"), "arkiv")) : "");
    return R.ui.dokk(
      `<div class="knapprad">${R.ui.knapp2(R.t("Stokk"), "stokk")}${R.ui.knapp2(R.t("Fjern valg"), "fjern", { av: !sp.valgt.length })}</div>`,
      R.ui.knapp(R.t("Prøv"), "prov", { av: sp.valgt.length !== 4 || opptatt, id: "fk-prov" }),
    );
  }

  // The guesses as small tiles in the level colours (the result screen).
  function miniHtml(sp) {
    const rader = sp.forsok.map((g, r) => {
      const v = vurder(g);
      const tekst = v.gruppe >= 0 ? R.t("riktig, {niva}", { niva: NIVANAVN[v.gruppe] }) : v.enUnna ? R.t("én unna") : R.t("feil");
      return `<div class="fk-minirad" role="listitem" aria-label="${esc(R.t("Forsøk {n}: {res}", { n: r + 1, res: tekst }))}">${g.map((i) => `<span class="fk-mini fk-${FARGE[gruppeAv(i)]}">${nivaIkon(gruppeAv(i) + 1)}</span>`).join("")}</div>`;
    });
    return `<div class="fk-minibrett" role="list" aria-label="${esc(R.t("Forsøkene dine"))}">${rader.join("")}</div>`;
  }

  function tallHtml(S) {
    const st = S.stat;
    const prosent = st.spilt ? Math.round((st.vunnet / st.spilt) * 100) : 0;
    return `<div class="fk-tall">
        <div><b>${R.tall(st.spilt)}</b><span>${esc(R.t("spilt"))}</span></div>
        <div><b>${esc(R.t("{n} %", { n: prosent }))}</b><span>${esc(R.t("løst"))}</span></div>
        <div><b>${R.tall(rekkeNa(S))}</b><span>${esc(R.t("på rad"))}</span></div>
        <div><b>${R.tall(st.best)}</b><span>${esc(R.t("beste rekke"))}</span></div>
      </div>`;
  }

  function statistikkArk(S) {
    const st = S.stat;
    const ov = Object.values(S.ovLost);
    return `<h2 id="ark-tittel">${esc(R.t("Statistikk"))}</h2>
      ${st.spilt ? tallHtml(S) + `<p class="hjelp">${esc(R.t("Perfekte dager (uten feil): {n}.", { n: R.tall(st.perfekt) }))}</p>` : `<p class="ingress">${esc(R.t("Du har ikke spilt dagens kløver ennå. Gjør det, så dukker statistikken opp her."))}</p>`}
      ${ov.length ? `<p class="hjelp">${esc(R.t("Øving: {n} av {av} eldre kløvere løst.", { n: R.tall(ov.filter((x) => x === 1).length), av: R.tall(ov.length) }))}</p>` : ""}
      <button class="knapp" data-h="lukk-ark">${esc(R.t("Lukk"))}</button>`;
  }

  // The rules' key to the levels: colour, clover mark and name together.
  const nivaForklaring = () =>
    `<ul class="fk-nivaliste">${NIVANAVN.map((n, g) => `<li class="fk-${FARGE[g]}">${nivaIkon(g + 1)}<span><b>${esc(n.charAt(0).toUpperCase() + n.slice(1))}</b> – ${esc(R.t("{n} blad|{n} blader", { n: g + 1 }))}</span></li>`).join("")}</ul>`;

  // ---------- Playing ----------

  const lyd = {
    velg: (pa) => R.lyd.tone(pa ? 880 : 660, 0, 0.04, "sine", 0.05),
    nei: () => R.lyd.tone(220, 0, 0.16, "triangle", 0.14, 170),
    unna: () => {
      R.lyd.tone(440, 0, 0.12, "triangle", 0.1);
      R.lyd.tone(523, 0.12, 0.16, "triangle", 0.1);
    },
    riktig: (g) => [523, 659, 784].forEach((f, i) => R.lyd.tone(f + g * 40, i * 0.08, 0.14, "triangle", 0.1)),
    tapt: () => {
      R.lyd.tone(523, 0, 0.18, "triangle", 0.1);
      R.lyd.tone(440, 0.18, 0.18, "triangle", 0.1);
      R.lyd.tone(392, 0.36, 0.4, "triangle", 0.1);
    },
  };

  function visHjelp(S) {
    const el = R.$(".fk-hjelp");
    const sp = aktiv(S);
    if (el && sp) el.innerHTML = hjelpTekst(sp);
  }
  function settMelding(S, tekst, klasse, ms) {
    clearTimeout(meldingId);
    melding = { tekst, klasse };
    visHjelp(S);
    meldingId = setTimeout(() => {
      melding = null;
      meldingId = null;
      if (R.S && R.S.skjerm === "brett") visHjelp(R.S);
    }, ms || 2400);
  }

  // Tapping a word changes only that tile, the helper line and the buttons (no redraw).
  function velg(S, i) {
    const sp = aktiv(S);
    if (!sp || opptatt || S.skjerm !== "brett" || status(sp.forsok).ferdig) return;
    const har = sp.valgt.includes(i);
    if (!har && sp.valgt.length >= 4) return settMelding(S, R.t("Du har valgt fire. Trykk «Prøv» eller fjern et ord."), "", 2000);
    sp.valgt = har ? sp.valgt.filter((x) => x !== i) : sp.valgt.concat(i);
    R.lagre();
    lyd.velg(!har);
    const knapp = R.$(`.fk-rute[data-v="${i}"]`);
    if (knapp) {
      knapp.classList.toggle("valgt", !har);
      knapp.setAttribute("aria-pressed", String(!har));
    }
    oppdaterKnapper(S);
    if (melding && !melding.fast) {
      clearTimeout(meldingId);
      melding = null;
    }
    visHjelp(S);
  }

  function oppdaterKnapper(S) {
    const sp = aktiv(S);
    const prov = R.$("#fk-prov");
    if (prov) prov.disabled = sp.valgt.length !== 4 || opptatt;
    const fjern = R.$('[data-h="fjern"]');
    if (fjern) fjern.disabled = !sp.valgt.length;
  }

  function prov(S) {
    const sp = aktiv(S);
    if (!sp || opptatt || sp.valgt.length !== 4) return;
    const for_ = status(sp.forsok);
    if (for_.ferdig) return;
    const gjett = sp.valgt.slice();
    if (sp.forsok.some((g) => nokkel(g) === nokkel(gjett))) {
      lyd.nei();
      return settMelding(S, R.t("Den har du prøvd allerede."), "", 2200);
    }
    const v = vurder(gjett);
    sp.forsok.push(gjett);
    const st = status(sp.forsok);
    if (v.gruppe >= 0) sp.valgt = [];
    const dag = S.modus === "dag";
    if (dag && sp.nr === iDag() && !st.ferdig) R.dagligIGang({ tekst: R.t("{n} av 4", { n: st.funnet.length }) });
    if (st.ferdig) {
      sp.valgt = [];
      if (dag) registrerDag(S, sp);
      else S.ovLost[sp.nr] = st.vunnet ? 1 : 0;
      R.statistikk("ferdig", { modus: S.modus, vunnet: st.vunnet, feil: st.feil });
    }
    R.lagre(); // decided and saved right away; the rest is the show
    vis(S, sp, v, st);
  }

  function vis(S, sp, v, st) {
    opptatt = true;
    oppdaterKnapper(S);
    const fortsatt = R.vakt();
    const rolig = R.rolig();
    const valgte = Array.from(document.querySelectorAll(".fk-rute.valgt"));
    if (v.gruppe >= 0) {
      if (!rolig) valgte.forEach((el, n) => (el.style.setProperty("--i", n), el.classList.add("hopp")));
      lyd.riktig(v.gruppe);
      R.vibrer(30);
      setTimeout(
        () => {
          if (!fortsatt()) return;
          opptatt = false;
          nyStripe = v.gruppe;
          const k = klover(sp.nr)[v.gruppe];
          melding = st.vunnet ? { tekst: ROS[st.feil], klasse: "ros", fast: true } : null;
          R.vis();
          nyStripe = -1;
          R.si(`${R.t("Riktig! {tema}: {ord}.", { tema: k.t, ord: ordListe(k.o) })} ${st.vunnet ? R.t("Alle fire grupper er funnet.") : R.t("{n} av 4 grupper funnet.", { n: st.funnet.length })}`);
          if (st.ferdig) avslutt(S, sp, st);
        },
        rolig ? 80 : 620,
      );
      return;
    }
    // Wrong: the tiles shake, a leaf falls.
    if (!rolig)
      valgte.forEach((el) => {
        el.classList.remove("risting");
        void el.offsetWidth;
        el.classList.add("risting");
      });
    if (v.enUnna) lyd.unna();
    else lyd.nei();
    R.vibrer(60);
    nyttBlad = MAKS_FEIL - st.feil;
    const igjen = MAKS_FEIL - st.feil;
    const tekst = st.ferdig ? R.t("Ingen blader igjen – her er gruppene.") : v.enUnna ? R.t("Én unna!") : R.t("Ikke en gruppe.");
    setTimeout(
      () => {
        if (!fortsatt()) return;
        opptatt = false;
        melding = { tekst, klasse: v.enUnna && !st.ferdig ? "unna" : "", fast: st.ferdig };
        R.vis();
        nyttBlad = -1;
        R.si(`${tekst} ${st.ferdig ? "" : R.t("{feil} igjen.", { feil: R.flertall(igjen, "feil", "feil") })}`);
        if (st.ferdig) avslutt(S, sp, st);
        else {
          clearTimeout(meldingId);
          meldingId = setTimeout(() => {
            melding = null;
            meldingId = null;
            if (R.S && R.S.skjerm === "brett") visHjelp(R.S);
          }, 2600);
        }
      },
      rolig ? 80 : 460,
    );
  }

  function avslutt(S, sp, st) {
    const fortsatt = R.vakt();
    opptatt = true;
    if (st.vunnet) {
      R.lyd.riktig();
      R.vibrer([30, 50, 30]);
    } else lyd.tapt();
    nyFeiring = true;
    setTimeout(
      () => {
        opptatt = false;
        melding = null;
        if (fortsatt()) R.gaTil("resultat");
      },
      R.rolig() ? 900 : st.vunnet ? 1500 : 2600,
    );
  }

  // ---------- Sharing (hearts, never the words) ----------

  function delTekst(S) {
    const sp = S.dag;
    const st = status(sp.forsok);
    const rekke = rekkeNa(S);
    const hode = `${R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) })} · ${resTekst(st)}${st.vunnet && rekke > 1 ? ` · 🔥 ${R.t("{n} på rad", { n: rekke })}` : ""}`;
    return `${hode}\n\n${delRader(sp.forsok).join("\n")}\n`;
  }
  function delKort(S) {
    const sp = S.dag;
    const st = status(sp.forsok);
    const rekke = rekkeNa(S);
    const rader = delRader(sp.forsok);
    const linjer = [st.vunnet ? resTekst(st) : R.t("Ikke løst i dag"), ...rader];
    if (st.vunnet && rekke > 1 && linjer.length < 8) linjer.push(`🔥 ${R.t("{n} på rad", { n: rekke })}`);
    return { tittel: R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) }), linjer: linjer.slice(0, 8) };
  }

  // ---------- Dates for the practice list ----------

  const DATO = new Intl.DateTimeFormat(R.lokale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const datoFor = (nr) => DATO.format(new Date(nr * 86400000 + 12 * 3600000)).replace(/\.$/, "");

  // ---------- The game ----------

  R.start({
    id: "firklover",
    versjon: 1,
    pagar,
    _motor: MOTOR, // for the e2e test

    tilstand: () => ({
      modus: "dag", // which puzzle the board shows: "dag" (today's) or "ov" (an older one)
      dag: null, // { nr, rekkefolge: [16], valgt: [], forsok: [[4], …] }
      ov: null,
      stat: tomStat(),
      ovLost: {}, // day number → 1 solved / 0 not solved (practice)
    }),

    lastet(S) {
      const ok = (sp) =>
        sp &&
        Number.isInteger(sp.nr) &&
        Array.isArray(sp.rekkefolge) &&
        sp.rekkefolge.length === 16 &&
        nokkel(sp.rekkefolge) === nokkel([...Array(16).keys()]) &&
        Array.isArray(sp.valgt) &&
        sp.valgt.length <= 4 &&
        sp.valgt.every((i) => Number.isInteger(i) && i >= 0 && i < 16) &&
        Array.isArray(sp.forsok) &&
        sp.forsok.length <= 7 &&
        sp.forsok.every(gyldigGjett);
      if (!ok(S.dag)) S.dag = null;
      if (!ok(S.ov)) S.ov = null;
      for (const sp of [S.dag, S.ov]) {
        if (!sp) continue;
        const st = status(sp.forsok);
        sp.valgt = st.ferdig ? [] : sp.valgt.filter((i, n, a) => a.indexOf(i) === n && !st.funnet.includes(gruppeAv(i)));
      }
      if (S.modus !== "ov") S.modus = "dag";
      const st = S.stat && typeof S.stat === "object" ? S.stat : {};
      S.stat = {
        spilt: tall(st.spilt),
        vunnet: tall(st.vunnet),
        perfekt: tall(st.perfekt),
        rekke: tall(st.rekke),
        best: tall(st.best),
        sistVunnet: Number.isInteger(st.sistVunnet) ? st.sistVunnet : null,
        sistSpilt: Number.isInteger(st.sistSpilt) ? st.sistSpilt : null,
      };
      const ovl = S.ovLost && typeof S.ovLost === "object" && !Array.isArray(S.ovLost) ? S.ovLost : {};
      S.ovLost = {};
      for (const k of Object.keys(ovl)) if (/^\d+$/.test(k) && (ovl[k] === 0 || ovl[k] === 1)) S.ovLost[k] = ovl[k];
      // A finished day that was never counted, and the front page's «✓ i dag» kept in step.
      if (S.dag && status(S.dag.forsok).ferdig) {
        if (S.stat.sistSpilt !== S.dag.nr) registrerDag(S, S.dag);
        else if (S.dag.nr === iDag()) {
          const s = status(S.dag.forsok);
          R.dagligFerdig({ vunnet: s.vunnet, rekke: s.vunnet ? S.stat.rekke : 0, res: resTekst(s) });
        }
      }
      const sp = aktiv(S);
      if ((S.skjerm === "brett" || S.skjerm === "resultat") && !sp) S.skjerm = "hjem";
      if (S.skjerm === "resultat" && sp && !status(sp.forsok).ferdig) S.skjerm = "brett";
    },

    regler: {
      intro: R.t("Seksten ord skjuler fire grupper med fire ord i hver. Finn alle fire – før kløveren mister bladene."),
      steg: [
        [R.t("Velg fire ord"), R.t("Trykk på fire ord du tror hører sammen, og trykk «Prøv». «Stokk» blander ordene om du står fast.")],
        [R.t("Riktig gruppe"), R.t("Ordene legger seg som en papirstrimmel med temaet. Er tre av fire riktige, får du beskjeden «Én unna!».")],
        [R.t("Fire feil"), R.t("Hver feil koster et blad på kløveren. Mister den alle fire, er dagens kløver over – og du får se gruppene.")],
      ],
      tips: [
        R.t("Noen ord passer i to grupper. Se etter den gruppen som bare kan ha nettopp det ordet."),
        R.t("Gruppene har fire nivåer, fra lett til vriest. Fargen og det lille kløverbladet viser nivået."),
        R.t("Alle får den samme kløveren. En ny kommer ved midnatt."),
        R.t("Del resultatet som hjerter – uten å røpe ordene."),
        R.t("«Øv med eldre kløvere» gir deg kløverne fra dagene før."),
      ],
      get ekstraHtml() {
        return `<h3>${esc(R.t("Nivåene"))}</h3>${nivaForklaring()}`;
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const d = S.dag && S.dag.nr === iDag() ? S.dag : null;
          const ferdig = !!(d && status(d.forsok).ferdig);
          const iGangD = iGang(d);
          const hoved = ferdig
            ? R.ui.knapp(R.t("Se dagens resultat"), "se-resultat")
            : R.ui.knapp(iGangD ? R.t("Fortsett dagens kløver · {n} av 4", { n: status(d.forsok).funnet.length }) : R.t("Dagens kløver"), "dag", { variant: iGangD ? "" : "stor" });
          const rekke = rekkeNa(S);
          const antallEldre = eldre().length;
          return R.ui.spillhjem({
            undertittel: R.t("Ordgåte"),
            slagordHtml: `${esc(R.t("Seksten ord. Fire grupper."))}<br><em>${esc(R.t("Ny kløver hver dag."))}</em>`,
            knapperHtml:
              hoved +
              (ferdig ? nedtellingHtml() : "") +
              (antallEldre ? R.ui.knapp2(iGang(S.ov) ? R.t("Fortsett øvingen") : R.t("Øv med eldre kløvere"), "ov") : "") +
              R.ui.lenkerad(R.ui.lenke(R.t("Statistikk"), "statistikk"), R.ui.lenke(R.t("Slik spiller du"), "regler")),
            merker: [["16", R.t("ord")], ["4", R.t("grupper")], rekke ? [`🔥 ${rekke}`, rekke === 1 ? R.t("dag på rad") : R.t("dager på rad")] : ["4", R.t("feil lov")]],
          });
        },
        inn(S) {
          if (S.dag && S.dag.nr === iDag() && status(S.dag.forsok).ferdig) startNedtelling();
        },
      },

      brett: {
        tittel: (S) => (S.modus === "ov" ? R.t("Øving · nr. {nr}", { nr: nrFor(S.ov.nr) }) : R.t("Dagens kløver")),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const st = status(sp.forsok);
          const ov = S.modus === "ov";
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(ov ? R.t("Øving: {navn} nr. {nr}", { navn: NAVN, nr: nrFor(sp.nr) }) : R.t("Dagens kløver"))}</h1>
            <div class="fk-status">
              <p class="fk-hjelp">${hjelpTekst(sp)}</p>
              ${kloverHtml(st.feil)}
            </div>
            ${brettHtml(S, sp)}
            ${dokkHtml(S, sp)}`;
        },
        inn() {
          opptatt = false;
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
        tittel: R.t("Eldre kløvere"),
        tilbake: "hjem",
        vis(S) {
          const liste = eldre();
          const rader = liste
            .map((nr) => {
              const lost = S.ovLost[nr];
              const paGang = S.ov && S.ov.nr === nr && iGang(S.ov);
              const ovH = 'data-h="spill-ov"'; // sprak-ok (an action name)
              const merke = lost === 1 ? ["✓", R.t("løst")] : lost === 0 ? ["✗", R.t("ikke løst")] : paGang ? ["…", R.t("påbegynt")] : ["", R.t("ny")];
              return `<li><button class="fk-arkivrad${lost === 1 ? " lost" : ""}" ${ovH} data-v="${nr}" aria-label="${esc(R.t("Nr. {nr}, {dato}, {status}", { nr: nrFor(nr), dato: datoFor(nr), status: merke[1] }))}">
                <b>${esc(R.t("Nr. {nr}", { nr: nrFor(nr) }))}</b><span>${esc(datoFor(nr))}</span><i aria-hidden="true">${merke[0]}</i></button></li>`;
            })
            .join("");
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Eldre kløvere"))}</h1>
            <p class="ingress">${esc(R.t("Spill kløverne fra dagene før. Øving teller ikke i statistikken."))}</p>
            <ul class="fk-arkiv">${rader}</ul>
            ${R.ui.dokk(R.ui.knapp(R.t("Tilfeldig kløver"), "tilfeldig"), R.ui.lenkerad(R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem")))}`;
        },
      },

      resultat: {
        tittel: (S) => (S.modus === "ov" ? R.t("Øving · nr. {nr}", { nr: nrFor(S.ov.nr) }) : R.t("{navn} nr. {nr}", { navn: NAVN, nr: nrFor(S.dag.nr) })),
        tilbake: "hjem",
        vis(S) {
          const sp = aktiv(S);
          const st = status(sp.forsok);
          const ov = S.modus === "ov";
          const gammel = !ov && sp.nr !== iDag();
          const banner = R.ui.banner({
            etikett: st.vunnet ? ROS[st.feil] : ov ? R.t("Ikke denne gangen") : R.t("Ikke i dag"),
            tittel: st.vunnet ? (st.feil ? R.t("Alle fire grupper – med {feil}", { feil: R.flertall(st.feil, "feil", "feil") }) : R.t("Alle fire grupper uten en eneste feil!")) : R.t("Du fant {n} av 4 grupper", { n: st.funnet.length }),
            klasse: "fk-banner",
            stemning: st.vunnet ? (st.feil < 3 ? "jubel" : "") : "lei",
          });
          const grupper = `<section class="seksjon fk-grupper" aria-labelledby="fk-grupper-tittel"><h2 id="fk-grupper-tittel">${esc(R.t("Gruppene"))}</h2>${[0, 1, 2, 3]
            .map((g) => stripeHtml(sp, g, { avslort: !st.funnet.includes(g) }))
            .join("")}</section>`;
          if (ov) {
            const lost = Object.values(S.ovLost);
            return `${banner}
              ${miniHtml(sp)}
              ${grupper}
              <p class="hjelp">${esc(R.t("Du har løst {n} av {av} eldre kløvere.", { n: R.tall(lost.filter((x) => x === 1).length), av: R.tall(lost.length) }))}</p>
              ${R.ui.flereSpill({ antall: 1 })}
              ${R.ui.dokk(R.ui.knapp(R.t("Flere kløvere"), "arkiv"), R.ui.lenkerad(R.ui.lenke(R.t("Til {navn}", { navn: NAVN }), "hjem"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
          }
          return `${banner}
            ${gammel ? `<p class="fk-nedtelling"><b>${esc(R.t("En ny kløver er klar!"))}</b></p>` : nedtellingHtml()}
            ${miniHtml(sp)}
            ${grupper}
            <section class="seksjon fk-stat" aria-labelledby="fk-stat-tittel">
              <h2 id="fk-stat-tittel">${esc(R.t("Statistikk"))}</h2>
              ${tallHtml(S)}
            </section>
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(
              gammel ? R.ui.knapp(R.t("Spill dagens kløver"), "dag") : R.ui.knapp(R.t("Del resultatet"), "del"),
              R.ui.lenkerad(R.ui.lenke(R.t("Øv med eldre kløvere"), "arkiv"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`),
            )}`;
        },
        inn(S) {
          R.slippVaken();
          const sp = aktiv(S);
          if (S.modus === "dag" && sp.nr === iDag()) startNedtelling();
          if (!nyFeiring) return;
          nyFeiring = false;
          const st = status(sp.forsok);
          if (st.vunnet && st.feil <= 1) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (st.vunnet) R.lyd.pling();
          if (S.modus === "dag") {
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && R.visInstallTips(), 3000);
          }
        },
      },
    },

    // rusj.no/firklover/#dagens (the front page's «I dag»): today's board, or its result if finished.
    vedHash(S, hash) {
      if (hash !== "dagens") return null;
      if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
      S.modus = "dag";
      return status(S.dag.forsok).ferdig ? "resultat" : "brett";
    },

    handlinger: (H = {
      dag(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag()) nyttDagspill(S);
        S.modus = "dag";
        R.gaTil(status(S.dag.forsok).ferdig ? "resultat" : "brett");
      },
      "se-resultat"(el, e, S) {
        if (!S.dag || S.dag.nr !== iDag() || !status(S.dag.forsok).ferdig) return H.dag(el, e, S);
        S.modus = "dag";
        R.gaTil("resultat");
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
        if (!S.ov || S.ov.nr !== nr || (status(S.ov.forsok).ferdig && S.skjerm === "arkiv")) {
          S.ov = nyttSpill(nr);
          R.statistikk("start", { modus: "ov" });
        }
        S.modus = "ov";
        R.gaTil("brett");
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
      resultat(el, e, S) {
        const sp = aktiv(S);
        if (sp && status(sp.forsok).ferdig) R.gaTil("resultat");
      },
      hjem() {
        R.gaTil("hjem");
      },
      velg(el, e, S) {
        velg(S, Number(el.dataset.v));
      },
      prov(el, e, S) {
        prov(S);
      },
      fjern(el, e, S) {
        const sp = aktiv(S);
        if (!sp || opptatt || !sp.valgt.length) return;
        sp.valgt = [];
        R.lagre();
        document.querySelectorAll(".fk-rute.valgt").forEach((k) => {
          k.classList.remove("valgt");
          k.setAttribute("aria-pressed", "false");
        });
        oppdaterKnapper(S);
        visHjelp(S);
        R.si(R.t("Ingen ord valgt."));
      },
      stokk(el, e, S) {
        const sp = aktiv(S);
        if (!sp || opptatt) return;
        const st = status(sp.forsok);
        const igjen = sp.rekkefolge.filter((i) => !st.funnet.includes(gruppeAv(i)));
        const ferdige = sp.rekkefolge.filter((i) => st.funnet.includes(gruppeAv(i)));
        let ny = R.stokk(igjen);
        for (let n = 0; n < 5 && ny.join() === igjen.join() && igjen.length > 1; n++) ny = R.stokk(igjen);
        sp.rekkefolge = ferdige.concat(ny);
        R.lyd.tone(520, 0, 0.06, "sine", 0.05);
        R.vis();
        if (!R.rolig()) document.querySelectorAll(".fk-rute").forEach((k) => k.classList.add("stokket"));
        R.si(R.t("Ordene er stokket."));
      },
      statistikk(el, e, S) {
        R.ark(statistikkArk(S));
      },
      del(el, e, S) {
        if (S.dag && status(S.dag.forsok).ferdig) return R.del(NAVN, delTekst(S), DEL_URL + "#utfordring", { kort: delKort(S) });
      },
    }),
  });
})();
