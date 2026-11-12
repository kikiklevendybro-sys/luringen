/* Detektiven — «Hvem er jeg? – 20 spørsmål». Three small modes on one engine:
   20 spørsmål ("spm"): one player keeps a secret (hold to see); the others are detectives and ask
     yes/no questions out loud. A correct guess gives 2 points, and 1 to every other detective when
     it took 10 questions or fewer; the keeper gets 1 when the secret lasts 15 questions, 2 when it
     lasts all 20 and 3 when nobody finds it.
   Hvem er jeg? ("jeg"): the reverse – the player on turn looks away while the others see the card,
     then asks about itself. 3 points for 10 questions or fewer, 2 for 15, 1 for 20.
   Alle mot hemmeligheten ("sammen"): 20 questions as a team, no points.
   The phone counts the questions on a magnifying-glass meter (Ja / Nei / Kanskje or a plain +1),
   offers hints after 10 and 15, and remembers this phone's record: secrets solved in a row and the
   fastest solve. A game is a number of secrets; the role goes round the table. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const KAT = window.RUSJ_DATA.hemmeligheter.kategorier;
  const MAKS = 20; // questions per secret
  const MAKS_H = 20; // secrets in one game
  const HINT_VED = [10, 15];
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "detektiven") + "/";
  const STAT = "detektiven.stat"; // this phone's record, kept outside the saved game
  const MODUSER = [
    { v: "spm", tittel: R.t("20 spørsmål"), ikon: "🔎", tekst: R.t("Én har hemmeligheten. Detektivene spør – og kjemper om poengene.") },
    { v: "jeg", tittel: R.t("Hvem er jeg?"), ikon: "🤔", tekst: R.t("Du vet ikke hva du er! De andre vet det – og svarer.") },
    { v: "sammen", tittel: R.t("Alle mot hemmeligheten"), ikon: "🤝", tekst: R.t("Samarbeid uten poeng. Hvor få spørsmål trenger dere?") },
  ];
  const NIVAER = [
    [1, R.t("Lett")],
    [2, R.t("Middels")],
    [3, R.t("Vanskelig")],
  ];
  const NIVA_TEKST = {
    1: R.t("Bare lette hemmeligheter – perfekt for barn."),
    2: R.t("Lette og middels vanskelige – passer de fleste."),
    3: R.t("Alt sammen, også de vanskeligste."),
  };
  let H; // the actions

  const ALLE = [];
  KAT.forEach((k) => k.liste.forEach(([navn, n, hjelp]) => ALLE.push({ k: k.id, navn, n, hjelp })));
  const kat = (id) => KAT.find((k) => k.id === id);
  const stokk = R.kortstokk("hemmeligheter", ALLE.length);
  const iUtvalg = (o, w) => o.kategorier.includes(w.k) && w.n <= o.nivaa;
  const antallI = (o) => ALLE.reduce((s, w) => s + (iUtvalg(o, w) ? 1 : 0), 0);
  const antallKat = (id, nivaa) => ALLE.reduce((s, w) => s + (w.k === id && w.n <= nivaa ? 1 : 0), 0);

  // ---------- Game helpers ----------
  const pagar = (S) => !!S.spill && !S.spill.ferdig; // a game that «Nytt spill» would throw away
  const erModus = (m) => MODUSER.some((x) => x.v === m);
  const rangert = (sp) => sp.modus !== "sammen"; // points and a «Kåring»
  // Whose secret it is: the keeper – or, in «Hvem er jeg?», the one who guesses.
  const tur = (sp) => (sp.start + sp.logg.length) % sp.antall;
  const ferdig = (sp) => sp.logg.length >= sp.totalt;
  // How many questions a solve took: those on the meter plus the winning guess (the last chance
  // after question 20 is free). The same number decides every text and every point.
  const medGjett = (spm) => Math.min(MAKS, spm + 1);
  const brukt = (l) => (l.lost ? medGjett(l.spm) : l.spm);
  const spmTekst = (n) => R.flertall(n, "spørsmål", "spørsmål");
  // What a secret has earned its keeper so far in «20 spørsmål» (3 only when all 20 are used up).
  const holdtPoeng = (spm) => (spm >= MAKS ? 2 : spm >= 15 ? 1 : 0);

  // The length of a game is a number of secrets. Until someone picks a number it follows the group:
  // one each (at most eight) with points, one each in «Hvem er jeg?», five as a team.
  const autoAntall = (modus, n) => (modus === "sammen" ? 5 : modus === "jeg" ? n : Math.min(n, 8));
  const spillere = (S) => R.klamp(Number(S.antall) || 2, 2, 20);
  const antallH = (S) => (S.oppsett.antallH ? R.klamp(S.oppsett.antallH, 1, MAKS_H) : autoAntall(S.oppsett.modus, spillere(S)));
  const GANGER = ["", R.t("én gang"), R.t("to ganger"), R.t("tre ganger")];
  function lengdeTekst(modus, t, n) {
    if (modus === "sammen") return R.t("Hemmeligheten går på rundgang, og alle de andre spør.");
    const jeg = modus === "jeg";
    if (t % n === 0) {
      const ganger = GANGER[t / n] || R.t("{n} ganger", { n: t / n });
      return jeg ? R.t("Alle får gjette {ganger}.", { ganger }) : R.t("Alle får ha hemmeligheten {ganger}.", { ganger });
    }
    if (t < n) return jeg ? R.t("{t} av {n} rekker å gjette – bare de er med i kåringen.", { t, n }) : R.t("{t} av {n} rekker å ha hemmeligheten.", { t, n });
    return jeg ? R.t("Ikke alle får gjette like mange ganger.") : R.t("Ikke alle får ha hemmeligheten like mange ganger.");
  }

  const lesStat = () => {
    const lagret = R.les(STAT, null);
    const st = Object.assign({ lost: 0, rad: 0, bestRad: 0, raskest: 0 }, lagret && typeof lagret === "object" ? lagret : {});
    for (const n of ["lost", "rad", "bestRad", "raskest"]) st[n] = Number.isInteger(st[n]) && st[n] >= 0 ? st[n] : 0;
    return st;
  };

  function trekk(S) {
    const sp = S.spill;
    const o = { kategorier: sp.kategorier, nivaa: sp.nivaa };
    const tatt = new Set(sp.logg.map((l) => l.h));
    if (sp.runde) tatt.add(sp.runde.h);
    let i = stokk.neste((n) => iUtvalg(o, ALLE[n]) && !tatt.has(n));
    if (i < 0) i = stokk.neste((n) => iUtvalg(o, ALLE[n]));
    return i < 0 ? 0 : i;
  }
  function nyRunde(S) {
    S.spill.runde = { h: trekk(S), sett: false, spm: 0, svar: [], hint: 0 };
  }

  // Up to two hints: the category (unless only one is in play), then the first letter / length.
  function hintListe(sp, h) {
    const w = ALLE[h];
    const k = kat(w.k);
    const liste = [];
    if (sp.kategorier.length > 1) liste.push({ etikett: R.t("Kategori"), tekst: `${k.ikon} ${k.navn}` });
    liste.push({ etikett: R.t("Første bokstav"), tekst: w.navn.charAt(0).toLocaleUpperCase("nb") });
    const ord = w.navn.split(/\s+/).length;
    const bokstaver = w.navn.replace(/[^\p{L}]/gu, "").length;
    liste.push({
      etikett: ord > 1 ? R.t("Ord og bokstaver") : R.t("Antall bokstaver"),
      tekst: ord > 1 ? `${R.flertall(ord, "ord", "ord")} · ${R.flertall(bokstaver, "bokstav", "bokstaver")}` : R.flertall(bokstaver, "bokstav", "bokstaver"),
    });
    return liste.slice(0, HINT_VED.length);
  }

  // The points of a finished secret. utfall: { lost, g (who guessed it, −1 for nobody in particular), opp (gave up) }
  function poengFor(sp, r, utfall) {
    const k = tur(sp);
    const pluss = {};
    if (sp.modus === "sammen") return pluss;
    const n = medGjett(r.spm);
    if (sp.modus === "jeg") {
      if (utfall.lost) pluss[k] = n <= 10 ? 3 : n <= 15 ? 2 : 1;
      return pluss;
    }
    if (utfall.lost) {
      pluss[utfall.g] = 2;
      // Good questions pay: a quick solve gives every other detective a point too.
      if (n <= 10) for (let i = 0; i < sp.antall; i++) if (i !== k && i !== utfall.g) pluss[i] = 1;
    }
    // Giving up never pays more than the questions have earned – not 3 points after one question.
    const holdt = !utfall.lost && !utfall.opp && r.spm >= MAKS ? 3 : holdtPoeng(r.spm);
    if (holdt) pluss[k] = holdt;
    return pluss;
  }

  function avsluttRunde(S, utfall) {
    const sp = S.spill;
    const r = sp.runde;
    if (!r) return;
    const pluss = poengFor(sp, r, utfall);
    Object.keys(pluss).forEach((i) => (sp.poeng[i] += pluss[i]));
    const l = { k: tur(sp), h: r.h, spm: r.spm, lost: !!utfall.lost, g: utfall.lost && utfall.g >= 0 ? utfall.g : -1, opp: !!utfall.opp, pluss, svar: r.svar.slice(), hint: r.hint, ny: "" };
    // This phone's record. The old numbers are kept so «Angre» can put them back.
    const st = lesStat();
    sp.statFor = Object.assign({}, st);
    if (l.lost) {
      const n = brukt(l);
      st.lost += 1;
      st.rad += 1;
      if (st.rad > st.bestRad) {
        if (st.bestRad >= 2) l.ny = "rad";
        st.bestRad = st.rad;
      }
      if (!st.raskest || n < st.raskest) {
        if (st.raskest) l.ny = "raskest";
        st.raskest = n;
      }
    } else st.rad = 0;
    R.skriv(STAT, st);
    sp.logg.push(l);
    sp.runde = null;
  }

  // ---------- The result ----------
  // Who is ranked: everyone in «20 spørsmål»; in «Hvem er jeg?» those who have had a secret of their own.
  const deltakere = (sp) => Array.from({ length: sp.antall }, (_, i) => i).filter((i) => sp.modus !== "jeg" || sp.logg.some((l) => l.k === i));
  // Equal points are common, so a tie is broken by the detective work itself: the fastest solve
  // («20 spørsmål») or the fewest questions per secret («Hvem er jeg?»). Still equal = a shared place.
  function rangering(sp) {
    const rad = deltakere(sp).map((i) => {
      let tb;
      if (sp.modus === "jeg") {
        const mine = sp.logg.filter((l) => l.k === i);
        tb = mine.reduce((s, l) => s + (l.lost ? brukt(l) : MAKS + 5), 0) / (mine.length || 1);
      } else {
        const mine = sp.logg.filter((l) => l.lost && l.g === i).map(brukt);
        tb = mine.length ? Math.min(...mine) : 99;
      }
      return { i, poeng: sp.poeng[i], tb };
    });
    rad.sort((a, b) => b.poeng - a.poeng || a.tb - b.tb || a.i - b.i);
    rad.forEach((r, n) => {
      const f = rad[n - 1];
      r.plass = f && f.poeng === r.poeng && f.tb === r.tb ? f.plass : n + 1;
    });
    return rad;
  }
  const vinnere = (rad) => (rad.length && rad[0].poeng > 0 ? rad.filter((r) => r.plass === 1) : []);
  // «Kveldens gjeng» ranks by points alone, so it gets the places as points (a tie-break counts there too).
  const kveldRader = (rad) => rad.map((r) => ({ i: r.i, poeng: vinnere(rad).length ? 100 - r.plass : 0 }));

  // The kit's podium shares a place on equal points; this one shows the places after the tie-break.
  function pallHtml(rad) {
    const alle = rad.filter((r) => r.poeng > 0);
    if (alle.length < 2) return "";
    const s = alle.slice(0, 3);
    const plass = (r) =>
      r ? `<div class="pall-plass p${Math.min(r.plass, 3)}">${R.avatar(r.i, "stor")}<span class="navn">${esc(R.navn(r.i))}</span><span class="poeng">${r.poeng} ${esc(R.t("p"))}</span><span class="blokk">${r.plass}</span></div>` : "<div></div>";
    return s.length < 3
      ? `<div class="pall to" role="group" aria-label="${esc(R.t("Pallen"))}">${plass(s[1])}${plass(s[0])}</div>`
      : `<div class="pall" role="group" aria-label="${esc(R.t("Pallen"))}">${plass(s[1])}${plass(s[0])}${plass(s[2])}</div>`;
  }
  // The kit's scoreboard in our order, with only the real winner(s) lit.
  function listeHtml(rad) {
    let html = R.ui.poengliste(rad.map((r) => ({ i: r.i, poeng: r.poeng })), { utenLeder: true });
    for (let n = vinnere(rad).length; n > 0; n--) html = html.replace('<li class="">', '<li class="leder">');
    return html;
  }

  // Every secret of a game without points: solved or not, and on how many questions.
  const sakerHtml = (sp) =>
    `<ol class="detektiv-saker">${sp.logg
      .map(
        (l) =>
          `<li class="${l.lost ? "lost" : "uopp"}"><span class="detektiv-merke" aria-hidden="true">${l.lost ? "✓" : "✕"}</span><span class="navn">${esc(ALLE[l.h].navn)}</span><span class="res">${l.lost ? esc(spmTekst(brukt(l))) : esc(R.t("uoppklart"))}</span></li>`,
      )
      .join("")}</ol>`;

  const rekordTekst = (st) => [st.bestRad >= 2 ? R.t("{n} løst på rad", { n: st.bestRad }) : "", st.raskest ? R.t("raskest på {spm}", { spm: spmTekst(st.raskest) }) : ""].filter(Boolean).join(" · ");

  function delTekst(sp) {
    const lost = sp.logg.filter((l) => l.lost);
    const raskest = lost.length ? Math.min(...lost.map(brukt)) : 0;
    const hemmeligheter = R.flertall(sp.logg.length, "hemmelighet", "hemmeligheter");
    const hode = lost.length
      ? R.t("Vi oppklarte {n} av {hemmeligheter} – raskest på {spm}!", { n: lost.length, hemmeligheter, spm: spmTekst(raskest) })
      : R.t("Ingen av {hemmeligheter} ble oppklart. Klarer dere det bedre?", { hemmeligheter });
    return `${R.t("Detektiven")} 🔎 ${hode}\n${sp.logg.map((l) => (l.lost ? "🟩" : "🟥")).join("")}`;
  }

  // ---------- The magnifying-glass meter ----------
  const C = 104;
  const RR = 86;
  const BUER = Array.from({ length: MAKS }, (_, k) => {
    const a0 = ((-90 + k * 18 + 1.9) * Math.PI) / 180;
    const a1 = ((-90 + (k + 1) * 18 - 1.9) * Math.PI) / 180;
    const p = (a) => `${(C + RR * Math.cos(a)).toFixed(2)} ${(C + RR * Math.sin(a)).toFixed(2)}`;
    return `M${p(a0)} A${RR} ${RR} 0 0 1 ${p(a1)}`;
  });
  const MERKER = HINT_VED.map((n) => {
    const a = ((-90 + n * 18) * Math.PI) / 180;
    return { n, x: (C + 99 * Math.cos(a)).toFixed(2), y: (C + 99 * Math.sin(a)).toFixed(2) };
  });
  let nySeg = -1; // the segment that was just added (animated once)

  function lupe(sp, r) {
    const svg = `<svg class="detektiv-lupe-svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <line class="skaft-kant" x1="${C + 74}" y1="${C + 74}" x2="${C + 114}" y2="${C + 114}"/>
      <line class="skaft" x1="${C + 74}" y1="${C + 74}" x2="${C + 114}" y2="${C + 114}"/>
      <circle class="ramme" cx="${C}" cy="${C}" r="98"/>
      <g>${BUER.map((d, k) => `<path class="seg${r.svar[k] ? " s-" + r.svar[k] : ""}${k === nySeg ? " ny" : ""}" d="${d}"/>`).join("")}</g>
      ${sp.hint ? MERKER.map((m) => `<g class="merke${r.spm >= m.n ? " na" : ""}"><circle cx="${m.x}" cy="${m.y}" r="11"/><text x="${m.x}" y="${m.y}" text-anchor="middle" dominant-baseline="central">💡</text></g>`).join("") : ""}
      <circle class="glass" cx="${C}" cy="${C}" r="71"/>
      <path class="glans" d="M${C - 46} ${C - 22} A52 52 0 0 1 ${C - 14} ${C - 50}"/>
    </svg>`;
    const fullt = r.spm >= MAKS;
    // The name starts with the words on the button («+1 spørsmål»), so voice control finds it.
    return `<button class="detektiv-lupe" id="detektiv-lupe" data-h="spm" data-stille${fullt ? " disabled" : ""} aria-label="${esc(fullt ? R.t("Alle 20 spørsmålene er brukt") : R.t("+1 spørsmål. {n} av {av} er brukt.", { n: r.spm, av: MAKS }))}">
      ${svg}
      <span class="detektiv-tall"><b>${r.spm}</b><small>${esc(R.t("av {n}", { n: MAKS }))}</small></span>
      ${fullt ? "" : `<span class="detektiv-pluss" aria-hidden="true">${esc(R.t("+1 spørsmål"))}</span>`}
    </button>`;
  }

  // The magnifier is the only counter (1 … 20); this line just sets the mood, without numbers.
  function statusTekst(sp, r) {
    if (r.spm === 0) return ["", sp.modus === "jeg" ? R.t("{navn} spør – dere andre svarer med knappene.", { navn: R.navn(tur(sp)) }) : R.t("Detektivene spør – du svarer med knappene.")];
    if (r.spm >= MAKS) return ["slutt", R.t("Siste sjanse! Én gjetning til.")];
    if (r.spm >= 17) return ["varsel", R.t("Snart tomt for spørsmål!")];
    if (r.spm === 10) return ["", R.t("Halvveis!")];
    return ["", R.t("Svar ærlig – «Kanskje» er også lov.")];
  }

  function hintHtml(sp, r) {
    if (!sp.hint) return "";
    const liste = hintListe(sp, r.h);
    const vist = liste
      .slice(0, r.hint)
      .map((x) => `<div class="detektiv-hintkort"><span class="etikett">${esc(x.etikett)}</span><b>${esc(x.tekst)}</b></div>`)
      .join("");
    let neste = "";
    if (r.hint < liste.length) {
      const ved = HINT_VED[r.hint];
      neste =
        r.spm >= ved
          ? R.ui.knapp2(r.hint ? R.t("Vis et hint til") : R.t("Vis hint"), "hint", { ikon: "💡", variant: "aksent" })
          : `<p class="detektiv-hint-laast"><span aria-hidden="true">💡</span> ${esc(r.hint ? R.t("Nytt hint etter {n} spørsmål", { n: ved }) : R.t("Hint etter {n} spørsmål", { n: ved }))}</p>`;
    }
    return `<section class="detektiv-hint" aria-label="${esc(R.t("Hint"))}">${vist}${neste}</section>`;
  }

  function stempel(v) {
    const sted = R.$("#detektiv-stempel");
    if (!sted) return;
    const [tekst, variant] = { j: [R.t("Ja!"), "mynte"], n: [R.t("Nei!"), ""], k: [R.t("Kanskje"), "lampe"] }[v];
    sted.innerHTML = `<span class="stempel ${variant}">${esc(tekst)}</span>`;
    clearTimeout(stempel.id);
    stempel.id = setTimeout(() => {
      sted.innerHTML = "";
    }, 950);
  }

  function tell(S, v) {
    const sp = S.spill;
    const r = sp.runde;
    if (!r || r.spm >= MAKS) return;
    r.svar.push(v);
    r.spm = r.svar.length;
    nySeg = r.spm - 1;
    R.vis();
    nySeg = -1;
    if (v === "j") R.lyd.riktig();
    else if (v === "n") R.lyd.tone(220, 0, 0.18, "square", 0.08, 160);
    else if (v === "k") {
      R.lyd.tone(520, 0, 0.1, "triangle", 0.12, 660);
      R.lyd.tone(660, 0.1, 0.12, "triangle", 0.1, 500);
    } else R.lyd.tikk();
    R.vibrer(12);
    if (v !== "x") stempel(v);
    // A hint just became available: the button under the answers lights up (no toast on top of it).
    const liste = sp.hint ? hintListe(sp, r.h) : [];
    const hintKlart = sp.hint && HINT_VED.indexOf(r.spm) >= r.hint && HINT_VED.indexOf(r.spm) < liste.length;
    if (hintKlart) setTimeout(() => R.lyd.pling(), 180);
    if (r.spm === MAKS) {
      R.lyd.alarm();
      R.vibrer([120, 60, 120]);
      R.si(R.t("Alle 20 spørsmålene er brukt. Siste sjanse til å gjette."));
    } else R.si(`${R.t("{n} av {av}", { n: r.spm, av: MAKS })}${hintKlart ? ". " + R.t("Et hint er klart.") : ""}`);
  }

  const ANGRE_IKON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 4.5 3.5 9.5l5 5"/><path d="M4 9.5h10.5a5.5 5.5 0 0 1 0 11H10"/></svg>';

  let dramatikk = false; // the next reveal gets a drum roll (only right after an unsolved secret)

  R.start({
    id: "detektiven",
    versjon: 1,
    pagar, // a game is in progress (front page badge, screen kept awake)
    liggende: false, // landscape phones: this game has its own layout (a slim dock at the bottom, see spill.css)

    tilstand: () => ({
      antall: 3,
      oppsett: { modus: "spm", kategorier: KAT.map((k) => k.id), nivaa: 2, antallH: null, hint: true, katV: 2 },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "spm", kategorier: [], nivaa: 2, antallH: null, hint: true }, S.oppsett));
      if (!erModus(o.modus)) o.modus = "spm";
      o.kategorier = (Array.isArray(o.kategorier) ? o.kategorier : []).filter((id) => kat(id));
      // «Jul» arrived later: a phone that had every category switched on gets it too (once).
      if (o.katV !== 2) {
        if (KAT.every((k) => k.id === "jul" || o.kategorier.includes(k.id)) && !o.kategorier.includes("jul")) o.kategorier.push("jul");
        o.katV = 2;
      }
      if (!o.kategorier.length) o.kategorier = KAT.map((k) => k.id);
      if (![1, 2, 3].includes(o.nivaa)) o.nivaa = 2;
      o.antallH = Number.isInteger(o.antallH) && o.antallH >= 1 && o.antallH <= MAKS_H ? o.antallH : null;
      delete o.runder; // (the length used to be «én/to/tre hver»)
      o.hint = o.hint !== false;
      const sp = S.spill;
      if (sp) {
        const gyldigH = (h) => Number.isInteger(h) && h >= 0 && h < ALLE.length;
        const ok =
          Number.isInteger(sp.antall) &&
          sp.antall >= 2 &&
          sp.antall <= 20 &&
          Array.isArray(sp.poeng) &&
          sp.poeng.length === sp.antall &&
          Array.isArray(sp.logg) &&
          sp.logg.every((l) => l && gyldigH(l.h) && l.pluss && typeof l.pluss === "object") &&
          Array.isArray(sp.kategorier) &&
          sp.kategorier.every((id) => kat(id)) &&
          (!sp.runde || (gyldigH(sp.runde.h) && Array.isArray(sp.runde.svar)));
        if (!ok) S.spill = null;
        else {
          // A game saved by the first version: 20 spørsmål, «n hver», keepers from the first player.
          if (!erModus(sp.modus)) sp.modus = "spm";
          if (!Number.isInteger(sp.start) || sp.start < 0 || sp.start >= sp.antall) sp.start = 0;
          if (!Number.isInteger(sp.totalt) || sp.totalt < 1) sp.totalt = sp.antall * ([1, 2, 3].includes(sp.runder) ? sp.runder : 1);
          sp.logg.forEach((l) => {
            if (typeof l.lost !== "boolean") l.lost = l.g >= 0;
            if (!Number.isInteger(l.g)) l.g = -1;
            if (!Number.isInteger(l.k) || l.k < 0 || l.k >= sp.antall) l.k = 0;
            l.spm = R.klamp(Number(l.spm) || 0, 0, MAKS);
          });
          if (sp.runde) {
            sp.runde.svar = sp.runde.svar.slice(0, MAKS);
            sp.runde.spm = sp.runde.svar.length;
            sp.runde.hint = R.klamp(Number(sp.runde.hint) || 0, 0, HINT_VED.length);
          }
        }
      }
      const spillSkjerm = ["gi", "hemmelig", "avhor", "hvem", "avsloring", "slutt"];
      if (!S.spill && spillSkjerm.includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && !S.spill.runde && ["gi", "hemmelig", "avhor", "hvem"].includes(S.skjerm)) {
        if (ferdig(S.spill) || S.spill.ferdig) S.skjerm = S.spill.logg.length ? "slutt" : "hjem";
        else {
          nyRunde(S);
          S.skjerm = "gi";
        }
      }
      if (S.spill && (S.skjerm === "avsloring" || S.skjerm === "slutt") && !S.spill.logg.length) S.skjerm = "hjem";
    },

    regler: {
      intro: R.t("Noen har en hemmelighet – og den skal finnes med ja/nei-spørsmål. Høyst 20!"),
      steg: [
        [R.t("Se hemmeligheten"), R.t("I «20 spørsmål» holder én inne kortet og ser hemmeligheten selv. I «Hvem er jeg?» er det omvendt: Alle ser kortet – unntatt den som skal gjette.")],
        [R.t("Still ja/nei-spørsmål"), R.t("Spør etter tur: «Er det et dyr?» Svar Ja, Nei eller Kanskje – mobilen teller spørsmålene.")],
        [R.t("Gjett!"), R.t("Tror du at du vet svaret? Gjett – det teller også som et spørsmål. Riktig? Trykk på den store knappen.")],
      ],
      tips: [
        R.t("I «20 spørsmål» gir riktig gjetning 2 poeng. Løst på 10 spørsmål eller færre? Da får de andre detektivene 1 poeng hver."),
        R.t("Den med hemmeligheten får 1 poeng hvis den holder i 15 spørsmål, 2 hvis den holder i alle 20 – og 3 hvis ingen klarer det."),
        R.t("I «Hvem er jeg?» får den som gjetter, 3 poeng for å klare det på 10 spørsmål, 2 på 15 og 1 på 20."),
        R.t("«Alle mot hemmeligheten» er uten poeng: Dere samarbeider om å bruke færrest mulig spørsmål."),
        R.t("Gjetter du feil, står du over neste spørsmål. Da lønner det seg ikke å gjette vilt."),
        R.t("Etter 10 og 15 spørsmål kan dere få et hint. Usikker på svaret? Trykk «Kanskje»."),
      ],
    },

    hemmelig: {
      innhold(S) {
        const sp = S.spill;
        const r = sp && sp.runde;
        if (!r) return { html: "" };
        const w = ALLE[r.h];
        const k = kat(w.k);
        return {
          klasse: "aksent",
          html: `<span class="kort-etikett">${sp.modus === "jeg" ? esc(R.t("{navn} er", { navn: R.navn(tur(sp)) })) : esc(R.t("Du er"))}</span>
            <span class="kort-ord ${R.lengdeKlasse(w.navn)}">${esc(w.navn)}</span>
            <span class="kort-pille">${k.ikon} ${esc(k.navn)}</span>
            <span class="kort-fot">${esc(w.hjelp)}</span>`,
        };
      },
      sett(S) {
        const r = S.spill && S.spill.runde;
        if (!r || r.sett) return;
        r.sett = true;
        r.ny = false;
        if (S.skjerm === "hemmelig") R.vis();
        else R.lagre();
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        liggende: true, // (the kit's landscape home: mascot left, buttons right)
        vis: (S) => {
          const sp = S.spill;
          const fortsettTekst = !sp
            ? ""
            : sp.runde && sp.runde.spm
              ? R.t("Fortsett · spørsmål {n} av {av}", { n: sp.runde.spm, av: MAKS })
              : ferdig(sp)
                ? rangert(sp)
                  ? R.t("Fortsett · se vinneren")
                  : R.t("Fortsett · se rapporten")
                : R.t("Fortsett · hemmelighet {n} av {av}", { n: Math.min(sp.logg.length + 1, sp.totalt), av: sp.totalt });
          const st = lesStat();
          const rekord = rekordTekst(st);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Én har en hemmelighet."))}<br><em>${esc(R.t("De andre har 20 spørsmål."))}</em>`,
            knapperHtml:
              R.ui.startKnapper({ pagar: pagar(S), fortsettTekst }) +
              (rekord ? `<p class="detektiv-rekord"><span class="etikett">${esc(R.t("Rekord"))}</span> <b>${esc(rekord)}</b></p>` : "") +
              R.ui.lenke(R.t("Slik spiller du"), "regler"),
            merker: [["2–20", R.t("spillere")], [String(ALLE.length), R.t("hemmeligheter")]].concat(st.lost ? [[R.tall(st.lost), R.t("oppklart")]] : []),
          });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = antallI(o);
          const t = antallH(S);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvordan spiller dere?"))}</h2>
              ${R.ui.fliser("modus", MODUSER, o.modus, { en: true })}
            </section>
            ${R.ui.spillere({ min: 2, max: 20, hjelp: o.modus === "jeg" ? R.t("Alle gjetter etter tur.") : R.t("Hemmeligheten går på rundgang.") })}
            <section class="seksjon">
              <h2>${esc(R.t("Lengde"))}</h2>
              ${R.ui.teller("antall-h", t, 1, MAKS_H, { enhet: R.t("hemmelighet|hemmeligheter", { n: t }), minus: R.t("Færre hemmeligheter"), pluss: R.t("Flere hemmeligheter") })}
              <p class="hjelp">${esc(lengdeTekst(o.modus, t, spillere(S)))}</p>
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Kategorier"))}</h2><span class="tall">${esc(R.t("{n} hemmeligheter", { n }))}</span></div>
              ${R.ui.brikker(
                "kat",
                KAT.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: antallKat(k.id, o.nivaa) })),
                o.kategorier,
                { alle: true, etikett: R.t("Kategorier") },
              )}
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Vanskelighet"))}</h2>
              ${R.ui.seg("nivaa", NIVAER, o.nivaa, { etikett: R.t("Vanskelighet") })}
              <p class="hjelp">${esc(NIVA_TEKST[o.nivaa])}</p>
            </section>
            ${R.ui.bryter("hint-valg", o.hint, R.t("Hint underveis"), R.t("Etter 10 og 15 spørsmål kan detektivene få et lite hint."))}
            ${R.ui.dokk(n ? "" : `<p class="hjelp">${esc(R.t("Velg minst én kategori."))}</p>`, R.ui.knapp(R.t("Start"), "start", { av: !n }))}`;
        },
      },

      // Who gets the phone – or, in «Hvem er jeg?», who has to look away.
      gi: {
        tittel: (S) => R.t("Hemmelighet {n} av {av}", { n: S.spill.logg.length + 1, av: S.spill.totalt }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const k = tur(sp);
          const jeg = sp.modus === "jeg";
          // The dots are the players: who has had the role in this lap, and whose turn it is.
          const runde = sp.logg.slice(Math.floor(sp.logg.length / sp.antall) * sp.antall).map((l) => l.k);
          return `
            ${R.ui.fremdrift(sp.antall, k, runde)}
            <div class="gi-til">
              <span class="gi-til-avatar">${R.avatar(k, "gigant")}<span class="gi-til-merke">${jeg ? "🙈" : "🤫"}</span></span>
              <p class="etikett">${esc(jeg ? R.t("Nå skal denne gjette") : R.t("Hemmeligheten går til"))}</p>
              <h1 id="skjerm-tittel">${esc(R.navn(k))}</h1>
              <p class="ikke-se">🙈 ${esc(jeg ? R.t("{navn} ser bort", { navn: R.navn(k) }) : R.t("De andre ser bort"))}</p>
            </div>
            ${R.ui.dokk(R.ui.knapp(jeg ? R.t("Vis kortet til de andre") : R.t("Jeg er {navn}", { navn: R.navn(k) }), "jeg-er"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          S.spill.skjerm = "gi";
        },
      },

      hemmelig: {
        tittel: R.t("Hemmelig"),
        tilbake: "gi",
        gjenoppta: "gi",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const navn = R.navn(tur(sp));
          const jeg = sp.modus === "jeg";
          // One short line: it has to fit between the card and the buttons on the smallest phones.
          const hjelp = r.ny
            ? R.t("Ny hemmelighet – hold for å se den.")
            : jeg
              ? r.sett
                ? R.t("Klart? Da kan gjetteren snu seg.")
                : R.t("Alle unntatt gjetteren får se.")
              : r.sett
                ? R.t("Husk den godt – og hold pokerfjes!")
                : R.t("Slipp, så skjules det igjen.");
          return `
            <div class="detektiv-hode">
              <p class="ikke-se">🙈 ${esc(jeg ? R.t("{navn} må ikke se!", { navn }) : R.t("Bare {navn} ser", { navn }))}</p>
              <h1 id="skjerm-tittel">${esc(jeg ? R.t("Hvem er {navn}?", { navn }) : R.t("Din hemmelighet"))}</h1>
            </div>
            ${R.ui.mappe({ id: "kort", etikett: R.t("Topphemmelig"), tekst: R.t("Hold fingeren på kortet for å se") })}
            <p class="hjelp">${esc(hjelp)}</p>
            ${R.ui.dokk(
              R.ui.knapp(r.sett ? R.t("Start avhøret") : R.t("Se kortet først"), "start-avhor", { av: !r.sett }),
              R.ui.lenkerad(R.ui.lenke(jeg ? R.t("Ukjent for dere? Trekk en ny") : R.t("Kjenner du den ikke? Trekk en ny"), "ny-hemmelighet")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "hemmelig";
        },
      },

      avhor: {
        tittel: R.t("Avhøret"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const k = tur(sp);
          const jeg = sp.modus === "jeg";
          const [klasse, status] = statusTekst(sp, r);
          const fullt = r.spm >= MAKS;
          // stille: the answer has its own sound, so no kit click on top of it.
          const svar = (tekst, v, variant) => R.ui.knapp(tekst, "svar", { v, variant, stille: true, etikett: R.t("{svar} – teller som ett spørsmål", { svar: tekst }) });
          // With one possible guesser the button names that player, and no «Hvem gjettet det?» follows.
          const gjettet = jeg
            ? R.t("{navn} gjettet det!", { navn: R.navn(k) })
            : sp.modus === "spm" && sp.antall === 2
              ? R.t("{navn} gjettet det!", { navn: R.navn((k + 1) % 2) })
              : R.t("Noen gjettet det!");
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Avhøret: {n} av {av} spørsmål brukt", { n: r.spm, av: MAKS }))}</h1>
            <div class="detektiv-avhor">
              <div class="detektiv-lupe-sted">
                ${lupe(sp, r)}
                <div class="detektiv-stempel" id="detektiv-stempel" aria-hidden="true"></div>
              </div>
              <div class="detektiv-styring">
                <p class="detektiv-status ${klasse}">${esc(status)}</p>
                ${fullt ? "" : `<div class="knapprad tre detektiv-svar">${svar(R.t("Ja"), "j", "mynte")}${svar(R.t("Nei"), "n", "rosa")}${svar(R.t("Kanskje"), "k", "lampe")}</div>`}
                ${r.spm ? `<button class="detektiv-angre" id="detektiv-angre" data-h="angre" aria-label="${esc(R.t("Angre siste spørsmål"))}">${ANGRE_IKON}${esc(R.t("Angre"))}</button>` : ""}
                ${hintHtml(sp, r)}
              </div>
            </div>
            <div class="dokk${fullt ? " detektiv-dokk-tre" : ""}">
              ${R.ui.knapp(gjettet, "gjettet")}
              ${fullt ? R.ui.knapp2(jeg ? R.t("{navn} klarte det ikke", { navn: R.navn(k) }) : R.t("Ingen klarte det"), "ingen") : ""}
              ${R.ui.lenkerad(R.ui.lenke(R.t("Se kortet"), "se-kortet"), fullt ? "" : R.ui.lenke(R.t("Gi opp"), "gi-opp"), R.ui.lenke(R.t("Avslutt"), "avslutt"))}
            </div>`;
        },
        inn(S) {
          S.spill.skjerm = "avhor";
        },
      },

      // «20 spørsmål» with three or more: which detective said it?
      hvem: {
        tittel: R.t("Avhøret"),
        tilbake: "avhor",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const k = tur(sp);
          const andre = Array.from({ length: sp.antall }, (_, i) => i).filter((i) => i !== k);
          const n = medGjett(r.spm);
          const holdt = holdtPoeng(r.spm);
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${esc(R.t("Løst på {spm}", { spm: spmTekst(n) }))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Hvem gjettet det?"))}</h1>
            </div>
            ${R.ui.velgere("gjetter", andre, null)}
            <p class="hjelp">${esc(R.t("Riktig svar gir 2 poeng."))}${n <= 10 ? " " + esc(R.t("De andre detektivene får 1 hver for godt samarbeid.")) : ""}${
              holdt
                ? " " +
                  esc(
                    r.spm >= MAKS
                      ? R.t("{navn} får {n} for å ha holdt ut i alle 20 spørsmål.", { navn: R.navn(k), n: holdt })
                      : R.t("{navn} får {n} for å ha holdt ut i 15 spørsmål.", { navn: R.navn(k), n: holdt }),
                  )
                : ""
            }</p>
            ${R.ui.dokk(R.ui.knapp2(R.t("Ingen likevel – spill videre"), "tilbake-avhor"))}`;
        },
        inn(S) {
          S.spill.skjerm = "hvem";
        },
      },

      avsloring: {
        tittel: R.t("Avsløringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const l = sp.logg[sp.logg.length - 1];
          const w = ALLE[l.h];
          const k = kat(w.k);
          const n = brukt(l);
          const jeg = sp.modus === "jeg";
          const sammen = sp.modus === "sammen";
          const neste = ferdig(sp) ? R.ui.knapp(sammen ? R.t("Til rapporten") : R.t("Til kåringen"), "neste", { variant: "stor" }) : R.ui.knapp(R.t("Neste: {navn}", { navn: R.navn(tur(sp)) }), "neste", { variant: "stor" });
          if (dramatikk) {
            return `
              <div class="detektiv-avsloring spenning">
                <p class="etikett">${esc(l.opp ? R.t("Avsløringen kommer …") : jeg ? R.t("{navn} klarte det ikke!", { navn: R.navn(l.k) }) : R.t("Ingen klarte det!"))}</p>
                <h1 id="skjerm-tittel">${esc(R.t("{navn} var …", { navn: R.navn(l.k) }))}</h1>
                <div class="papirboks detektiv-fasit" aria-hidden="true"><span class="detektiv-spm-tegn">?</span></div>
              </div>`;
          }
          const tittel = l.lost
            ? sammen
              ? R.t("Løst på {spm}!", { spm: spmTekst(n) })
              : R.t("{navn} klarte det!", { navn: R.navn(l.g) })
            : jeg
              ? R.t("{navn} fant det ikke ut", { navn: R.navn(l.k) })
              : R.t("Hemmeligheten holdt!");
          const ingress = l.lost ? (sammen ? "" : R.t("Løst på {spm}.", { spm: spmTekst(n) })) : l.opp ? R.t("Avslørt etter {spm}.", { spm: spmTekst(l.spm) }) : R.t("Alle {n} spørsmålene ble brukt.", { n: MAKS });
          const st = lesStat();
          const rekord =
            l.ny === "raskest"
              ? `⚡ ${R.t("Ny rekord: løst på {spm}!", { spm: spmTekst(n) })}`
              : l.ny === "rad"
                ? `🔥 ${R.t("Ny rekord: {n} løst på rad!", { n: st.rad })}`
                : sammen && l.lost && st.rad >= 2
                  ? `🔥 ${R.t("{n} løst på rad", { n: st.rad })}`
                  : "";
          const grunn = (i) => {
            if (jeg) return R.t("fant det ut på {spm}", { spm: spmTekst(n) });
            if (l.lost && i === l.g) return R.t("riktig gjetning");
            if (i === l.k) return !l.lost && !l.opp ? R.t("ingen klarte det") : l.spm >= MAKS ? R.t("holdt ut i alle 20 spørsmålene") : R.t("holdt ut i 15 spørsmål");
            return R.t("godt samarbeid");
          };
          const plussListe = Object.keys(l.pluss)
            .map(Number)
            .sort((a, b) => l.pluss[b] - l.pluss[a] || a - b)
            .map((i) => `<li>${R.avatar(i)}<span class="navn">${esc(R.navn(i))}</span><span class="grunn">${esc(grunn(i))}</span><b>+${l.pluss[i]}</b></li>`)
            .join("");
          const rader = sp.poeng.map((poeng, i) => ({ i, poeng, pluss: l.pluss[i] || 0 }));
          const resten = sammen
            ? `<section class="seksjon">
                <div class="seksjon-hode"><h2>${esc(R.t("Så langt"))}</h2><span class="tall">${esc(R.t("{n} av {hemmeligheter}", { n: sp.logg.length, hemmeligheter: R.flertall(sp.totalt, "hemmelighet", "hemmeligheter") }))}</span></div>
                ${sakerHtml(sp)}
              </section>`
            : `<section class="seksjon">
                <h2>${esc(R.t("Poeng denne runden"))}</h2>
                ${plussListe ? `<ul class="detektiv-pluss-liste">${plussListe}</ul>` : `<p class="detektiv-ingen-poeng">${esc(R.t("Ingen poeng denne runden."))}</p>`}
              </section>
              <section class="seksjon">
                <div class="seksjon-hode"><h2>${esc(R.t("Stillingen"))}</h2><span class="tall">${esc(R.t("{n} av {hemmeligheter}", { n: sp.logg.length, hemmeligheter: R.flertall(sp.totalt, "hemmelighet", "hemmeligheter") }))}</span></div>
                ${R.ui.poengliste(rader)}
              </section>`;
          return `
            <div class="detektiv-avsloring ${l.lost ? "lost" : "uopp"}">
              <div class="stempel-sted"><span class="stempel ${l.lost ? "mynte" : ""}">${esc(l.lost ? R.t("Løst!") : R.t("Uoppklart"))}</span></div>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <div class="papirboks detektiv-fasit">
                <span class="etikett">${esc(R.t("{navn} var", { navn: R.navn(l.k) }))}</span>
                <span class="kort-ord ${R.lengdeKlasse(w.navn)}">${esc(w.navn)}</span>
                <span class="kort-pille">${k.ikon} ${esc(k.navn)}</span>
              </div>
              ${ingress ? `<p class="ingress">${esc(ingress)}</p>` : ""}
              ${rekord ? `<p class="detektiv-nyrekord">${esc(rekord)}</p>` : ""}
            </div>
            ${resten}
            ${R.ui.dokk(neste, R.ui.lenkerad(R.ui.lenke(sammen ? R.t("Angre") : R.t("Angre poengene"), "angre-poeng"), ferdig(sp) ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          S.spill.skjerm = "avsloring";
          const l = S.spill.logg[S.spill.logg.length - 1];
          // A round is a small win: confetti only for a really quick solve; the big fanfare is saved for the end.
          if (dramatikk) {
            const fortsatt = R.vakt();
            R.lyd.trommevirvel(1.2);
            setTimeout(() => {
              dramatikk = false;
              if (!fortsatt()) return; // left the screen during the drum roll
              R.vis();
              R.vibrer([60, 40, 120]);
            }, 1300);
          } else if (l && l.lost) {
            R.lyd.riktig();
            if (brukt(l) <= 5) R.konfetti();
          }
        },
      },

      // «Kåringen» when there are points; the report of the case when the group played as one.
      slutt: {
        tittel: (S) => (rangert(S.spill) ? R.t("Kåringen") : R.t("Rapporten")),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const dokk = R.ui.flereSpill({ antall: sp.antall }) + R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`));
          const losteRunder = sp.logg.filter((l) => l.lost).sort((a, b) => brukt(a) - brukt(b));
          const holdte = sp.logg.filter((l) => !l.lost).sort((a, b) => b.spm - a.spm);
          const st = lesStat();
          const fakta = [];
          if (!rangert(sp)) {
            const alle = losteRunder.length === sp.logg.length;
            const snitt = losteRunder.length ? Math.round((losteRunder.reduce((s, l) => s + brukt(l), 0) / losteRunder.length) * 10) / 10 : 0;
            if (losteRunder.length) fakta.push(["⚡", R.t("Raskeste oppklaring"), R.t("«{hemmelighet}» på {spm}", { hemmelighet: ALLE[losteRunder[0].h].navn, spm: spmTekst(brukt(losteRunder[0])) })]);
            if (rekordTekst(st)) fakta.push(["🏆", R.t("Rekord på denne mobilen"), rekordTekst(st)]);
            return `
              ${R.ui.banner({
                klasse: "aksent",
                etikett: R.t("Alle mot hemmeligheten"),
                tittel: !losteRunder.length
                  ? R.t("Ingen oppklart denne gangen")
                  : alle && sp.logg.length > 1
                    ? R.t("Alle {n} oppklart!", { n: sp.logg.length })
                    : R.t("{n} av {av} oppklart!", { n: losteRunder.length, av: sp.logg.length }),
                tekst: losteRunder.length ? R.t("I snitt {n} spørsmål per oppklaring.", { n: R.tall(snitt) }) : R.t("Hemmelighetene holdt. Prøv igjen – nå kjenner dere knepene!"),
                stemning: !losteRunder.length ? "lei" : alle ? "jubel" : "",
              })}
              ${sakerHtml(sp)}
              ${fakta.length ? `<ul class="detektiv-fakta">${fakta.map(([ikon, t, x]) => `<li><span aria-hidden="true">${ikon}</span><p><b>${esc(t)}</b> ${esc(x)}</p></li>`).join("")}</ul>` : ""}
              ${R.ui.knapp2(R.t("Del resultatet"), "del")}
              ${dokk}`;
          }
          const rad = rangering(sp);
          const vant = vinnere(rad);
          const avgjort = vant.length === 1 && rad.length > 1 && rad[1].poeng === rad[0].poeng; // equal points, decided by the tie-break
          const jeg = sp.modus === "jeg";
          if (losteRunder.length) {
            const l = losteRunder[0];
            fakta.push(["⚡", R.t("Raskeste oppklaring"), R.t("{navn} fant «{hemmelighet}» på {spm}", { navn: R.navn(l.g), hemmelighet: ALLE[l.h].navn, spm: spmTekst(brukt(l)) })]);
          }
          if (holdte.length)
            fakta.push(
              jeg
                ? ["🔒", R.t("Vanskeligste nøtt"), R.t("«{hemmelighet}» – {navn} fant det ikke ut", { hemmelighet: ALLE[holdte[0].h].navn, navn: R.navn(holdte[0].k) })]
                : ["🔒", R.t("Best bevarte hemmelighet"), R.t("{navn} som «{hemmelighet}»", { navn: R.navn(holdte[0].k), hemmelighet: ALLE[holdte[0].h].navn })],
            );
          const utenTur = jeg && rad.length < sp.antall;
          return `
            ${R.ui.banner({
              klasse: "aksent",
              etikett: vant.length > 1 ? R.t("Like gode detektiver") : vant.length ? R.t("Mesterdetektiven") : R.t("Ferdig!"),
              tittel: vant.length ? R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vant.map((r) => R.navn(r.i))), n: vant.length }) : R.t("Ingen poeng denne gangen"),
              tekst: avgjort ? (jeg ? R.t("Likt på poeng – {navn} brukte færrest spørsmål.", { navn: R.navn(vant[0].i) }) : R.t("Likt på poeng – raskeste oppklaring avgjorde.")) : "",
              stemning: vant.length ? "jubel" : "",
            })}
            ${pallHtml(rad)}
            ${listeHtml(rad)}
            ${utenTur ? `<p class="hjelp">${esc(R.t("Bare de som rakk å gjette, er med i kåringen."))}</p>` : ""}
            ${fakta.length ? `<ul class="detektiv-fakta">${fakta.map(([ikon, t, x]) => `<li><span aria-hidden="true">${ikon}</span><p><b>${esc(t)}</b> ${esc(x)}</p></li>`).join("")}</ul>` : ""}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          sp.skjerm = "slutt";
          sp.ferdig = true;
          R.slippVaken();
          const lost = sp.logg.filter((l) => l.lost).length;
          if (!sp.meldt) {
            // Once per game: the evening's scoreboard (only when players are ranked) and the statistics.
            sp.meldt = true;
            R.statistikk("ferdig", { modus: sp.modus, runder: sp.logg.length, lost });
            if (rangert(sp)) R.kveld.registrer(kveldRader(rangering(sp)));
          }
          // Celebrate in proportion: a winner, or every secret solved together.
          if (rangert(sp) ? sp.poeng.some((p) => p > 0) : lost === sp.logg.length) {
            R.lyd.fanfare();
            R.konfetti();
          } else if (lost) R.lyd.riktig();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp) return R.gaTil("oppsett");
        if (sp.runde) return R.gaTil(["gi", "hemmelig", "avhor", "hvem"].includes(sp.skjerm) ? sp.skjerm : "gi");
        R.gaTil(ferdig(sp) ? "slutt" : "avsloring");
      },

      // --- setup ---
      modus(el, e, S) {
        if (!erModus(el.dataset.v)) return;
        S.oppsett.modus = el.dataset.v;
        S.oppsett.antallH = null; // the natural length differs from mode to mode
        R.vis();
      },
      "antall-h"(el, e, S) {
        const n = R.klamp(antallH(S) + Number(el.dataset.v), 1, MAKS_H);
        // Back on the natural length: follow the group again when players come and go.
        S.oppsett.antallH = n === autoAntall(S.oppsett.modus, spillere(S)) ? null : n;
        R.vis();
      },
      kat(el, e, S) {
        const o = S.oppsett;
        const id = el.dataset.v;
        if (id === "*") o.kategorier = o.kategorier.length === KAT.length ? [] : KAT.map((k) => k.id);
        else o.kategorier = o.kategorier.includes(id) ? o.kategorier.filter((x) => x !== id) : [...o.kategorier, id];
        R.vis();
      },
      nivaa(el, e, S) {
        S.oppsett.nivaa = Number(el.dataset.v);
        R.vis();
      },
      "hint-valg"(el, e, S) {
        S.oppsett.hint = !S.oppsett.hint;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!antallI(o)) return;
        const antall = spillere(S);
        const forrige = S.spill; // «Spill igjen»: the role goes on round the table from where it stopped
        S.spill = {
          modus: o.modus,
          antall,
          totalt: antallH(S),
          start: forrige && forrige.antall === antall && Number.isInteger(forrige.start) ? (forrige.start + forrige.logg.length) % antall : 0,
          kategorier: o.kategorier.slice(),
          nivaa: o.nivaa,
          hint: o.hint,
          poeng: Array.from({ length: antall }, () => 0),
          logg: [],
          runde: null,
          skjerm: "gi",
        };
        nyRunde(S);
        R.statistikk("start", { modus: o.modus, spillere: antall, hemmeligheter: S.spill.totalt, nivaa: o.nivaa });
        R.gaTil("gi"); // the kit keeps the screen awake while pagar(S) is true
      },

      // --- the secret ---
      "jeg-er": () => R.gaTil("hemmelig"),
      "ny-hemmelighet"(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || r.spm) return;
        r.h = trekk(S);
        r.sett = false;
        r.ny = true; // said in the line under the card (a toast would cover the heading)
        R.vis();
        R.lyd.snu();
        R.si(R.t("Ny hemmelighet trukket."));
      },
      // No countdown: nothing is timed, so the first question can come right away.
      "start-avhor"(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || !r.sett) return;
        R.gaTil("avhor");
      },

      // --- questioning ---
      spm: (el, e, S) => tell(S, "x"),
      svar: (el, e, S) => tell(S, el.dataset.v),
      angre(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || !r.spm) return;
        r.svar.pop();
        r.spm = r.svar.length;
        R.vis();
        // The undo button is gone when the meter is back at zero: hand the focus to the meter.
        if (!r.spm && !R.$("#detektiv-angre")) {
          const lupeEl = R.$("#detektiv-lupe");
          if (lupeEl && document.activeElement === document.body) lupeEl.focus({ preventScroll: true });
        }
        R.si(R.t("Angret. {n} av {av}", { n: r.spm, av: MAKS }));
      },
      hint(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.runde;
        if (!r) return;
        const liste = hintListe(sp, r.h);
        if (r.hint >= liste.length || r.spm < HINT_VED[r.hint]) return;
        r.hint += 1;
        R.vis();
        R.lyd.pling();
        // The button that was pressed is gone: put the focus on the hint it gave.
        const kort = R.$$(".detektiv-hintkort").pop();
        if (kort && !R.$('#skjerm [data-h="hint"]')) {
          kort.setAttribute("tabindex", "-1");
          kort.focus({ preventScroll: true });
        }
        R.si(R.t("Hint: {etikett}: {tekst}", { etikett: liste[r.hint - 1].etikett, tekst: liste[r.hint - 1].tekst }));
      },
      "se-kortet"(el, e, S) {
        const sp = S.spill;
        R.ark(`
          <h2 id="ark-tittel">${esc(sp && sp.modus === "jeg" ? R.t("Kortet") : R.t("Kortet ditt"))}</h2>
          <p class="ingress">${esc(sp && sp.modus === "jeg" ? R.t("Bare for dere som svarer – {navn} ser bort!", { navn: R.navn(tur(sp)) }) : R.t("Bare for den som har hemmeligheten!"))}</p>
          ${R.ui.mappe({ id: "kort", etikett: R.t("Topphemmelig"), tekst: R.t("Hold fingeren på kortet for å se") })}
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Ferdig"))}</button>`);
      },
      gjettet(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.runde) return;
        if (sp.modus === "spm" && sp.antall > 2) return R.gaTil("hvem");
        // One possible guesser: the one on turn («Hvem er jeg?») or the only detective (two players).
        const k = tur(sp);
        avsluttRunde(S, { lost: true, g: sp.modus === "jeg" ? k : sp.modus === "spm" ? (k + 1) % 2 : -1 });
        dramatikk = false;
        R.gaTil("avsloring");
      },
      "tilbake-avhor": () => R.gaTil("avhor"),
      gjetter(el, e, S) {
        const sp = S.spill;
        const g = Number(el.dataset.v);
        if (!sp || !sp.runde || !(g >= 0 && g < sp.antall) || g === tur(sp)) return;
        avsluttRunde(S, { lost: true, g });
        dramatikk = false;
        R.gaTil("avsloring");
      },
      ingen(el, e, S) {
        if (!S.spill || !S.spill.runde) return;
        avsluttRunde(S, { lost: false });
        dramatikk = true;
        R.gaTil("avsloring");
      },
      async "gi-opp"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.runde) return;
        const fortsatt = R.vakt();
        const r = sp.runde;
        const navn = R.navn(tur(sp));
        const holdt = holdtPoeng(r.spm);
        const tekst =
          sp.modus === "spm"
            ? holdt
              ? R.t("Hemmeligheten blir avslørt. {navn} får {n} poeng for å ha holdt ut i 15 spørsmål.", { navn, n: holdt })
              : R.t("Hemmeligheten blir avslørt, og ingen får poeng for den.")
            : sp.modus === "jeg"
              ? R.t("Hemmeligheten blir avslørt, og {navn} får ingen poeng for den.", { navn })
              : R.t("Hemmeligheten blir avslørt og teller som uoppklart.");
        const ja = await R.bekreft(R.t("Gi opp?"), tekst, R.t("Avslør den"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp || sp.runde !== r) return;
        avsluttRunde(S, { lost: false, opp: true });
        dramatikk = true;
        R.gaTil("avsloring");
      },
      // Ending early is always just «Avslutt»: the secret in play does not count, the rest does.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return R.gaTil("hjem");
        const fortsatt = R.vakt();
        const hvor = rangert(sp) ? R.t("Dere går rett til kåringen.") : R.t("Dere går rett til rapporten.");
        const tekst = !sp.logg.length ? R.t("Ingen hemmeligheter er avslørt ennå, så spillet blir bare borte.") : sp.runde ? `${R.t("Hemmeligheten dere holder på med, teller ikke.")} ${hvor}` : hvor;
        const ja = await R.bekreft(R.t("Avslutte spillet?"), tekst, R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (!sp.logg.length) {
          S.spill = null;
          R.slippVaken();
          return R.gaTil("hjem");
        }
        sp.runde = null;
        R.gaTil("slutt");
      },

      // --- after the round ---
      "angre-poeng"(el, e, S) {
        const sp = S.spill;
        const l = sp && sp.logg.pop();
        if (!l) return;
        Object.keys(l.pluss).forEach((i) => (sp.poeng[i] -= l.pluss[i]));
        if (sp.statFor) R.skriv(STAT, sp.statFor);
        sp.statFor = null;
        sp.runde = { h: l.h, sett: true, spm: l.spm, svar: l.svar || [], hint: l.hint || 0 };
        R.toast(rangert(sp) ? R.t("Poengene er tatt tilbake") : R.t("Avhøret fortsetter"));
        R.gaTil("avhor");
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (ferdig(sp)) return R.gaTil("slutt");
        nyRunde(S);
        R.gaTil("gi");
      },
      igjen: (el, e, S) => H.start(el, e, S),
      del(el, e, S) {
        if (S.spill) R.del(R.t("Detektiven"), delTekst(S.spill), DEL_URL);
      },
    }),
  });
})();
