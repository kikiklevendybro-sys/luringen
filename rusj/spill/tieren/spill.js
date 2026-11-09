/* Tieren — «Ti svar»: a push-your-luck quiz on one phone.
   Every round has one question card with ten answers around a ring. In turn, each player taps
   one of them and answers: yes or no, a number, a group or a place in a row. Right gives a point
   in the player's pot; wrong empties the pot and the player is out of the round. «Stopp» banks
   the pot. The round ends when nobody is left in it, or when all ten are taken – then every
   answer is shown. The most points after the last round wins. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;

  const KATEGORIER = D.kategorier;
  const KAT = Object.fromEntries(KATEGORIER.map((k) => [k.id, k]));
  // Every card in one list (files in name order), so the deck can remember what was played.
  const ALLE = [];
  Object.keys(D)
    .filter((n) => n.startsWith("kort-"))
    .sort()
    .forEach((n) => D[n].forEach((k) => ALLE.push(k)));
  const stokk = R.kortstokk("kort", ALLE.length);

  const TYPER = { ja: "Ja eller nei", tall: "Tall", gruppe: "Velg riktig", rekke: "Rekkefølge" };
  const SPOR = { ja: "ja eller nei?", tall: "hvilket tall?", gruppe: "hvilken passer?", rekke: "hvilken plass?" };
  const NIVAER = ["lett", "blandet", "vanskelig"];
  const RUNDER = [3, 5, 8];
  const ALLE_KAT = KATEGORIER.map((k) => k.id);
  const standardOppsett = () => ({ kategorier: ALLE_KAT.slice(), niva: "blandet", runder: 5 });

  let H; // the actions, so one action can call another
  let opptatt = false; // an answer is being revealed
  let vistKaskade = "";
  let sisteStopp = -1e9; // when «Stopp» was last tapped // which finished round has already flipped its answers

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const poengTekst = (n) => R.flertall(n, "poeng", "poeng");
  const kortNa = (sp) => ALLE[sp.kort[sp.runde]];
  const rader = (sp) => sp.sum.map((p, i) => ({ i, poeng: p }));

  function passer(o, k) {
    if (!o.kategorier.includes(k.k)) return false;
    if (o.niva === "lett") return k.n === 1;
    if (o.niva === "vanskelig") return k.n >= 2;
    return true;
  }
  const antallI = (o) => ALLE.reduce((s, k) => s + (passer(o, k) ? 1 : 0), 0);

  // The answer buttons for a card, and the right answer for one item, as strings.
  function svarValg(kort) {
    if (kort.t === "ja")
      return [
        { v: "true", tekst: "Ja" },
        { v: "false", tekst: "Nei" },
      ];
    if (kort.t === "gruppe") return kort.v.map((g) => ({ v: g, tekst: g }));
    if (kort.t === "rekke") return Array.from({ length: kort.a.length }, (_, n) => ({ v: String(n + 1), tekst: String(n + 1) }));
    return [...new Set(kort.a.map((x) => x[1]))].sort((a, b) => a - b).map((x) => ({ v: String(x), tekst: R.tall(x) }));
  }
  const fasit = (kort, n) => String(kort.a[n][1]);
  function fasitTekst(kort, n) {
    const x = kort.a[n][1];
    if (kort.t === "ja") return x ? "Ja" : "Nei";
    if (kort.t === "rekke") return `Nr. ${x}`;
    if (kort.t === "tall") return R.tall(x);
    return String(x);
  }
  // Long single words get a smaller font on the ring, so nothing sticks out on a small phone.
  const ordKlasse = (tekst) => {
    const lengste = Math.max(...String(tekst).split(/[\s\-–]+/).map((o) => o.length));
    return lengste > 14 ? " ekstra" : lengste > 11 ? " lang" : lengste > 9 ? " middels" : "";
  };

  // ---------- Rounds ----------

  function velgKort(o, antall) {
    const kort = [];
    for (let r = 0; r < antall; r++) {
      let i = stokk.neste((x) => !kort.includes(x) && passer(o, ALLE[x]));
      if (i < 0 || kort.includes(i)) i = stokk.neste((x) => !kort.includes(x) && o.kategorier.includes(ALLE[x].k));
      if (i < 0 || kort.includes(i)) break;
      kort.push(i);
    }
    return kort;
  }

  function startRunde(sp, r) {
    const n = sp.deltakere;
    sp.runde = r;
    sp.ring = R.stokk(Array.from({ length: 10 }, (_, k) => k)); // ring position → item on the card
    sp.apne = Array(10).fill(null);
    sp.pott = Array(n).fill(0);
    sp.tapt = Array(n).fill(0);
    sp.status = Array(n).fill("med"); // med → stopp | ute
    sp.starter = r % n; // who begins moves one seat each round
    sp.tur = sp.starter;
    sp.valgt = null;
    sp.fase = "velg"; // velg → ferdig (all answers shown)
    sp.angre = null;
  }

  function nyttSpill(S) {
    const o = S.oppsett;
    const kort = velgKort(o, o.runder);
    if (!kort.length) return false;
    const n = R.klamp(S.antall || 2, 2, 8);
    const sp = { deltakere: n, runder: kort.length, kort, sum: Array(n).fill(0), logg: [], ferdig: false };
    startRunde(sp, 0);
    S.spill = sp;
    return true;
  }

  // The next player still in the round after `fra` (the same player if nobody else is left), or -1.
  function nesteSpiller(sp, fra) {
    for (let k = 1; k <= sp.deltakere; k++) {
      const i = (fra + k) % sp.deltakere;
      if (sp.status[i] === "med") return i;
    }
    return -1;
  }

  // The round is over: pots of everyone who didn't burst are banked, every answer is shown.
  function avsluttRunde(sp) {
    sp.fase = "ferdig";
    sp.valgt = null;
    const pluss = sp.pott.map((p, i) => (sp.status[i] === "ute" ? 0 : p));
    pluss.forEach((p, i) => (sp.sum[i] += p));
    sp.logg.push({ kort: sp.kort[sp.runde], pluss, status: sp.status.slice(), tapt: sp.tapt.slice() });
  }

  function videre(sp, fra) {
    const neste = nesteSpiller(sp, fra);
    if (neste < 0 || sp.apne.every(Boolean)) avsluttRunde(sp);
    else sp.tur = neste;
  }

  // ---------- Pieces of the ring screen ----------

  function kortHtml(sp, kort) {
    const kat = KAT[kort.k] || { ikon: "❓", kort: kort.k, farge: "var(--aksent)" };
    return `<article class="ti-kort" style="--kf: ${kat.farge}">
      <div class="ti-kort-topp"><span class="ti-kat"><span aria-hidden="true">${kat.ikon}</span> ${esc(kat.kort)}</span><span class="ti-type">${esc(TYPER[kort.t])}</span></div>
      <h1 class="ti-sporsmal" id="skjerm-tittel">${esc(kort.s)}</h1>
    </article>`;
  }

  function brikkeHtml(sp, kort, pos) {
    const n = sp.ring[pos];
    const tekst = kort.a[n][0];
    const apen = sp.apne[pos];
    if (apen || sp.fase === "ferdig") {
      const klasse = apen ? (apen.riktig ? "riktig" : "feil") : "fasit";
      const hvem = apen ? `<span class="ti-b-hvem">${R.avatar(apen.i)}</span>` : "";
      const lest = apen ? `${R.navn(apen.i)} svarte ${apen.riktig ? "riktig" : "feil"}. ` : "";
      const kaskade = !apen && vistKaskade !== kaskadeNokkel(sp) ? ` style="--d: ${pos * 70}ms"` : "";
      return `<div class="ti-brikke ti-p${pos} ${klasse}${kaskade ? " ti-snus" : ""}"${kaskade} role="img" aria-label="${esc(`${tekst}: ${fasitTekst(kort, n)}. ${lest}`)}">${hvem}<span class="ti-b-tekst${ordKlasse(tekst)}" aria-hidden="true">${esc(tekst)}</span><span class="ti-b-svar" aria-hidden="true">${esc(fasitTekst(kort, n))}</span></div>`;
    }
    return `<button class="ti-brikke ti-p${pos}${ordKlasse(tekst)}" data-h="velg" data-v="${pos}" aria-pressed="${sp.valgt === pos}">${esc(tekst)}</button>`;
  }

  const kaskadeNokkel = (sp) => `${sp.kort.join(",")}:${sp.runde}`;

  function midtHtml(sp, kort) {
    if (sp.fase === "ferdig") {
      const l = sp.logg[sp.logg.length - 1];
      const best = Math.max(...l.pluss);
      return `<div class="ti-midt-ferdig"><span class="ti-flagg" aria-hidden="true">🏁</span><p class="ti-midt-tittel">Runden er over</p>${best > 0 ? `<p class="ti-midt-liten">Best: +${best}</p>` : ""}</div>`;
    }
    const i = sp.tur;
    const pott = sp.pott[i];
    if (sp.valgt != null)
      return `${R.avatar(i, "mid")}<p class="ti-midt-valgt${ordKlasse(kort.a[sp.ring[sp.valgt]][0])}">${esc(kort.a[sp.ring[sp.valgt]][0])}</p>`;
    return `${R.avatar(i, "stor")}<p class="ti-midt-navn">${esc(R.navn(i))}</p><p class="ti-potte${pott ? "" : " tom"}"><b>${pott}</b><span>i potten</span></p>${pott ? "" : `<p class="ti-midt-liten">Velg et svar!</p>`}`;
  }

  function ringHtml(sp, kort) {
    const brikker = Array.from({ length: 10 }, (_, pos) => brikkeHtml(sp, kort, pos)).join("");
    const kaskade = sp.fase === "ferdig" && vistKaskade !== kaskadeNokkel(sp) ? " ti-kaskade" : "";
    return `<div class="ti-ring${kaskade}" role="group" aria-label="Ti svar">
      <div class="ti-spor" aria-hidden="true"></div>
      ${brikker}
      <div class="ti-midt" aria-live="polite">${midtHtml(sp, kort)}</div>
    </div>`;
  }

  function seterHtml(sp) {
    const seter = Array.from({ length: sp.deltakere }, (_, i) => {
      const st = sp.status[i];
      const na = sp.fase === "velg" && sp.tur === i;
      const pott = sp.pott[i];
      const merke = st === "ute" ? "💥" : st === "stopp" ? "✋" : "";
      const om = st === "ute" ? ", røk" : st === "stopp" ? ", har stoppet" : na ? ", har tur" : "";
      const etikett = `${R.navn(i)}: ${poengTekst(sp.sum[i])}${pott && st !== "ute" ? `, ${pott} i potten` : ""}${om}`;
      return `<li class="ti-sete${na ? " na" : ""} ${st}" aria-label="${esc(etikett)}">
        <span class="ti-sete-av" aria-hidden="true">${R.avatar(i)}${pott > 0 && st !== "ute" ? `<b class="ti-pott">+${pott}</b>` : ""}${merke ? `<i class="ti-sete-merke">${merke}</i>` : ""}</span>
        <span class="ti-sete-navn" aria-hidden="true">${esc(R.navn(i))}</span>
        <span class="ti-sete-sum" aria-hidden="true">${sp.sum[i]}</span>
      </li>`;
    }).join("");
    return `<ol class="ti-seter" aria-label="Poengene">${seter}</ol>`;
  }

  function oppsummeringHtml(sp) {
    const l = sp.logg[sp.logg.length - 1];
    const rad = rader(sp).map((r) => Object.assign(r, { pluss: l.pluss[r.i] || 0 }));
    const rok = l.status.map((s, i) => (s === "ute" && l.tapt[i] > 0 ? i : -1)).filter((i) => i >= 0);
    return `<section class="seksjon ti-oppsummering">
      <div class="seksjon-hode"><h2>Stillingen</h2><span class="tall">etter runde ${sp.runde + 1} av ${sp.runder}</span></div>
      ${R.ui.poengliste(rad)}
      ${rok.length ? `<p class="hjelp">💥 Potten røk for ${esc(R.ramsOpp(rok.map((i) => `${R.navn(i)} (${l.tapt[i]})`)))}.</p>` : ""}
    </section>`;
  }

  function dokkHtml(sp, kort) {
    const lenker = (...ekstra) => R.ui.lenkerad(...ekstra, R.ui.lenke("Stillingen", "stilling"), R.ui.lenke("Avslutt", "avslutt"));
    if (sp.fase === "ferdig") {
      const siste = sp.runde + 1 >= sp.runder;
      return R.ui.dokk(R.ui.knapp(siste ? "Til kåringen" : "Neste runde", "nesteRunde", { ikon: siste ? "🏆" : "→", id: "ti-neste" }), lenker());
    }
    const i = sp.tur;
    const angre = sp.angre ? R.ui.lenke(`↶ Angre «Stopp» for ${R.navn(sp.angre.i)}`, "angre") : "";
    if (sp.valgt == null) {
      const pott = sp.pott[i];
      return R.ui.dokk(pott > 0 ? R.ui.knapp2(`Stopp – ta med ${poengTekst(pott)}`, "stopp", { ikon: "✋", id: "ti-stopp", v: i }) : "", lenker(angre));
    }
    const n = sp.ring[sp.valgt];
    const valg = svarValg(kort);
    const kort3 = valg.every((v) => v.tekst.length <= 10);
    let kol = 2;
    if (kort.t === "rekke") kol = 5;
    else if (kort.t === "tall") kol = valg.length <= 5 ? valg.length : Math.ceil(valg.length / 2);
    else if (kort.t === "gruppe") kol = valg.length === 3 && kort3 ? 3 : valg.length >= 5 && kort3 ? 3 : 2;
    const knapper = valg
      .map((v) => {
        const farge = kort.t === "ja" ? (v.v === "true" ? "mynte" : "rosa") : "papir";
        return `<button class="knapp ${farge} ti-svarknapp" data-h="svar" data-v="${esc(v.v)}">${esc(v.tekst)}</button>`;
      })
      .join("");
    return R.ui.dokk(
      `<div class="ti-svar">
        <p class="ti-svar-sporsmal"><b>${esc(kort.a[n][0])}</b> – ${esc(SPOR[kort.t])}</p>
        <div class="ti-knapper ti-${kort.t}" style="--kol: ${kol}">${knapper}</div>
      </div>`,
      R.ui.lenkerad(R.ui.lenke("Velg et annet svar", "velg", { v: sp.valgt }), sp.pott[i] > 0 ? R.ui.lenke(`Stopp – ta med ${poengTekst(sp.pott[i])}`, "stopp", { v: i }) : ""),
    );
  }

  function ringSkjerm(S) {
    const sp = S.spill;
    const kort = kortNa(sp);
    return `${kortHtml(sp, kort)}${ringHtml(sp, kort)}${sp.fase === "ferdig" ? oppsummeringHtml(sp) : seterHtml(sp)}${dokkHtml(sp, kort)}`;
  }

  // ---------- The reveal of one answer ----------

  function visSvar(pos, riktig, kort, n, i, tapt) {
    return new Promise((ferdig) => {
      const b = R.$(`#skjerm .ti-brikke[data-v="${pos}"]`);
      const midt = R.$("#skjerm .ti-midt");
      R.$$("#skjerm .ti-svarknapp").forEach((k) => (k.disabled = true));
      const resultat = () => {
        if (riktig) {
          R.lyd.riktig();
          R.vibrer([30, 40, 60]);
        } else {
          R.lyd.feil();
          R.vibrer(140);
        }
        if (midt)
          midt.innerHTML = riktig
            ? `<p class="ti-utfall riktig"><b>+1</b><span>Riktig!</span></p>`
            : `<p class="ti-utfall feil"><b aria-hidden="true">💥</b><span>${tapt > 0 ? `Feil! ${esc(poengTekst(tapt))} røk` : "Feil!"}</span></p>`;
      };
      if (!b || R.rolig()) {
        resultat();
        return setTimeout(ferdig, 700);
      }
      b.classList.add("ti-spenning");
      R.lyd.tikk();
      setTimeout(() => R.lyd.tikk(), 230);
      setTimeout(() => {
        b.classList.remove("ti-spenning");
        b.classList.add("ti-vend");
        setTimeout(() => {
          const tekst = kort.a[n][0];
          b.className = `ti-brikke ti-p${pos} ${riktig ? "riktig" : "feil"} ti-vendt`;
          b.removeAttribute("aria-pressed");
          b.innerHTML = `<span class="ti-b-hvem">${R.avatar(i)}</span><span class="ti-b-tekst${ordKlasse(tekst)}">${esc(tekst)}</span><span class="ti-b-svar">${esc(fasitTekst(kort, n))}</span>`;
          resultat();
          setTimeout(ferdig, 1150);
        }, 170);
      }, 480);
    });
  }

  // ---------- End ----------

  function avsluttSpill(S) {
    const sp = S.spill;
    sp.ferdig = true;
    const topp = Math.max(...sp.sum);
    sp.vinnere = topp > 0 ? sp.sum.map((p, i) => (p === topp ? i : -1)).filter((i) => i >= 0) : [];
    R.kveld.registrer(rader(sp));
    R.statistikk("ferdig", { spillere: sp.deltakere, runder: sp.logg.length, poeng: topp });
    R.gaTil("slutt");
  }

  function fasitArk(sp) {
    const runder = sp.logg
      .map((l, r) => {
        const kort = ALLE[l.kort];
        const svar = kort.a.map((x, n) => `<li><span>${esc(x[0])}</span><b>${esc(fasitTekst(kort, n))}</b></li>`).join("");
        return `<section class="ti-fasit"><p class="etikett">Runde ${r + 1}</p><h3>${esc(kort.s)}</h3><ol class="ti-fasit-liste">${svar}</ol></section>`;
      })
      .join("");
    return `<h2 id="ark-tittel">Fasiten</h2>${runder}<button class="knapp" data-h="lukk-ark">Lukk</button>`;
  }

  function sluttSkjerm(S) {
    const sp = S.spill;
    const v = sp.vinnere || [];
    let banner;
    if (!v.length) banner = `<div class="banner">${R.figur()}<p class="etikett">Kåringen</p><h1 id="skjerm-tittel">Ingen poeng i dag</h1><p class="ingress">Potten røk for alle. Neste gang: stopp litt før!</p></div>`;
    else {
      const navn = v.length > 3 ? `${v.length} spillere` : R.ramsOpp(v.map((i) => R.navn(i)));
      const topp = sp.sum[v[0]];
      banner = `<div class="banner aksent">${R.figur()}<p class="etikett">${v.length > 1 ? "Delt seier!" : "Kveldens mester"}</p><h1 id="skjerm-tittel">${esc(navn)} vinner!</h1><p class="ingress">${esc(v.length > 1 ? `Like mange poeng: ${topp}.` : `${poengTekst(topp)} etter ${R.flertall(sp.logg.length, "runde", "runder")}.`)}</p></div>`;
    }
    return `
      ${banner}
      ${R.ui.pall(rader(sp))}
      ${R.ui.poengliste(rader(sp))}
      <div class="stabel">${R.ui.knapp2("Se fasiten", "fasit", { ikon: "📋" })}</div>
      ${R.ui.flereSpill({ antall: sp.deltakere })}
      ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen", { ikon: "🔁" }), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), `<a class="lenke" href="/">Alle spill</a>`))}`;
  }

  // ---------- The game ----------

  R.start({
    id: "tieren",
    versjon: 1,
    pagar,

    tilstand: () => ({ antall: 3, oppsett: standardOppsett(), spill: null }),

    // Repair saved settings and drop a saved game that no longer fits the cards.
    lastet(S) {
      const o = (S.oppsett = Object.assign(standardOppsett(), S.oppsett || {}));
      o.kategorier = (Array.isArray(o.kategorier) ? o.kategorier : []).filter((id) => KAT[id]);
      if (!NIVAER.includes(o.niva)) o.niva = "blandet";
      o.runder = RUNDER.includes(Number(o.runder)) ? Number(o.runder) : 5;
      const sp = S.spill;
      const n = sp && sp.deltakere;
      const liste = (x, lengde) => Array.isArray(x) && x.length === lengde;
      const ok =
        sp &&
        Number.isInteger(n) &&
        n >= 2 &&
        n <= 8 &&
        Array.isArray(sp.kort) &&
        sp.kort.length === sp.runder &&
        sp.kort.every((k) => Number.isInteger(k) && ALLE[k] && ALLE[k].a.length === 10) &&
        Number.isInteger(sp.runde) &&
        sp.runde >= 0 &&
        sp.runde < sp.runder &&
        liste(sp.sum, n) &&
        liste(sp.pott, n) &&
        liste(sp.tapt, n) &&
        liste(sp.status, n) &&
        liste(sp.ring, 10) &&
        liste(sp.apne, 10) &&
        Number.isInteger(sp.tur) &&
        sp.tur >= 0 &&
        sp.tur < n &&
        ["velg", "ferdig"].includes(sp.fase) &&
        (sp.valgt == null || (Number.isInteger(sp.valgt) && sp.valgt >= 0 && sp.valgt < 10 && !sp.apne[sp.valgt])) &&
        Array.isArray(sp.logg);
      if (!ok) S.spill = null;
    },

    regler: {
      intro: "Ti svar ligger rundt ringen. Ta ett om gangen – men ett feil svar, og potten ryker.",
      steg: [
        ["Velg et svar", "Den som har tur, trykker på ett av de ti svarene på ringen."],
        ["Svar riktig", "Ja eller nei, et tall, en gruppe eller en plass i rekka. Riktig gir 1 poeng i potten din."],
        ["Stopp i tide", "Feil svar, og potten ryker – da er du ute av runden. Stopp når du vil, så tar du med deg poengene."],
      ],
      tips: [
        "Runden er over når alle har stoppet eller røket – eller når alle ti svarene er tatt.",
        "Har du ingenting i potten, har du heller ingenting å tape. Kjør på!",
        "Den som begynner, bytter hver runde.",
        "Trykket «Stopp» ved et uhell? «Angre» redder deg helt til nestemann har valgt.",
        "Mest poeng etter siste runde vinner.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) => {
          const sp = S.spill;
          return R.ui.spillhjem({
            slagordHtml: "Ti svar. Ett feil, og potten ryker.<br><em>Tør du ta ett til?</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: sp ? `Fortsett · runde ${sp.runde + 1} av ${sp.runder}` : "",
              ekstraHtml: (sp && sp.ferdig ? R.ui.knapp2("Til kåringen", "resultat") : "") + R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–8", "spillere"],
              [String(ALLE.length), "spørsmålskort"],
              ["0", "reklame"],
            ],
          });
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            ${R.ui.spillere({ min: 2, max: 8, hjelp: "Mobilen går rundt – eller ligger midt på bordet." })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Kategorier</h2><span class="tall">${R.flertall(antallI(o), "kort", "kort")}</span></div>
              ${R.ui.brikker("kategori", KATEGORIER.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon })), o.kategorier, { alle: true, etikett: "Kategorier" })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Vanskelighet</h2></div>
              ${R.ui.seg("niva", [["lett", "Lett"], ["blandet", "Blandet"], ["vanskelig", "Vanskelig"]], o.niva, { etikett: "Vanskelighet" })}
            </section>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Antall runder</h2></div>
              ${R.ui.seg("runder", RUNDER.map((n) => [n, String(n)]), o.runder, { etikett: "Antall runder" })}
            </section>
            ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !o.kategorier.length, ikon: "🔟" }), o.kategorier.length ? "" : `<p class="hjelp">Velg minst én kategori.</p>`)}`;
        },
      },

      ring: {
        // Short title on narrow phones, so it isn't cut off between the buttons.
        tittel: (S) => (window.innerWidth < 380 ? `Runde ${S.spill.runde + 1}/${S.spill.runder}` : `Runde ${S.spill.runde + 1} av ${S.spill.runder}`),
        tilbake: "hjem",
        vis: ringSkjerm,
        etter(S) {
          const sp = S.spill;
          if (sp && sp.fase === "ferdig") vistKaskade = kaskadeNokkel(sp);
        },
        inn() {
          R.holdVaken();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis: sluttSkjerm,
        inn(S) {
          R.slippVaken();
          if ((S.spill.vinnere || []).length) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
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
        if (pagar(S)) R.gaTil("ring");
      },
      resultat: (el, e, S) => {
        if (S.spill && S.spill.ferdig) R.gaTil("slutt");
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
      runder(el, e, S) {
        const n = Number(el.dataset.v);
        if (RUNDER.includes(n)) S.oppsett.runder = n;
        R.vis();
      },
      start(el, e, S) {
        const o = S.oppsett;
        if (!o.kategorier.length) return;
        if (!nyttSpill(S)) {
          R.toast("Fant ingen kort – velg flere kategorier");
          return;
        }
        if (S.spill.runder < o.runder) R.toast(`Bare ${S.spill.runder} kort passet – kjør på!`);
        R.statistikk("start", { spillere: S.spill.deltakere, runder: S.spill.runder, niva: o.niva });
        R.lyd.pop();
        R.gaTil("ring");
        R.si(`${R.navn(S.spill.tur)} begynner. ${kortNa(S.spill).s}`);
      },

      // Tap an answer on the ring (again to let it go).
      velg(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "velg" || opptatt) return;
        const pos = Number(el.dataset.v);
        if (!Number.isInteger(pos) || pos < 0 || pos > 9 || sp.apne[pos]) return;
        sp.valgt = sp.valgt === pos ? null : pos;
        sp.angre = null;
        if (sp.valgt != null) R.lyd.pop();
        R.vis();
        if (sp.valgt != null) {
          const kort = kortNa(sp);
          R.si(`${kort.a[sp.ring[pos]][0]} – ${SPOR[kort.t]}`);
          const forste = R.$("#skjerm .ti-svarknapp");
          if (e && e.detail === 0 && forste) forste.focus(); // keyboard: straight to the answers
        }
      },

      async svar(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "velg" || sp.valgt == null || opptatt) return;
        const kort = kortNa(sp);
        const pos = sp.valgt;
        const n = sp.ring[pos];
        const i = sp.tur;
        const riktig = el.dataset.v === fasit(kort, n);
        const tapt = riktig ? 0 : sp.pott[i];
        // Settle the answer first, so a reload during the reveal can't give a second try.
        sp.apne[pos] = { i, svar: el.dataset.v, riktig };
        sp.valgt = null;
        sp.angre = null;
        if (riktig) sp.pott[i] += 1;
        else {
          sp.tapt[i] = sp.pott[i];
          sp.pott[i] = 0;
          sp.status[i] = "ute";
        }
        videre(sp, i);
        R.lagre();
        opptatt = true;
        const fortsatt = R.vakt();
        try {
          await visSvar(pos, riktig, kort, n, i, tapt);
        } finally {
          opptatt = false;
        }
        if (!fortsatt() || R.S.spill !== sp) return;
        R.vis();
        if (sp.fase === "ferdig") {
          R.lyd.pling();
          R.si(`Runden er over. ${R.ramsOpp(sp.logg[sp.logg.length - 1].pluss.map((p, k) => `${R.navn(k)} ${p > 0 ? "+" + p : "0"}`))}.`);
        } else R.si(`${riktig ? "Riktig" : "Feil"}: ${kort.a[n][0]}, ${fasitTekst(kort, n)}. ${R.navn(sp.tur)} har tur.`);
      },

      async stopp(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "velg" || opptatt) return;
        const i = sp.tur;
        // The button belongs to the player it was drawn for, and a double tap must not stop the next player too.
        if (Number(el.dataset.v) !== i || performance.now() - sisteStopp < 600) return;
        sisteStopp = performance.now();
        const pott = sp.pott[i];
        if (pott <= 0) return;
        const alene = nesteSpiller(sp, i) === i; // nobody else is left: stopping ends the round
        if (alene) {
          const fortsatt = R.vakt();
          const ja = await R.bekreft("Stoppe nå?", `Da er runden over, og ${R.navn(i)} tar med seg ${poengTekst(pott)}.`, "Stopp", "Fortsett");
          if (!ja || !fortsatt() || R.S.spill !== sp || sp.fase !== "velg" || sp.tur !== i) return;
        }
        sp.status[i] = "stopp";
        sp.valgt = null;
        videre(sp, i);
        sp.angre = alene ? null : { i };
        R.lyd.takk();
        R.vibrer(20);
        R.toast(`${R.navn(i)} tar med seg ${poengTekst(pott)}`);
        R.vis();
      },

      // Undo a «Stopp» until the next player has picked an answer.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || sp.fase !== "velg" || opptatt) return;
        sp.status[a.i] = "med";
        sp.tur = a.i;
        sp.valgt = null;
        sp.angre = null;
        R.lyd.snu();
        R.toast(`${R.navn(a.i)} er med igjen`);
        R.vis();
      },

      nesteRunde(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.fase !== "ferdig" || opptatt) return;
        if (sp.runde + 1 >= sp.runder) return avsluttSpill(S);
        startRunde(sp, sp.runde + 1);
        R.lyd.snu();
        R.gaTil("ring");
        R.si(`Runde ${sp.runde + 1}. ${R.navn(sp.tur)} begynner. ${kortNa(sp).s}`);
      },

      stilling(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const rad = rader(sp).map((r) => (sp.fase === "velg" && sp.pott[r.i] > 0 && sp.status[r.i] !== "ute" ? Object.assign(r, { pluss: sp.pott[r.i] }) : r));
        R.ark(
          `<h2 id="ark-tittel">Stillingen</h2><p class="ingress">Runde ${sp.runde + 1} av ${sp.runder}${sp.fase === "velg" ? " · det gule tallet er potten, som ikke er trygg ennå" : ""}</p>${R.ui.poengliste(rad)}<button class="knapp" data-h="lukk-ark">Tilbake til spillet</button>`,
        );
      },

      fasit(el, e, S) {
        if (S.spill) R.ark(fasitArk(S.spill));
      },

      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return;
        const fortsatt = R.vakt();
        const ferdige = sp.logg.length;
        const tekst = ferdige ? `Dere går rett til kåringen med poengene fra ${R.flertall(ferdige, "ferdig runde", "ferdige runder")}.` : "Ingen runde er ferdig ennå, så spillet avsluttes uten kåring.";
        if (!(await R.bekreft("Avslutte spillet?", tekst, "Avslutt", "Spill videre")) || !fortsatt() || R.S.spill !== sp || sp.ferdig || opptatt) return;
        if (ferdige) {
          if (sp.fase === "velg") {
            // The round in progress doesn't count.
            sp.kort = sp.kort.slice(0, ferdige);
            sp.runder = ferdige;
            sp.runde = ferdige - 1;
            sp.fase = "ferdig";
          }
          return avsluttSpill(S);
        }
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
