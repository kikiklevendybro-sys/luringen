/* Nøtteknekkeren — the times tables and mental maths, at your own pace. The squirrel collects a nut for
   every answer that is right the first time. Practice rounds (ten questions; a question you miss
   comes back a little later, and the facts you know least come up most) and a calm challenge
   (twenty questions, no clock while you answer, a record per choice). Times tables 1–10, division,
   and plus and minus up to 10, 20 or 100. Progress per table: a fact counts as learnt when it has
   been right twice in a row. A wrong answer is never punished with a sound: the squirrel shows the
   right one. The question generator at the top is pure; test/notteknekkeren.test.mjs loads this file
   without the kit. */
(function () {
  "use strict";

  // ---------- Questions (no kit needed) ----------

  const TABELLER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const ARTER = ["gange", "deling", "pluss", "minus"];
  const GRENSER = [10, 20, 100];
  const LAERT = 2; // a fact is learnt at this level (right twice in a row)
  const MAKS_NIVA = 3;

  const Oppgaver = {
    // Every fact of a choice: { a, b, op, svar, k (the fact's key), t (its table, for × and :) }.
    // gange: «f · t» for every chosen table t and f = 1–10 (the table can stand first or last);
    // deling: «t·f : t»; pluss/minus: every pair up to the limit (plus: both at least 1; minus:
    // the answer 0 or more). Up to 100 the numbers are kept to whole and round pairs a child can
    // do in the head (a sum of two numbers that do not both need a carry).
    pulje(art, o) {
      const ut = [];
      if (art === "gange" || art === "deling") {
        for (const t of o.tabeller)
          for (let f = 1; f <= 10; f++) {
            if (art === "gange") ut.push({ a: f, b: t, op: "gange", svar: f * t, k: `g${t}x${f}`, t });
            else ut.push({ a: f * t, b: t, op: "deling", svar: f, k: `d${t}:${f}`, t });
          }
        return ut;
      }
      const n = o.til;
      if (art === "pluss") {
        for (let a = 1; a < n; a++)
          for (let b = 1; a + b <= n; b++) {
            if (n === 100 && !rundt(a, b)) continue;
            ut.push({ a, b, op: "pluss", svar: a + b, k: `p${a}+${b}` });
          }
        return ut;
      }
      for (let a = 2; a <= n; a++)
        for (let b = 1; b <= a; b++) {
          if (n === 100 && !rundt(a - b, b)) continue;
          ut.push({ a, b, op: "minus", svar: a - b, k: `m${a}-${b}` });
        }
      return ut;
    },
    // A round: `antall` questions drawn without putting back (a new pass when the pool runs out),
    // the facts with the lowest level weighing most (vekt = 1 + MAKS_NIVA − level), never the same
    // question twice in a row. fakta: { key: level }. rng: numbers from 0 to 1.
    runde(pulje, antall, fakta, rng, vektet = true) {
      const ut = [];
      let igjen = [];
      while (ut.length < antall && pulje.length) {
        if (!igjen.length) igjen = pulje.slice();
        const forrige = ut.length ? ut[ut.length - 1].k : null;
        const kandidater = igjen.filter((q) => q.k !== forrige);
        const liste = kandidater.length ? kandidater : igjen;
        const vekt = (q) => (vektet ? 1 + MAKS_NIVA - Math.min(MAKS_NIVA, (fakta && fakta[q.k]) || 0) : 1);
        const sum = liste.reduce((s, q) => s + vekt(q), 0);
        let x = rng() * sum;
        let valgt = liste[liste.length - 1];
        for (const q of liste) {
          x -= vekt(q);
          if (x < 0) {
            valgt = q;
            break;
          }
        }
        ut.push(valgt);
        igjen.splice(igjen.indexOf(valgt), 1);
      }
      return ut;
    },
    // Four answers to choose from: the right one and three that are easy to mix it up with
    // (one off, a table step off, the digits swapped), all different and 0 or more, sorted.
    valg(q, rng) {
      const s = q.svar;
      const nare = [s - 1, s + 1, s - 2, s + 2, s + 10, s - 10];
      if (q.op === "gange") nare.unshift(s - q.b, s + q.b, s - q.a, s + q.a);
      if (q.op === "deling") nare.unshift(s - 1, s + 1, q.b);
      if (s >= 10 && s < 100 && s % 10 !== 0 && s % 10 !== Math.floor(s / 10) % 10) nare.unshift(Number(String(s).split("").reverse().join("")));
      const ut = [s];
      const kandidater = nare.filter((x, i) => x >= 0 && x !== s && nare.indexOf(x) === i);
      // Mix the near ones a little, so the right answer is not always in the middle.
      for (let i = kandidater.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [kandidater[i], kandidater[j]] = [kandidater[j], kandidater[i]];
      }
      for (const x of kandidater) {
        if (ut.length >= 4) break;
        if (!ut.includes(x)) ut.push(x);
      }
      for (let x = s + 3; ut.length < 4; x++) if (!ut.includes(x)) ut.push(x);
      return ut.sort((a, b) => a - b);
    },
    // The level of a fact after an answer: right the first time +1 (up to 3), wrong −1 (down to 0).
    niva(gml, riktig) {
      const n = Number(gml) || 0;
      return riktig ? Math.min(MAKS_NIVA, n + 1) : Math.max(0, n - 1);
    },
    // How much of a table is learnt: the facts at level LAERT or more, of 10.
    tabell(fakta, art, t) {
      let n = 0;
      for (let f = 1; f <= 10; f++) if (((fakta || {})[art === "deling" ? `d${t}:${f}` : `g${t}x${f}`] || 0) >= LAERT) n++;
      return n;
    },
    // How far a table has come, 0–1: every fact counts up to the level where it is learnt, so the
    // ring fills a little after every right answer.
    andel(fakta, art, t) {
      let sum = 0;
      for (let f = 1; f <= 10; f++) sum += Math.min(LAERT, ((fakta || {})[art === "deling" ? `d${t}:${f}` : `g${t}x${f}`] || 0));
      return sum / (10 * LAERT);
    },
    // Stars for a challenge of 20: all right three, 16 or more two, 10 or more one.
    stjerner: (riktige, av) => (riktige === av ? 3 : riktige >= av * 0.8 ? 2 : riktige >= av / 2 ? 1 : 0),
  };
  // Up to 100: a pair is kept when it can be done in the head without two carries.
  function rundt(a, b) {
    return a % 10 === 0 || b % 10 === 0 || (a % 10) + (b % 10) <= 10;
  }

  const R = window.Rusj;
  if (!R) {
    window.Notteknekkeren = { Oppgaver, TABELLER, ARTER, GRENSER, LAERT };
    return;
  }

  // ---------- The game ----------

  const esc = R.esc;
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "notteknekkeren") + "/";
  // The signs the edition's schools use: · and : in Norway and Denmark, × and ÷ in Britain.
  const TEGN = { gange: R.sprak === "en" ? "×" : "·", deling: R.sprak === "en" ? "÷" : ":", pluss: "+", minus: "−" };
  const ART_NAVN = { gange: R.t("Gange"), deling: R.t("Deling"), pluss: R.t("Pluss"), minus: R.t("Minus") };
  const ROS = [R.t("Riktig!"), R.t("Bra!"), R.t("Supert!"), R.t("Ja!"), R.t("Knallbra!"), R.t("Flott!"), R.t("Nøttebra!")];
  const ANTALL = { ove: 10, utfordring: 20 };
  window.Notteknekkeren = { Oppgaver, TABELLER, ARTER, GRENSER, LAERT };

  const tekstFor = (q) => `${q.a} ${TEGN[q.op]} ${q.b}`;
  const lest = (q) => `${tekstFor(q)} = ${q.svar}`;

  // What a choice is called: «7-gangen», «3-, 4- og 5-gangen», «Pluss til 20».
  function valgNavn(art, tabeller, til) {
    if (art === "pluss") return R.t("Pluss til {n}", { n: til });
    if (art === "minus") return R.t("Minus til {n}", { n: til });
    const t = tabeller.slice().sort((a, b) => a - b);
    if (t.length === 10) return art === "gange" ? R.t("Hele gangetabellen") : R.t("Deling med 1–10");
    if (art === "deling") return R.t("Deling med {tall}", { tall: R.ramsOpp(t.map(String)) });
    if (t.length === 1) return R.t("{n}-gangen", { n: t[0] });
    // «3-, 4- og 7-gangen» in Norwegian and Danish; «the 3, 4 and 7 times tables» in English.
    return R.t("{tall}-gangen", { tall: R.ramsOpp(t.map((n, i) => (R.sprak !== "en" && i < t.length - 1 ? n + "-" : String(n)))) });
  }
  const signatur = (art, tabeller, til) => (art === "gange" || art === "deling" ? `${art}:${tabeller.slice().sort((a, b) => a - b).join(",")}` : `${art}:${til}`);

  // ---------- A round ----------

  function nyttSpill(S) {
    const o = S.oppsett;
    const art = ARTER.includes(o.art) ? o.art : "gange";
    const tabeller = o.tabeller.length ? o.tabeller.slice().sort((a, b) => a - b) : [2];
    const til = GRENSER.includes(o.til) ? o.til : 10;
    const modus = o.modus === "utfordring" ? "utfordring" : "ove";
    const rng = R.rng(R.nyttFro());
    const pulje = Oppgaver.pulje(art, { tabeller, til });
    const ko = Oppgaver.runde(pulje, ANTALL[modus], S.fakta, rng, modus === "ove").map((q) => ({ a: q.a, b: q.b, op: q.op, svar: q.svar, k: q.k, valg: o.valg ? Oppgaver.valg(q, rng) : null }));
    S.spill = { modus, art, tabeller, til, valg: !!o.valg, ko, nr: 0, inn: "", notter: 0, rad: 0, besteRad: 0, bom: [], tid: 0, ferdig: false, resultat: null, svart: null };
    R.statistikk("start", { modus, art, tabeller: tabeller.length, til: art === "pluss" || art === "minus" ? til : 0, valg: !!o.valg });
  }

  const sporsmal = (sp) => sp.ko[sp.nr];

  // ---------- Clock (only shown afterwards) ----------
  let klokkeFra = null;
  function startKlokke(S) {
    if (!S.spill || S.spill.ferdig || klokkeFra != null || document.hidden) return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    if (S && S.spill && klokkeFra != null) S.spill.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill") return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });
  const visTid = (ms) => {
    const s = Math.max(1, Math.round(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  // ---------- Answering ----------

  let las = false;
  let videreId = null;

  function ekorn(klasse, tekst) {
    const e = R.$(".ek-ekorn");
    if (!e) return;
    const boble = e.querySelector(".ek-boble");
    if (tekst != null) boble.textContent = tekst;
    e.classList.remove("jubel", "hmm", "snakker");
    void e.offsetWidth;
    if (klasse) e.classList.add(...klasse.split(" "));
  }

  function svar(S, verdi) {
    const sp = S.spill;
    if (!sp || sp.ferdig || las || sp.svart) return;
    const q = sporsmal(sp);
    if (!q || !Number.isFinite(verdi)) return;
    startKlokke(S);
    const riktig = verdi === q.svar;
    las = true;
    sp.svart = { verdi, riktig };
    // The level of the fact moves only on its first showing in the round.
    if (!q.igjen) S.fakta[q.k] = Oppgaver.niva(S.fakta[q.k], riktig);
    if (riktig) {
      if (!q.igjen) {
        sp.notter += 1;
        S.notter = (S.notter || 0) + 1;
      }
      sp.rad += 1;
      sp.besteRad = Math.max(sp.besteRad, sp.rad);
    } else {
      sp.rad = 0;
      if (!q.igjen) sp.bom.push(lest(q));
      // Practice: the question comes back three questions later (once).
      if (sp.modus === "ove" && !q.igjen) sp.ko.splice(Math.min(sp.ko.length, sp.nr + 3), 0, { ...q, igjen: true });
    }
    R.lagre();
    R.vis();
    const fortsatt = R.vakt();
    if (riktig) {
      R.lyd.riktig();
      R.vibrer(12);
      const fem = sp.rad > 0 && sp.rad % 5 === 0;
      if (fem) setTimeout(() => fortsatt() && R.lyd.pling(), 220);
      ekorn("snakker jubel", fem ? R.t("{n} på rad!", { n: sp.rad }) : R.velg(ROS));
      R.si(R.t("Riktig!"));
    } else {
      ekorn("snakker hmm", R.t("Nesten! Se her:"));
      R.si(R.t("Nesten. Det riktige svaret er {svar}.", { svar: q.svar }));
    }
    clearTimeout(videreId);
    videreId = setTimeout(() => fortsatt() && videre(S), riktig ? 900 : 2300);
  }

  // The next question, or the end of the round.
  function videre(S) {
    const sp = S.spill;
    clearTimeout(videreId);
    if (!sp || sp.ferdig || !sp.svart) return;
    sp.svart = null;
    sp.inn = "";
    sp.nr += 1;
    las = false;
    if (sp.nr >= sp.ko.length) return slutt(S);
    R.lagre();
    R.vis();
    ekorn("", null);
  }

  function slutt(S) {
    const sp = S.spill;
    stoppKlokke(S);
    sp.ferdig = true;
    const av = sp.ko.filter((q) => !q.igjen).length;
    const riktige = sp.notter;
    const sig = signatur(sp.art, sp.tabeller, sp.til);
    const navn = valgNavn(sp.art, sp.tabeller, sp.til);
    if (sp.modus === "utfordring") {
      const gml = S.rekorder[sig];
      sp.resultat = { riktige, av, gml: gml == null ? null : gml, ny: gml != null && riktige > gml, st: Oppgaver.stjerner(riktige, av) };
      S.rekorder[sig] = Math.max(gml || 0, riktige);
      if (riktige === av) R.merke("notteknekkeren-alle");
    } else sp.resultat = { riktige, av };
    S.sist = { modus: sp.modus, navn: sig, riktige, av };
    R.statistikk("ferdig", { modus: sp.modus, art: sp.art, riktige, av, sek: Math.round(sp.tid / 1000) });
    R.lagre();
    R.gaTil("slutt");
  }

  // The on-screen keys and the keyboard.
  function tast(S, v) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    if (sp.svart) {
      // A key while the answer shows: go on at once.
      if (v === "ok") videre(S);
      return;
    }
    if (las) return;
    if (v === "slett") sp.inn = sp.inn.slice(0, -1);
    else if (v === "ok") {
      if (sp.inn) return svar(S, Number(sp.inn));
      return;
    } else if (/^\d$/.test(v) && sp.inn.length < 3) sp.inn = (sp.inn === "0" ? "" : sp.inn) + v;
    else return;
    R.lagre();
    const felt = R.$("#ek-inn");
    if (felt) {
      felt.textContent = sp.inn || "?";
      felt.classList.toggle("tom", !sp.inn);
    }
    // As many digits as the answer: check it (children need not find the OK key).
    const q = sporsmal(sp);
    if (q && sp.inn.length >= String(q.svar).length) svar(S, Number(sp.inn));
  }

  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || S.skjerm !== "spill" || !S.spill || R.arkApent() || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = e.target;
    if (m && m.closest && m.closest("input, textarea")) return;
    const sp = S.spill;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      if (sp.valg && !sp.svart) {
        // With four answers: 1–4 pick the answer in that place.
        const q = sporsmal(sp);
        const n = Number(e.key);
        if (q && q.valg && n >= 1 && n <= 4) svar(S, q.valg[n - 1]);
        return;
      }
      tast(S, e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      tast(S, "slett");
    } else if (e.key === "Enter" && !(m && m.closest && m.closest("button"))) {
      e.preventDefault();
      tast(S, "ok");
    }
  });

  // ---------- Markup ----------

  const notterHtml = (sp) => `<span class="ek-notter" role="img" aria-label="${esc(R.t("{n} nøtt|{n} nøtter", { n: sp.notter }))}"><span aria-hidden="true">🌰</span><b>${sp.notter}</b></span>`;

  function fremdriftHtml(sp) {
    const av = sp.ko.length;
    const pst = Math.round((sp.nr / av) * 100);
    return `<div class="ek-fremdrift" role="progressbar" aria-valuemin="0" aria-valuemax="${av}" aria-valuenow="${sp.nr}" aria-label="${esc(R.t("Spørsmål {n} av {av}", { n: Math.min(sp.nr + 1, av), av }))}"><i style="width:${pst}%"></i></div>`;
  }

  function tastaturHtml(sp) {
    const q = sporsmal(sp);
    if (sp.valg && q && q.valg) {
      return `<div class="ek-valg" role="group" aria-label="${esc(R.t("Velg svaret"))}">${q.valg
        .map((x, i) => {
          const k = sp.svart ? (x === q.svar ? " riktig" : x === sp.svart.verdi ? " feil" : "") : "";
          return `<button class="ek-svar${k}" data-h="velg" data-v="${x}" data-stille aria-keyshortcuts="${i + 1}"${sp.svart ? ' aria-disabled="true"' : ""}>${x}</button>`; // sprak-ok (an action name)
        })
        .join("")}</div>`;
    }
    const tast = (v, tekst, klasse = "", etikett = "") =>
      `<button class="ek-tast${klasse}" data-h="tast" data-v="${v}" data-stille${etikett ? ` aria-label="${esc(etikett)}"` : ""}>${tekst}</button>`;
    return `<div class="ek-tastatur" role="group" aria-label="${esc(R.t("Tall"))}">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => tast(n, n)).join("")}
      ${tast("slett", "⌫", " ek-slett", R.t("Slett"))}${tast(0, 0)}${tast("ok", sp.svart ? "→" : esc(R.t("OK")), " ek-ok", sp.svart ? R.t("Neste") : R.t("Svar"))}
    </div>`;
  }

  function spillHtml(S) {
    const sp = S.spill;
    const q = sporsmal(sp);
    const av = sp.ko.length;
    let svarHtml;
    if (sp.svart && !sp.svart.riktig) svarHtml = `<span class="ek-feil-svar" aria-hidden="true">${esc(String(sp.svart.verdi))}</span><b class="ek-svaret">${q.svar}</b>`;
    else if (sp.svart) svarHtml = `<b class="ek-svaret">${q.svar}</b>`;
    else if (sp.valg) svarHtml = `<b class="ek-svaret tom">?</b>`;
    else svarHtml = `<b id="ek-inn" class="ek-svaret${sp.inn ? "" : " tom"}">${esc(sp.inn || "?")}</b>`;
    return `
      <h1 class="vh" id="skjerm-tittel">${esc(R.t("Regn ut"))}</h1>
      <div class="ek-spill">
        <div class="ek-hud">
          <span class="ek-nr">${esc(R.t("{n} av {av}", { n: Math.min(sp.nr + 1, av), av }))}</span>
          ${fremdriftHtml(sp)}
          ${notterHtml(sp)}
        </div>
        <div class="ek-midt">
          <div class="ek-ekorn" aria-hidden="true">${R.figur()}<span class="ek-boble"></span></div>
          <div class="ek-kort${sp.svart ? (sp.svart.riktig ? " riktig" : " feil") : ""}${q && q.igjen ? " igjen" : ""}">
            ${q && q.igjen ? `<small class="ek-igjen">${esc(R.t("En gang til"))}</small>` : ""}
            <p class="ek-stykke" aria-live="polite"><span>${esc(tekstFor(q))}</span> <span class="ek-lik">=</span> ${svarHtml}</p>
          </div>
        </div>
        ${R.ui.dokk(tastaturHtml(sp))}
      </div>`;
  }

  // A progress ring: filled as far as the table has come; gold when all ten are learnt.
  const ring = (fakta, art, t, innhold) =>
    `<span class="ek-ring${Oppgaver.tabell(fakta, art, t) >= 10 ? " full" : ""}" style="--p:${Math.round(Oppgaver.andel(fakta, art, t) * 100)}">${innhold}</span>`;

  function fremgangHtml(S, art) {
    return `<div class="ek-fremgang" role="list" aria-label="${esc(art === "deling" ? R.t("Fremgang i deling") : R.t("Fremgang i gangetabellen"))}">${TABELLER.map((t) => {
      const n = Oppgaver.tabell(S.fakta, art, t);
      return `<span role="listitem" aria-label="${esc(R.t("{t}-gangen: {n} av 10", { t, n }))}">${ring(S.fakta, art, t, `<b>${t}</b>`)}</span>`;
    }).join("")}</div>`;
  }

  // The tables to choose from: a big tile per table with its progress ring.
  function tabellvalgHtml(S) {
    const o = S.oppsett;
    return `<div class="ek-tabeller" role="group" aria-label="${esc(R.t("Velg tabeller"))}">${TABELLER.map((t) => {
      const n = Oppgaver.tabell(S.fakta, o.art, t);
      const pa = o.tabeller.includes(t);
      return `<button class="ek-tabell" data-h="tabell" data-v="${t}" aria-pressed="${pa}" aria-label="${esc(R.t("{t}-gangen, {n} av 10 lært", { t, n }))}">${ring(S.fakta, o.art, t, `<b>${t}</b>`)}</button>`;
    }).join("")}</div>`;
  }

  function delTekst(S) {
    const sp = S.spill;
    const r = sp.resultat || {};
    return R.t("Nøtteknekkeren 🐿️ {riktige} av {av} riktige på {hva}! Klarer du det?", { riktige: r.riktige, av: r.av, hva: valgNavn(sp.art, sp.tabeller, sp.til).toLowerCase() });
  }

  // ---------- Start ----------

  R.start({
    id: "notteknekkeren",
    versjon: 1,
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      oppsett: { modus: "ove", art: "gange", tabeller: [2], til: 10, valg: false },
      fakta: {},
      rekorder: {},
      notter: 0,
      sist: null,
      spill: null,
    }),

    lastet(S) {
      const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      const tabeller = Array.isArray(o.tabeller) ? TABELLER.filter((t) => o.tabeller.includes(t)) : [];
      S.oppsett = {
        modus: o.modus === "utfordring" ? "utfordring" : "ove",
        art: ARTER.includes(o.art) ? o.art : "gange",
        tabeller: tabeller.length ? tabeller : [2],
        til: GRENSER.includes(o.til) ? o.til : 10,
        valg: !!o.valg,
      };
      const f = S.fakta && typeof S.fakta === "object" ? S.fakta : {};
      S.fakta = {};
      for (const [k, v] of Object.entries(f)) if (/^[gdpm][\d+\-x:]+$/.test(k) && heltall(v, 0, 3)) S.fakta[k] = v;
      const rek = S.rekorder && typeof S.rekorder === "object" ? S.rekorder : {};
      S.rekorder = {};
      for (const [k, v] of Object.entries(rek)) if (/^(gange|deling|pluss|minus):[\d,]+$/.test(k) && heltall(v, 0, 20)) S.rekorder[k] = v;
      S.notter = heltall(S.notter, 0, 1e9) ? S.notter : 0;
      S.sist = S.sist && typeof S.sist.navn === "string" && heltall(S.sist.riktige, 0, 20) && heltall(S.sist.av, 1, 20) ? S.sist : null;
      const sp = S.spill;
      if (sp) {
        const okQ = (q) => q && ARTER.includes(q.op) && heltall(q.a, 0, 100) && heltall(q.b, 0, 100) && heltall(q.svar, 0, 200) && typeof q.k === "string" && (q.valg == null || (Array.isArray(q.valg) && q.valg.length === 4 && q.valg.includes(q.svar)));
        const ok =
          ["ove", "utfordring"].includes(sp.modus) &&
          ARTER.includes(sp.art) &&
          Array.isArray(sp.ko) &&
          sp.ko.length >= 1 &&
          sp.ko.length <= 40 &&
          sp.ko.every(okQ) &&
          heltall(sp.nr, 0, sp.ko.length) &&
          heltall(sp.notter, 0, 40) &&
          Array.isArray(sp.tabeller);
        if (!ok) S.spill = null;
        else {
          sp.inn = typeof sp.inn === "string" && /^\d{0,3}$/.test(sp.inn) ? sp.inn : "";
          sp.bom = Array.isArray(sp.bom) ? sp.bom.filter((x) => typeof x === "string").slice(0, 40) : [];
          sp.tid = Number.isFinite(sp.tid) && sp.tid >= 0 ? sp.tid : 0;
          sp.rad = heltall(sp.rad, 0, 99) ? sp.rad : 0;
          sp.besteRad = heltall(sp.besteRad, 0, 99) ? sp.besteRad : 0;
          sp.ferdig = !!sp.ferdig && !!sp.resultat;
          // An answer that showed when the page closed: on to the next question.
          if (!sp.ferdig && sp.svart) {
            sp.svart = null;
            sp.inn = "";
            sp.nr += 1;
          }
          if (!sp.ferdig && sp.nr >= sp.ko.length) S.spill = null;
        }
      }
      const s = S.spill;
      if (S.skjerm === "spill" && !s) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(s && s.ferdig)) S.skjerm = s ? "spill" : "hjem";
      if (S.skjerm === "spill" && s && s.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: R.t("Nøtteknekkeren samler nøtter. Hvert svar som er riktig første gang, gir én nøtt!"),
      steg: [
        [R.t("Velg hva du vil øve på"), R.t("Gangetabellen (velg de tabellene du vil), deling, pluss eller minus.")],
        [R.t("Regn i ditt eget tempo"), R.t("Skriv svaret med talltastene – eller velg mellom fire svar. Det er ingen klokke som tikker.")],
        [R.t("Se fremgangen"), R.t("Når et regnestykke har vært riktig to ganger på rad, kan du det. Ringene viser hvor mye av hver tabell du kan.")],
      ],
      tips: [
        R.t("Øverunde: ti spørsmål. Bommer du, kommer regnestykket tilbake litt senere – og det du kan minst, kommer oftest."),
        R.t("Utfordring: tjue spørsmål uten klokke. Hvor mange får du riktig første gang? Rekorden lagres for hvert valg."),
        R.t("Svarer du feil, viser Nøtteknekkeren det riktige svaret. Det er sånn man lærer!"),
        R.t("Med tastatur: tallene, rettetasten og Enter. Med fire svar velger tastene 1–4 svaret."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = !!(sp && !sp.ferdig);
          const sist = S.sist ? R.t("Sist: {riktige} av {av} · {hva}", { riktige: S.sist.riktige, av: S.sist.av, hva: valgNavn(...sigDeler(S.sist.navn)) }) : "";
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Gangetabellen og hoderegning –"))}<br><em>${esc(R.t("i ditt eget tempo."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: aktiv,
              fortsettTekst: aktiv ? R.t("Fortsett · {n} av {av}", { n: Math.min(sp.nr + 1, sp.ko.length), av: sp.ko.length }) : "",
              startTekst: R.t("Start"),
              ekstraHtml:
                R.ui.lenke(R.t("Slik spiller du"), "regler") +
                `<section class="ek-hjemfremgang" aria-labelledby="ek-fg-tittel">
                  <p class="etikett" id="ek-fg-tittel">${esc(R.t("Gangetabellen"))}</p>
                  ${fremgangHtml(S, "gange")}
                  ${S.notter ? `<p class="ek-lager"><span aria-hidden="true">🌰</span> ${esc(R.t("{n} nøtt i lageret|{n} nøtter i lageret", { n: S.notter }))}</p>` : ""}
                  ${sist ? `<p class="ek-sist">${esc(sist)}</p>` : ""}
                </section>`,
            }),
            merker: [
              ["10", R.t("tabeller")],
              ["4", R.t("regnearter")],
              ["0", R.t("reklame")],
            ],
          });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const tabell = o.art === "gange" || o.art === "deling";
          const sig = signatur(o.art, o.tabeller, o.til);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              ${R.ui.fliser(
                "modus",
                [
                  { v: "ove", tittel: R.t("Øverunde"), tekst: R.t("Ti spørsmål – bom kommer igjen"), ikon: "🌰" },
                  { v: "utfordring", tittel: R.t("Utfordring"), tekst: R.t("Tjue spørsmål – uten klokke"), ikon: "🏆" },
                ],
                o.modus,
              )}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Hva vil du regne?"))}</h2></div>
              <div class="ek-arter">${R.ui.fliser(
                "art",
                ARTER.map((a) => ({ v: a, tittel: ART_NAVN[a], ikon: `<span class="ek-tegn">${TEGN[a]}</span>` })),
                o.art,
              )}</div>
            </section>
            ${
              tabell
                ? `<section class="seksjon">
                    <div class="seksjon-hode"><h2>${esc(R.t("Hvilke tabeller?"))}</h2><button class="lenke ek-alle" data-h="alle">${esc(o.tabeller.length === 10 ? R.t("Bare én") : R.t("Alle"))}</button></div>
                    ${tabellvalgHtml(S)}
                    <p class="hjelp">${esc(R.t("Ringen viser hvor mye av tabellen du kan."))}</p>
                  </section>`
                : `<section class="seksjon">
                    <div class="seksjon-hode"><h2>${esc(R.t("Hvor store tall?"))}</h2></div>
                    ${R.ui.seg("til", GRENSER.map((n) => [n, R.t("Til {n}", { n })]), o.til, { etikett: R.t("Hvor store tall") })}
                  </section>`
            }
            <section class="seksjon">
              ${R.ui.bryter("svarvalg", o.valg, R.t("Fire svar å velge mellom"), R.t("Lettere enn å skrive svaret selv."))}
              ${o.modus === "utfordring" && S.rekorder[sig] != null ? `<p class="hjelp">${esc(R.t("Rekorden din på {hva}: {n} av 20", { hva: valgNavn(o.art, o.tabeller, o.til).toLowerCase(), n: S.rekorder[sig] }))}</p>` : ""}
            </section>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill ? valgNavn(S.spill.art, S.spill.tabeller, S.spill.til) : ""),
        tilbake: "hjem",
        // The question beside the keys on a phone on its side (spill.css).
        liggende: false,
        vis: spillHtml,
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          if (S.spill.ferdig) return R.gaTil("slutt");
          las = false;
          R.holdVaken();
          startKlokke(S);
        },
        ut(S) {
          clearTimeout(videreId);
          stoppKlokke(S);
          // An answer that was showing: on to the next question when the round goes on.
          const sp = S.spill;
          if (sp && !sp.ferdig && sp.svart) {
            sp.svart = null;
            sp.inn = "";
            sp.nr += 1;
            if (sp.nr >= sp.ko.length) sp.nr = sp.ko.length - 1;
          }
          las = false;
          R.slippVaken();
        },
      },

      slutt: {
        tittel: (S) => (S.spill ? valgNavn(S.spill.art, S.spill.tabeller, S.spill.til) : ""),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.resultat || { riktige: sp.notter, av: sp.ko.length };
          const tabell = sp.art === "gange" || sp.art === "deling";
          const ut = sp.modus === "utfordring";
          const tittel = r.riktige === r.av ? R.t("Alle riktige!") : r.riktige >= r.av * 0.7 ? R.t("Godt jobba!") : R.t("Godt øvd!");
          const st = ut ? `<p class="ek-stjerner" role="img" aria-label="${esc(R.t("{n} av 3 stjerner", { n: r.st || 0 }))}">${[1, 2, 3].map((n) => `<span class="${n <= (r.st || 0) ? "pa" : ""}">${n <= (r.st || 0) ? "★" : "☆"}</span>`).join("")}</p>` : "";
          const linje = ut
            ? r.ny
              ? R.t("Ny rekord! Forrige: {n} av 20", { n: r.gml })
              : r.gml == null
                ? R.t("Første utfordring på dette valget – nå har du en rekord å slå!")
                : R.t("Rekorden din: {n} av 20", { n: Math.max(r.gml, r.riktige) })
            : r.riktige === r.av
              ? R.t("Alt riktig første gang. Prøv utfordringen!")
              : R.t("Det du bommet på, kommer oftere neste gang.");
          return `
            <div class="banner aksent">
              ${R.ui.figur(null, { stemning: "jubel" })}
              <p class="etikett">${esc(valgNavn(sp.art, sp.tabeller, sp.til))}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${st}
            </div>
            <div class="ek-resultat">
              <div class="ek-tall${r.ny ? " ny" : ""}"><b>${r.riktige}<small>/${r.av}</small></b><span>${esc(R.t("nøtter"))}</span>${r.ny ? `<i class="ek-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
              <div class="ek-tall"><b>${esc(visTid(sp.tid))}</b><span>${esc(R.t("tid"))}</span></div>
            </div>
            <p class="hjelp ek-linje">${esc(linje)}</p>
            ${sp.bom.length ? `<section class="seksjon ek-bom"><h2>${esc(R.t("Øv litt mer på"))}</h2><ul>${sp.bom.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
            ${tabell ? `<section class="seksjon"><h2>${esc(sp.art === "deling" ? R.t("Fremgang i deling") : R.t("Fremgang i gangetabellen"))}</h2>${fremgangHtml(S, sp.art)}</section>` : ""}
            ${ut && r.riktige > 0 ? R.ui.knapp2(R.t("Del resultatet"), "del") : ""}
            ${R.ui.flereSpill({ antall: 1 })}
            ${R.ui.dokk(R.ui.knapp(ut ? R.t("Prøv igjen") : R.t("Øv igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp || !sp.resultat) return;
          const r = sp.resultat;
          // Celebrate in proportion: a fanfare for all right or a record, warm words otherwise.
          if (r.riktige === r.av || r.ny) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },
    },

    handlinger: {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        const sp = S.spill;
        if ((await R.bekreftNytt(!!(sp && !sp.ferdig && sp.nr > 0), true)) && fortsatt()) R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "utfordring" ? "utfordring" : "ove";
        R.vis();
      },
      art(el, e, S) {
        if (ARTER.includes(el.dataset.v)) S.oppsett.art = el.dataset.v;
        R.vis();
      },
      til(el, e, S) {
        const n = Number(el.dataset.v);
        if (GRENSER.includes(n)) S.oppsett.til = n;
        R.vis();
      },
      tabell(el, e, S) {
        const t = Number(el.dataset.v);
        if (!TABELLER.includes(t)) return;
        const o = S.oppsett;
        if (o.tabeller.includes(t)) {
          if (o.tabeller.length > 1) o.tabeller = o.tabeller.filter((x) => x !== t);
        } else o.tabeller = TABELLER.filter((x) => x === t || o.tabeller.includes(x));
        R.vis();
      },
      alle(el, e, S) {
        const o = S.oppsett;
        o.tabeller = o.tabeller.length === 10 ? [o.tabeller[0] === 1 ? 2 : o.tabeller[0]] : TABELLER.slice();
        R.vis();
      },
      svarvalg(el, e, S) {
        S.oppsett.valg = !S.oppsett.valg;
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        const sp = S.spill;
        if (sp) Object.assign(S.oppsett, { modus: sp.modus, art: sp.art, tabeller: sp.tabeller.slice(), til: sp.til, valg: sp.valg });
        nyttSpill(S);
        R.gaTil("spill");
      },
      tast(el, e, S) {
        tast(S, String(el.dataset.v));
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (sp && sp.svart) return videre(S);
        svar(S, Number(el.dataset.v));
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig || !sp.resultat) return;
        const r = sp.resultat;
        R.del(R.app.navn, delTekst(S), DEL_URL, { kort: { tittel: R.app.navn, linjer: [`${r.riktige}/${r.av}`, valgNavn(sp.art, sp.tabeller, sp.til)] } });
      },
    },
  });

  // «gange:3,7» → the arguments of valgNavn.
  function sigDeler(sig) {
    const [art, rest] = String(sig).split(":");
    const tall = (rest || "").split(",").map(Number).filter((n) => n > 0);
    return art === "gange" || art === "deling" ? [art, tall.length ? tall : [2], 10] : [ARTER.includes(art) ? art : "pluss", [], tall[0] || 10];
  }
})();
