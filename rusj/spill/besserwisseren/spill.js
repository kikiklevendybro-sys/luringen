/* Besserwisseren — a party quiz on one phone.
   The quizmaster reads the question and four options aloud and everyone answers. «Vis svaret»
   lights up the right option with a short fun fact; then (when playing for points) the next step
   asks who – or which team – got it right. Harder questions give more points, and the last
   scoring can be undone. Playing alone? Tap your answer directly. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;

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
  const NIVA = { 1: "Lett", 2: "Middels", 3: "Vanskelig" };
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
  const poengTekst = (n) => (n === 1 ? "1 poeng" : `${n} poeng`);
  const lagNavn = (i) => "Lag " + R.LAG[i].navn;
  const deltakerNavn = (sp, i) => (sp.modus === "lag" ? lagNavn(i) : R.navn(i));
  const erSolo = (sp) => sp.modus === "spillere" && sp.deltakere === 1;
  const girPoeng = (sp) => sp.modus !== "fri" && !erSolo(sp); // the quizmaster hands out points
  const naa = (sp) => ALLE[sp.liste[sp.nr]];
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  // "A", "A og B", "A, B og C"
  const oppramsing = (navn) => R.ramsOpp(navn);

  // "1814" or "5 dager": options that are numbers with the same unit are shown in rising order;
  // all other options are shuffled so the right answer can be anywhere.
  function somTall(t) {
    const m = /^(-?\d[\d\s ]*(?:,\d+)?)(.*)$/.exec(String(t).trim());
    return m ? { v: Number(m[1].replace(/[\s ]/g, "").replace(",", ".")), enhet: m[2].trim() } : null;
  }
  function rekkefolge(q) {
    const tall = q.a.map(somTall);
    const idx = [0, 1, 2, 3];
    if (tall.every((t) => t && !Number.isNaN(t.v) && t.enhet === tall[0].enhet)) return idx.sort((x, y) => tall[x].v - tall[y].v);
    return R.stokk(idx);
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

  // ---------- The clock (optional, 20 s per question) ----------

  function klokkeHtml() {
    return `<button class="bw-klokke" id="bw-klokke" data-h="timer-veksle" data-v="bw-klokke" data-stille aria-label="Klokke, ${SEKUNDER} sekunder. Trykk for pause.">
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
        R.toast("Tiden er ute!");
        const knapp = R.$('#skjerm [data-h="vis"]');
        if (knapp) knapp.classList.add("bw-puls");
      },
    }).start();
  }

  // ---------- Pieces of the question screen ----------

  function statusHtml(sp) {
    const ferdige = sp.nr + (sp.fase === "sporsmal" ? 0 : 1);
    return `<div class="bw-status">
      <div class="bw-fremdrift" role="progressbar" aria-label="Fremdrift" aria-valuemin="0" aria-valuemax="${sp.liste.length}" aria-valuenow="${ferdige}"><i style="--andel: ${Math.round((ferdige / sp.liste.length) * 100)}%"></i></div>
      ${sp.fase === "sporsmal" && kanAngre(sp) ? `<button class="bw-angre" data-h="angre" aria-label="Angre poengene fra forrige spørsmål"><span aria-hidden="true">↩</span> Angre</button>` : ""}
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

  function valgHtml(sp, q) {
    const svar = sp.fase !== "sporsmal";
    const trykkbar = !svar && erSolo(sp);
    const kort = q.a.every((a) => a.length <= KORT_SVAR) ? " kort-svar" : "";
    return `<ol class="bw-valgliste${kort}${svar ? " avslort" : ""}" aria-label="Svaralternativer">${sp.rekke[sp.nr]
      .map((ai, vis) => {
        let klasse = `bw-valg v${vis}`;
        let merke = "";
        if (svar) {
          if (ai === q.r) {
            klasse += " riktig";
            merke = `<span class="bw-merke" aria-hidden="true">✓</span><span class="vh"> – riktig svar</span>`;
          } else if (sp.valgt === vis) {
            klasse += " feil";
            merke = `<span class="bw-merke" aria-hidden="true">✗</span><span class="vh"> – ditt svar</span>`;
          } else klasse += " dempet";
        }
        const indre = `<span class="bw-bokstav" aria-hidden="true">${BOKSTAVER[vis]}</span><span class="bw-tekst"><span class="vh">${BOKSTAVER[vis]}: </span>${esc(q.a[ai])}</span>${merke}`;
        return `<li>${trykkbar ? `<button class="${klasse}" data-h="svar" data-v="${vis}">${indre}</button>` : `<div class="${klasse}">${indre}</div>`}</li>`;
      })
      .join("")}</ol>`;
  }

  const faktaHtml = (q) =>
    `<aside class="bw-fakta" aria-label="Visste du?"><p class="etikett"><span aria-hidden="true">💡</span> Visste du?</p><p>${esc(q.fakta)}</p></aside>`;

  function soloHtml(sp, q) {
    if (sp.riktige.includes(0)) return `<p class="bw-dom riktig" role="status"><span class="bw-dom-ord">Riktig!</span> <span>+${poengTekst(q.n)}</span></p>`;
    if (sp.valgt == null) return `<p class="bw-dom" role="status"><span class="bw-dom-ord">Fasit</span> <span>Ingen poeng denne gangen</span></p>`;
    return `<p class="bw-dom feil" role="status"><span class="bw-dom-ord">Feil</span> <span>Riktig svar er ${BOKSTAVER[sp.rekke[sp.nr].indexOf(q.r)]}</span></p>`;
  }

  const kanAngre = (sp) => !!(sp.angre && girPoeng(sp) && sp.angre.riktige.length);
  const angreLenke = (sp) => (kanAngre(sp) ? R.ui.lenke("Angre poengene", "angre") : "");

  // Step 3 (points): the right answer in short, then who got it.
  function hvemSkjerm(sp, q) {
    const riktigVis = sp.rekke[sp.nr].indexOf(q.r);
    const lag = sp.modus === "lag";
    const knapper = Array.from({ length: sp.deltakere }, (_, i) => {
      const merke = lag ? `<span class="avatar" style="--pf: ${R.LAG[i].farge}" aria-hidden="true"></span>` : R.avatar(i);
      return `<button class="velger bw-hvem" data-h="riktig" data-v="${i}" aria-pressed="${sp.riktige.includes(i)}">${merke}<span>${esc(deltakerNavn(sp, i))}</span></button>`;
    }).join("");
    const siste = sp.nr + 1 >= sp.liste.length;
    return `
      ${statusHtml(sp)}
      <div class="bw-fasitlinje">
        <span class="bw-bokstav" aria-hidden="true">${BOKSTAVER[riktigVis]}</span>
        <p><span class="etikett">Riktig svar</span><b>${esc(q.a[q.r])}</b></p>
        <button class="lenke" data-h="tilbakeSvar">Se igjen</button>
      </div>
      <section class="seksjon bw-hvem-seksjon">
        <div class="seksjon-hode"><h1 id="skjerm-tittel">${lag ? "Hvilke lag hadde rett?" : "Hvem hadde rett?"}</h1><span class="tall">+${poengTekst(q.n)}</span></div>
        <div class="velgere">${knapper}</div>
        <p class="hjelp">Trykk på alle som hadde rett – eller gå rett videre.</p>
      </section>
      ${R.ui.dokk(
        R.ui.knapp(siste ? "Se kåringen" : "Neste spørsmål", "neste", { ikon: siste ? "🏆" : "→" }),
        R.ui.lenkerad(R.ui.lenke("Stillingen", "stilling"), R.ui.lenke("Avslutt", "avslutt")),
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
      if (erSolo(sp)) under = `<p class="hjelp bw-hint">Trykk på svaret ditt – eller se fasiten.</p>`;
      else if (sp.nr === 0) under = `<p class="hjelp bw-hint">Les spørsmålet og de fire svarene høyt. Når alle har svart, trykker du «Vis svaret».</p>`;
      dokk = R.ui.dokk(
        erSolo(sp) ? R.ui.knapp("Jeg vet ikke – vis svaret", "vis", { variant: "papir" }) : R.ui.knapp("Vis svaret", "vis", { variant: "stor", ikon: "👀" }),
      );
    } else {
      under = (erSolo(sp) ? soloHtml(sp, q) : "") + faktaHtml(q);
      const videre = girPoeng(sp)
        ? R.ui.knapp("Hvem hadde rett?", "hvem", { ikon: "✋" })
        : R.ui.knapp(siste ? "Se kåringen" : "Neste spørsmål", "neste", { ikon: siste ? "🏆" : "→" });
      dokk = R.ui.dokk(videre, `<div class="bw-valgfri">${R.ui.lenkerad(girPoeng(sp) ? R.ui.lenke("Stillingen", "stilling") : "", R.ui.lenke("Avslutt", "avslutt"))}</div>`);
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
    const grense = (dokk ? dokk.getBoundingClientRect().top + 18 : window.innerHeight) - 6;
    const mangler = fakta.getBoundingClientRect().bottom - grense;
    const rom = riktig.getBoundingClientRect().top - 72;
    const steg = Math.min(mangler, rom);
    if (steg > 4) window.scrollBy({ top: steg, behavior: R.rolig() ? "auto" : "smooth" });
  }

  // ---------- Results ----------

  function vurdering(andel) {
    if (andel >= 1) return "Feilfritt! Du er en ekte besserwisser.";
    if (andel >= 0.8) return "Imponerende! Du vet nesten alt.";
    if (andel >= 0.6) return "Sterkt! Litt besserwisser er du.";
    if (andel >= 0.4) return "Godt jobba – og nå vet du litt mer!";
    return "Det var noen tøffe spørsmål! Nå vet du i alle fall mer enn i stad.";
  }

  function bannerHtml(sp) {
    const antall = sp.logg.length;
    if (sp.modus === "fri")
      return `<div class="banner aksent">${R.figur()}<p class="etikett">Quizen er ferdig</p><h1 id="skjerm-tittel">Godt jobba!</h1><p class="ingress">Dere kom gjennom ${antall} spørsmål. Nå vet dere mer enn i stad.</p></div>`;
    if (erSolo(sp)) {
      const riktige = sp.treff[0];
      const rek = sp.rekord || {};
      const rekord =
        rek.ny && rek.forrige > 0
          ? `<div class="stempel-sted"><span class="stempel mynte">Ny rekord!</span></div>`
          : rek.forrige > 0
            ? `<p class="hjelp">Rekorden din på ${antall} spørsmål: ${rek.forrige} riktige</p>`
            : "";
      const rekke = `<ol class="bw-rekke" aria-label="Svarene dine">${sp.logg
        .map((l, n) => `<li class="${l.riktige.length ? "ja" : "nei"}" style="animation-delay: ${n * 70}ms"><span class="vh">Spørsmål ${n + 1}: ${l.riktige.length ? "riktig" : "feil"}</span></li>`)
        .join("")}</ol>`;
      return `<div class="banner aksent">${R.figur()}<p class="etikett">${esc(R.navn(0))} fikk</p><h1 id="skjerm-tittel">${riktige} av ${antall} riktige</h1><p class="ingress">${vurdering(antall ? riktige / antall : 0)} <b class="bw-sum">${poengTekst(sp.poeng[0])}</b></p>${rekke}</div>${rekord}`;
    }
    const topp = Math.max(...sp.poeng);
    const vinnere = sp.poeng.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0);
    if (topp <= 0)
      return `<div class="banner">${R.figur()}<p class="etikett">Kåringen</p><h1 id="skjerm-tittel">Ingen poeng i dag</h1><p class="ingress">Kanskje en lettere runde neste gang?</p></div>`;
    const navn = vinnere.map((i) => deltakerNavn(sp, i));
    const etikett = vinnere.length > 1 ? "Delt seier!" : sp.modus === "lag" ? "Vinnerlaget" : "Dagens besserwisser";
    const ingress = vinnere.length > 1 ? `Like mange poeng: ${topp}.` : `${poengTekst(topp)} og ${sp.treff[vinnere[0]]} av ${antall} riktige.`;
    return `<div class="banner aksent">${R.figur()}<p class="etikett">${etikett}</p><h1 id="skjerm-tittel">${esc(oppramsing(navn))} vinner!</h1><p class="ingress">${esc(ingress)}</p></div>`;
  }

  function fasitHtml(sp) {
    const punkt = sp.logg
      .map((l, n) => {
        const q = ALLE[l.q];
        const hvem = sp.modus === "fri" ? "" : l.riktige.length ? oppramsing(l.riktige.map((i) => deltakerNavn(sp, i))) : "Ingen";
        return `<li><span class="bw-fasit-nr">${n + 1}</span><div><p class="bw-fasit-s">${esc(q.s)}</p><p class="bw-fasit-a">✓ ${esc(q.a[q.r])}</p>${
          hvem ? `<p class="bw-fasit-hvem">${erSolo(sp) ? (l.riktige.length ? "Du hadde rett" : "Bom") : "Riktig: " + esc(hvem)}</p>` : ""
        }</div></li>`;
      })
      .join("");
    return `<h2 id="ark-tittel">Fasiten</h2><ol class="bw-fasit">${punkt}</ol><button class="knapp" data-h="lukk-ark">Lukk</button>`;
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

  // ---------- The game ----------

  R.start({
    id: "besserwisseren",
    versjon: 1,
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
    },

    regler: {
      intro: "En quiz for hele gjengen på én mobil. Fire svar – bare ett er riktig.",
      steg: [
        ["Les høyt", "Den som holder mobilen, leser spørsmålet og de fire svarene høyt."],
        ["Alle svarer", "Rop ut, skriv på en lapp – eller hold opp 1–4 fingrer for A–D samtidig."],
        ["Vis svaret", "Trykk «Vis svaret», les faktabiten og trykk på alle som hadde rett."],
      ],
      tips: [
        "Stjernene viser hvor vanskelig spørsmålet er: ★ gir 1 poeng, ★★ gir 2 og ★★★ gir 3.",
        "Spiller du alene? Velg én spiller, så trykker du rett på svaret ditt.",
        "Den som leser, kan godt være med – svaret vises ikke før dere trykker.",
        "Trykket feil? «Angre» øverst på neste spørsmål tar poengene tilbake.",
        "«Blandet» starter lett og blir vanskeligere mot slutten.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) => {
          const sp = S.spill;
          return R.ui.spillhjem({
            slagordHtml: "Fire svar. Bare ett er riktig.<br><em>Hvem er den største besserwisseren?</em>",
            knapperHtml:
              R.ui.startKnapper({
                pagar: pagar(S),
                fortsettTekst: sp ? `Fortsett · spørsmål ${sp.nr + 1} av ${sp.liste.length}` : "",
                startTekst: "Start quiz",
                ekstraHtml: (sp && sp.ferdig ? R.ui.knapp2("Se kåringen", "resultat") : "") + R.ui.lenke("Slik spiller du", "regler"),
              }),
            merker: [
              ["1–20", "spillere"],
              [String(ALLE.length), "spørsmål"],
              ["0", "reklame"],
            ],
          });
        },
      },

      oppsett: {
        tittel: "Ny quiz",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          let deltakere = "";
          if (o.modus === "spillere")
            deltakere = R.ui.spillere({ min: 1, max: 20, hjelp: S.antall === 1 ? "Alene? Da trykker du rett på svaret ditt." : "Én spiller? Da trykker du rett på svaret." });
          else if (o.modus === "lag")
            deltakere = `<section class="seksjon">
              <div class="seksjon-hode"><h2>Hvor mange lag?</h2></div>
              ${R.ui.teller("lag", o.lag, 2, 4, { enhet: "lag", minus: "Færre lag", pluss: "Flere lag" })}
              <div class="bw-lagrad">${Array.from({ length: o.lag }, (_, i) => R.ui.lagmerke(i)).join("")}</div>
            </section>`;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Hvordan spiller dere?</h2></div>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "spillere", ikon: "🙋", tittel: "Hver for seg", tekst: "Alle mot alle – eller alene" },
                  { v: "lag", ikon: "👥", tittel: "Lag mot lag", tekst: "2–4 lag samler poeng" },
                  { v: "fri", ikon: "💡", tittel: "Uten poeng", tekst: "Bare spørsmål, svar og fakta" },
                ],
                o.modus,
              )}
            </section>
            ${deltakere}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Kategorier</h2><span class="tall">${antallI(o.kategorier)} spørsmål</span></div>
              ${R.ui.brikker("kategori", KATEGORIER.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon })), o.kategorier, { alle: true, etikett: "Kategorier" })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Vanskelighet</h2></div>
              ${R.ui.seg("niva", [["blandet", "Blandet"], ["1", "Lett"], ["2", "Middels"], ["3", "Vanskelig"]], o.niva, { etikett: "Vanskelighet" })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Antall spørsmål</h2></div>
              ${R.ui.seg("lengde", LENGDER.map((n) => [n, String(n)]), o.lengde, { etikett: "Antall spørsmål" })}
            </section>
            ${R.ui.bryter("klokke", o.klokke, `Klokke på ${SEKUNDER} s`, "Klokka tikker de siste sekundene. Trykk på den for pause.")}
            ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !o.kategorier.length, ikon: "🎓" }), o.kategorier.length ? "" : `<p class="hjelp">Velg minst én kategori.</p>`)}`;
        },
      },

      sporsmal: {
        // Short title on narrow phones, so it isn't cut off between the buttons.
        tittel: (S) => (window.innerWidth < 380 ? `${S.spill.nr + 1}/${S.spill.liste.length}` : `Spørsmål ${S.spill.nr + 1} av ${S.spill.liste.length}`),
        tilbake: "hjem",
        vis: sporsmalSkjerm,
        inn(S) {
          R.holdVaken();
          startKlokke(S);
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const flere = girPoeng(sp);
          return `
            ${bannerHtml(sp)}
            ${flere ? R.ui.pall(rader(sp)) + R.ui.poengliste(rader(sp)) : ""}
            <div class="stabel">${R.ui.knapp2("Se fasiten", "fasit", { ikon: "📋" })}</div>
            ${R.ui.flereSpill(sp.modus === "spillere" ? { antall: sp.deltakere } : {})}
            ${R.ui.dokk(
              R.ui.knapp("Spill igjen", "igjen", { ikon: "🔁" }),
              R.ui.lenkerad(angreLenke(sp), R.ui.lenke("Endre oppsett", "endre"), `<a class="lenke" href="/">Alle spill</a>`),
            )}`;
        },
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
          R.toast("Fant ingen spørsmål – velg flere kategorier");
          return;
        }
        if (S.spill.liste.length < S.oppsett.lengde) R.toast(`Bare ${S.spill.liste.length} spørsmål passet – kjør på!`);
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
        R.si(`Riktig svar: ${BOKSTAVER[riktigVis]}, ${q.a[q.r]}. ${q.fakta}`);
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
        sp.angre = { nr: sp.nr, riktige: sp.riktige.slice(), valgt: sp.valgt, poeng: sp.poeng.slice(), treff: sp.treff.slice() };
        if (sp.modus !== "fri") {
          for (const i of sp.riktige) {
            sp.poeng[i] += q.n;
            sp.treff[i] += 1;
          }
          if (sp.riktige.length && girPoeng(sp) && sp.nr + 1 < sp.liste.length) R.toast(`+${poengTekst(q.n)} til ${oppramsing(sp.riktige.map((i) => deltakerNavn(sp, i)))}`);
        }
        sp.logg.push({ q: sp.liste[sp.nr], riktige: sp.riktige.slice(), valgt: sp.valgt });
        if (sp.nr + 1 >= sp.liste.length) {
          sp.ferdig = true;
          if (erSolo(sp)) {
            // Personal best per round length, on this device only.
            const rekorder = R.les("besserwisseren.rekord", {}) || {};
            const nokkel = String(sp.liste.length);
            const forrige = Number(rekorder[nokkel]) || 0;
            sp.rekord = { forrige, ny: sp.treff[0] > forrige };
            if (sp.rekord.ny) R.skriv("besserwisseren.rekord", Object.assign({}, rekorder, { [nokkel]: sp.treff[0] }));
          }
          R.gaTil("slutt");
          return;
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
        sp.nr = a.nr;
        sp.fase = "hvem";
        sp.riktige = a.riktige;
        sp.valgt = a.valgt;
        sp.ferdig = false;
        sp.angre = null;
        R.toast("Poengene er tatt tilbake");
        R.gaTil("sporsmal");
      },
      stilling(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.ark(`<h2 id="ark-tittel">Stillingen</h2><p class="ingress">Etter ${sp.logg.length} av ${sp.liste.length} spørsmål</p>${R.ui.poengliste(rader(sp))}<button class="knapp" data-h="lukk-ark">Tilbake til quizen</button>`);
      },
      fasit(el, e, S) {
        if (S.spill) R.ark(fasitHtml(S.spill));
      },
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft("Avslutte quizen?", "Poengene blir borte, men dere kan alltid starte en ny.", "Avslutt", "Fortsett")) && fortsatt()) {
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
