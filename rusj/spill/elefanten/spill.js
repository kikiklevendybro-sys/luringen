/* Elefanten — Memory.
   Turn two cards and find the pairs. Alone: beat your own record (moves and time) for each board
   size. 2–4 players: take turns, a pair gives another turn, most pairs wins.
   The board is drawn once per screen; flips are class changes so the 3D animations stay smooth. */
(function () {
  "use strict";

  const R = window.Rusj;
  const G = window.RusjGjengen;
  const D = window.RUSJ_DATA.temaer;
  const esc = R.esc;

  const STORRELSER = [12, 16, 20, 24, 30];
  const KOLONNER = { 12: 3, 16: 4, 20: 4, 24: 4, 30: 5 };
  const FORHOLD = 1.22; // card height / width
  const TINTER = ["#ffd6e4", "#d4efff", "#d9f6cf", "#fff0bd", "#e6d9ff", "#ffdcc7", "#cbf6e8", "#f5d6ff", "#dae2ff", "#ffe4dc"];
  const GJENGEN = "gjengen";

  // Every theme as a list of faces: { navn, html, tint }
  const LISTER = {};
  for (const t of D.temaer) {
    if (t.id === GJENGEN) {
      LISTER[t.id] = G.alle.map((id, n) => ({
        navn: D.gjengen[id] || id.charAt(0).toUpperCase() + id.slice(1),
        html: `<span class="ele-figur">${G.svg(id)}</span>`,
        tint: TINTER[n % TINTER.length],
      }));
    } else {
      LISTER[t.id] = t.ting.map(([emoji, navn], n) => ({ navn, html: `<span class="ele-emoji">${esc(emoji)}</span>`, tint: TINTER[n % TINTER.length] }));
    }
  }
  const tema = (id) => D.temaer.find((t) => t.id === id);
  const JA = ["Bra!", "Supert!", "Ja!", "Husket!", "Kjempebra!", "Wow!", "Tøft!", "Elefantbra!"];
  const NEI = ["Nesten!", "Hmm …", "Prøv igjen!", "Oi!", "Husk dem!", "Snart!"];

  let H; // actions
  let las = false; // input locked (end of game)
  let venter = null; // { a, b, id } two unequal cards that are about to turn back
  let klokkeFra = null; // performance.now() when the clock last started
  let nyDeling = false; // deal the cards with an animation on the next draw
  let meldingId = null;

  // ---------- Game ----------

  function nyttSpill(S) {
    const liste = LISTER[S.oppsett.tema];
    const par = Math.min(S.oppsett.kort / 2, liste.length);
    const rng = R.rng(R.nyttFro());
    const valgte = R.stokk(liste.map((_, i) => i), rng).slice(0, par);
    const kort = R.stokk([...valgte, ...valgte], rng);
    const antall = R.klamp(S.antall || 1, 1, 4);
    S.spill = {
      tema: S.oppsett.tema,
      antall,
      kort,
      funnet: kort.map(() => -1),
      opp: [],
      trekk: 0,
      tid: 0,
      startet: false,
      tur: 0,
      poeng: Array.from({ length: antall }, () => 0),
      ferdig: false,
      resultat: null,
      fant: [],
    };
    venter = null;
    klokkeFra = null;
    las = false;
    nyDeling = true;
  }

  const ansikt = (sp, i) => LISTER[sp.tema][sp.kort[i]];
  const parTotalt = (sp) => sp.kort.length / 2;
  const parFunnet = (sp) => sp.funnet.filter((f) => f >= 0).length / 2;

  function tidMs(sp) {
    return sp.tid + (klokkeFra != null ? performance.now() - klokkeFra : 0);
  }
  function startKlokke(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig || !sp.startet || klokkeFra != null || document.hidden) return;
    klokkeFra = performance.now();
  }
  function stoppKlokke(S) {
    const sp = S && S.spill;
    if (sp && klokkeFra != null) sp.tid += performance.now() - klokkeFra;
    klokkeFra = null;
  }
  const visTid = (ms) => {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  function etikett(sp, i) {
    const f = sp.funnet[i];
    if (f >= 0) return `${ansikt(sp, i).navn} – funnet`;
    if (sp.opp.includes(i) || (venter && (venter.a === i || venter.b === i))) return `Kort ${i + 1}: ${ansikt(sp, i).navn}`;
    return `Kort ${i + 1}`;
  }

  // ---------- Markup ----------

  function kortHtml(sp, i) {
    const t = ansikt(sp, i);
    const f = sp.funnet[i];
    const opp = f >= 0 || sp.opp.includes(i);
    const merke = f >= 0 && sp.antall > 1 ? `<span class="ele-merke" aria-hidden="true">${R.DYR[f % 20]}</span>` : "";
    return `<button class="ele-kort${opp ? " opp" : ""}${f >= 0 ? " funnet" : ""}" data-h="snu" data-v="${i}" data-stille
        style="--i:${i}; --tint:${t.tint}${f >= 0 && sp.antall > 1 ? `; --pf: var(--p${(f % 20) + 1})` : ""}" aria-label="${esc(etikett(sp, i))}"${f >= 0 ? ' aria-disabled="true"' : ""}>
      <span class="ele-hopp"><span class="ele-indre">
        <span class="ele-side ele-bak"></span>
        <span class="ele-side ele-for">${t.html}${merke}</span>
      </span></span>
    </button>`;
  }

  function hudHtml(S) {
    const sp = S.spill;
    if (sp.antall === 1) {
      const rek = S.rekorder[String(sp.kort.length)];
      return `<div class="ele-hud solo">
        <span class="ele-stat"><small>Par</small><b id="ele-par">${parFunnet(sp)}/${parTotalt(sp)}</b></span>
        <span class="ele-stat"><small>Trekk</small><b id="ele-trekk">${sp.trekk}</b></span>
        <span class="ele-stat"><small>Tid</small><b id="ele-tid">${visTid(tidMs(sp))}</b></span>
        <span class="ele-stat rekord"><small>Rekord</small><b>${rek ? `🏆 ${rek.trekk}` : "–"}</b></span>
      </div>`;
    }
    // Names may wrap to two lines; with three or four players the name gets its own line under the avatar.
    return `<div class="ele-hud flere${sp.antall >= 3 ? " stablet" : ""}" style="--antall:${sp.antall}" role="list" aria-label="Poeng">${sp.poeng
      .map(
        (p, i) => `<span class="ele-spiller${i === sp.tur ? " na" : ""}" role="listitem" style="--pf: var(--p${(i % 20) + 1})"${i === sp.tur ? ' aria-current="true"' : ""}>
          ${R.avatar(i)}<span class="ele-navn">${esc(R.navn(i))}</span><b class="ele-poeng">${p}</b>
        </span>`,
      )
      .join("")}</div>`;
  }
  // "Name / what happens" on two lines, so long names are never cut.
  const navnLinje = (i, tekst) => `${R.avatar(i)}<span class="ele-m-tekst"><b>${esc(R.navn(i))}</b><small>${esc(tekst)}</small></span>`;

  function oppdaterHud(S) {
    const gml = R.$(".ele-hud");
    if (!gml) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = hudHtml(S);
    gml.replaceWith(tmp.firstElementChild);
  }

  // ---------- Board size: the whole board fits on the screen without scrolling ----------

  // Cards are 1.22 times as tall as wide, up to 1.4 when there is spare room; with plenty of room
  // the elephant sits under the board and cheers.
  const VENN = 116;
  function tilpass() {
    const brett = R.$(".ele-brett");
    if (!brett) return;
    const n = Number(brett.dataset.n);
    const kol = Number(brett.dataset.kol);
    const rader = Math.ceil(n / kol);
    const gap = n >= 24 ? 7 : n >= 16 ? 9 : 11;
    const bredde = brett.clientWidth;
    const topp = brett.getBoundingClientRect().top + window.scrollY;
    const hoyde = window.innerHeight - topp - 20;
    const fraBredde = (bredde - gap * (kol - 1)) / kol;
    const fraHoyde = (hoyde - gap * (rader - 1)) / rader / FORHOLD;
    const b = Math.floor(Math.max(44, Math.min(fraBredde, fraHoyde, 128)));
    const rest = hoyde - (rader * b * FORHOLD + gap * (rader - 1));
    const visVenn = rest >= VENN;
    const fri = Math.max(0, visVenn ? rest - VENN : rest);
    const forhold = Math.min(1.4, FORHOLD + fri / (rader * b));
    brett.style.setProperty("--kb", b + "px");
    brett.style.setProperty("--gap", gap + "px");
    brett.style.setProperty("--forhold", forhold.toFixed(3));
    const venn = R.$(".ele-venn");
    if (venn) venn.hidden = !visVenn;
  }

  let vennId = null;
  function venn(klasse, tekst) {
    const v = R.$(".ele-venn");
    if (!v || v.hidden) return;
    const boble = v.querySelector(".ele-boble");
    boble.textContent = tekst;
    clearTimeout(vennId);
    v.classList.remove("jubel", "hmm", "snakker");
    void v.offsetWidth;
    v.classList.add(klasse, "snakker");
    vennId = setTimeout(() => v.classList.remove("jubel", "hmm", "snakker"), 1400);
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "spill") tilpass();
  });
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "spill") return;
    if (document.hidden) {
      stoppKlokke(S);
      R.lagre();
    } else startKlokke(S);
  });

  // ---------- Animation helpers ----------

  const kortEl = (i) => R.$(`.ele-kort[data-v="${i}"]`);

  function spill(el, klasse, ms) {
    if (!el || R.rolig()) return;
    el.classList.remove(klasse);
    void el.offsetWidth;
    el.classList.add(klasse);
    setTimeout(() => el.classList.remove(klasse), ms);
  }

  function snu(i, opp) {
    const el = kortEl(i);
    if (!el) return;
    el.classList.toggle("opp", opp);
    spill(el.querySelector(".ele-hopp"), "loft", 560);
  }

  function gnister(el) {
    if (!el || R.rolig()) return;
    el.style.zIndex = "3";
    setTimeout(() => (el.style.zIndex = ""), 820);
    const farger = ["var(--lampe)", "var(--rosa)", "var(--mynte)", "var(--himmel)", "var(--lilla)", "#fff"];
    for (let n = 0; n < 10; n++) {
      const g = document.createElement("span");
      g.className = "ele-gnist";
      g.style.setProperty("--v", `${n * 36 + Math.round(Math.random() * 20)}deg`);
      g.style.setProperty("--l", `${34 + Math.round(Math.random() * 26)}px`);
      g.style.background = farger[n % farger.length];
      el.appendChild(g);
      setTimeout(() => g.remove(), 800);
    }
  }

  function melding(html, klasse) {
    const m = R.$("#ele-melding");
    if (!m) return;
    clearTimeout(meldingId);
    m.className = "ele-melding vis " + (klasse || "");
    m.innerHTML = html;
    meldingId = setTimeout(() => m.classList.remove("vis"), 1500);
  }

  function oppdaterEtiketter(S, ...indekser) {
    for (const i of indekser) {
      const el = kortEl(i);
      if (el) el.setAttribute("aria-label", etikett(S.spill, i));
    }
  }

  function snuTilbake(S) {
    if (!venter) return;
    const { a, b, id } = venter;
    clearTimeout(id);
    venter = null;
    snu(a, false);
    snu(b, false);
    oppdaterEtiketter(S, a, b);
    if (S.spill.antall > 1) {
      oppdaterHud(S);
      const i = S.spill.tur;
      melding(navnLinje(i, "sin tur"), "tur");
      R.si(`${R.navn(i)} sin tur`);
    }
  }

  // ---------- End ----------

  function avslutt(S) {
    const sp = S.spill;
    stoppKlokke(S);
    sp.ferdig = true;
    if (sp.antall === 1) {
      const sek = Math.max(1, Math.round(sp.tid / 1000));
      const n = String(sp.kort.length);
      const gml = S.rekorder[n] || null;
      sp.resultat = {
        trekk: sp.trekk,
        sek,
        gml: gml ? { trekk: gml.trekk, tid: gml.tid } : null,
        nyTrekk: !!gml && sp.trekk < gml.trekk,
        nyTid: !!gml && sek < gml.tid,
      };
      S.rekorder[n] = { trekk: gml ? Math.min(gml.trekk, sp.trekk) : sp.trekk, tid: gml ? Math.min(gml.tid, sek) : sek };
    }
    R.lagre();
    las = true;
    // The celebration belongs to this board only: if the player leaves (and maybe starts a new
    // game) before it ends, nothing here may touch the next screen.
    const fortsatt = R.vakt();
    setTimeout(() => {
      if (!fortsatt() || R.rolig()) return;
      R.$$(".ele-kort").forEach((el, n) => setTimeout(() => fortsatt() && spill(el.querySelector(".ele-hopp"), "bolge", 600), n * 35));
    }, 650);
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil("slutt");
      },
      R.rolig() ? 900 : 1500 + sp.kort.length * 35,
    );
  }

  // All pairs of the game, in the order they were found, ringed in the finder's colour.
  function samling(sp) {
    const rekke = (sp.fant || []).filter((k, n, a) => a.indexOf(k) === n);
    for (const k of sp.kort) if (!rekke.includes(k)) rekke.push(k);
    const liste = LISTER[sp.tema];
    return `<section class="ele-samling" aria-labelledby="ele-samling-tittel">
      <h2 class="etikett" id="ele-samling-tittel">${sp.antall > 1 ? "Parene dere fant" : "Parene du fant"}</h2>
      <ul>${rekke
        .map((k, n) => {
          const f = sp.funnet[sp.kort.indexOf(k)];
          return `<li style="--n:${n}; --tint:${liste[k].tint}${sp.antall > 1 && f >= 0 ? `; --pf: var(--p${(f % 20) + 1})` : ""}"><span class="vh">${esc(liste[k].navn)}</span>${liste[k].html}</li>`;
        })
        .join("")}</ul>
    </section>`;
  }

  // Stars for a solo game: few moves compared to the number of pairs.
  function stjerner(sp) {
    const forhold = sp.trekk / parTotalt(sp);
    return forhold <= 1.6 ? 3 : forhold <= 2.3 ? 2 : 1;
  }
  const TITLER = { 3: "Elefanthukommelse!", 2: "Skarpt husket!", 1: "Alle par funnet!" };

  // ---------- Start ----------

  R.start({
    id: "elefanten",
    versjon: 1,
    // A game is in progress until all pairs are found (front page «Fortsett», screen wake lock).
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      antall: 1,
      oppsett: { tema: "dyr", kort: 16 },
      rekorder: {},
      spill: null,
    }),

    lastet(S) {
      if (!S.oppsett || !tema(S.oppsett.tema)) S.oppsett = { tema: "dyr", kort: 16 };
      if (!STORRELSER.includes(S.oppsett.kort)) S.oppsett.kort = 16;
      if (!S.rekorder || typeof S.rekorder !== "object") S.rekorder = {};
      S.antall = R.klamp(Number(S.antall) || 1, 1, 4);
      const sp = S.spill;
      if (sp) {
        const liste = LISTER[sp.tema];
        const ok =
          liste &&
          Array.isArray(sp.kort) &&
          STORRELSER.includes(sp.kort.length) &&
          sp.kort.every((k) => Number.isInteger(k) && k >= 0 && k < liste.length) &&
          Array.isArray(sp.funnet) &&
          sp.funnet.length === sp.kort.length &&
          Array.isArray(sp.poeng) &&
          sp.poeng.length === sp.antall;
        if (!ok) S.spill = null;
        else {
          // A pair that was waiting to turn back counts as turned back.
          if (!Array.isArray(sp.opp) || sp.opp.length > 1) sp.opp = [];
          sp.tur = R.klamp(sp.tur || 0, 0, sp.antall - 1);
        }
      }
      if (S.skjerm === "slutt" && (!S.spill || !S.spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "spill" && S.spill && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: {
      intro: "Alle kortene ligger med bildet ned. Snu to og to – og finn like par.",
      steg: [
        ["Snu to kort", "Trykk på to kort. Er bildene like, har du funnet et par!"],
        ["Husk hvor de lå", "Ikke like? Da snur kortene seg tilbake. Prøv å huske bildene."],
        ["Finn alle parene", "Alene: Klarer du det på færrest mulig trekk? Sammen: Et par gir en ekstra tur, og den med flest par vinner."],
      ],
      tips: [
        "Si navnet på bildet høyt når du snur det. Da husker du det lettere.",
        "Start med 12 kort hvis du er liten – eller 30 hvis du er en elefant.",
        "Rusj-gjengen er ekstra vanskelig: Alle figurene er runde og fargerike!",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = sp && !sp.ferdig;
          const rek = STORRELSER.filter((n) => S.rekorder[n]).map((n) => `<li><b>${n} kort</b> 🏆 ${S.rekorder[n].trekk} trekk · ⏱ ${visTid(S.rekorder[n].tid * 1000)}</li>`);
          return (
            R.ui.spillhjem({
              slagordHtml: "Snu to kort. Finn parene.<br><em>En elefant glemmer aldri!</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: !!aktiv,
                fortsettTekst: aktiv ? `Fortsett · ${parFunnet(sp)} av ${parTotalt(sp)} par` : "",
                ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
              }),
              merker: [
                ["1–4", "spillere"],
                [String(D.temaer.length), "temaer"],
                ["0", "reklame"],
              ],
            }) + (rek.length ? `<section class="ele-rekorder" aria-label="Dine rekorder"><p class="etikett">Dine rekorder</p><ul>${rek.join("")}</ul></section>` : "")
          );
        },
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Velg bilder</h2></div>
            ${R.ui.fliser(
              "tema",
              D.temaer.map((t) => ({
                v: t.id,
                tittel: t.navn,
                tekst: t.id === GJENGEN ? t.tekst : `${LISTER[t.id].length} bilder`,
                ikon: t.id === GJENGEN ? `<span class="ele-flisfigurer">${["luringen", "skjaera", "elefanten"].map((id) => G.svg(id)).join("")}</span>` : esc(t.ikon),
              })),
              S.oppsett.tema,
            )}
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Hvor mange kort?</h2><span class="tall">${S.oppsett.kort / 2} par</span></div>
            ${R.ui.seg("storrelse", STORRELSER.map((n) => [n, String(n)]), S.oppsett.kort, { etikett: "Antall kort" })}
            <div class="ele-skala" aria-hidden="true"><span>Lett</span><span>Elefant 🐘</span></div>
          </section>
          ${R.ui.spillere({
            min: 1,
            max: 4,
            tittel: "Hvem spiller?",
            hjelp: (S.antall || 1) > 1 ? "Dere bytter på. Finner du et par, får du en tur til." : "Alene? Slå din egen rekord. Legg til en spiller for å spille sammen.",
          })}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: "🐘" }))}`,
      },

      spill: {
        tittel: (S) => tema(S.spill.tema).navn,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.kort.length;
          const kol = KOLONNER[n] || 4;
          const del = nyDeling && !R.rolig();
          nyDeling = false;
          return `
            <h1 class="vh" id="skjerm-tittel">Memory – finn parene</h1>
            <div class="ele-topp">
              ${hudHtml(S)}
              <div class="ele-melding" id="ele-melding" aria-hidden="true"></div>
            </div>
            <div class="ele-bord">
              <div class="ele-brett${del ? " del" : ""}${sp.tema === GJENGEN ? " gjengen" : ""}" data-n="${n}" data-kol="${kol}" style="--kol:${kol}" role="group" aria-label="Kortene">
                ${sp.kort.map((_, i) => kortHtml(sp, i)).join("")}
              </div>
            </div>
            <div class="ele-venn" hidden aria-hidden="true">${R.figur()}<span class="ele-boble"></span></div>`;
        },
        etter() {
          tilpass();
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          R.holdVaken();
          startKlokke(S);
          const sp = S.spill;
          if (sp.antall > 1 && !sp.startet) {
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && melding(navnLinje(sp.tur, "begynner!"), "tur"), R.rolig() ? 0 : 500);
          }
          const id = setInterval(() => {
            const el = R.$("#ele-tid");
            if (el && R.S.spill) el.textContent = visTid(tidMs(R.S.spill));
          }, 250);
          R.vedForlat(() => clearInterval(id));
        },
        ut(S) {
          if (venter) {
            clearTimeout(venter.id);
            venter = null;
          }
          las = false;
          stoppKlokke(S);
          R.slippVaken();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const dokk =
            R.ui.flereSpill({ antall: sp.antall }) +
            R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'));
          if (sp.antall === 1) {
            const r = sp.resultat || { trekk: sp.trekk, sek: Math.round(sp.tid / 1000) };
            const st = stjerner(sp);
            const rekord = r.nyTrekk || r.nyTid;
            return `
              <div class="banner aksent">
                ${R.figur()}
                <p class="etikett">${parTotalt(sp)} av ${parTotalt(sp)} par</p>
                <h1 id="skjerm-tittel">${esc(TITLER[st])}</h1>
                <p class="ele-stjerner" aria-label="${st} av 3 stjerner">${[1, 2, 3].map((n) => `<span class="${n <= st ? "pa" : ""}" style="--n:${n}">★</span>`).join("")}</p>
              </div>
              <div class="ele-resultat">
                <div class="ele-tall${r.nyTrekk ? " ny" : ""}"><b>${r.trekk}</b><span>trekk</span>${r.nyTrekk ? '<i class="ele-ny">Rekord!</i>' : ""}</div>
                <div class="ele-tall${r.nyTid ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>tid</span>${r.nyTid ? '<i class="ele-ny">Rekord!</i>' : ""}</div>
              </div>
              <p class="hjelp">${
                rekord
                  ? `Ny personlig rekord på ${sp.kort.length} kort! Forrige: ${r.gml.trekk} trekk · ${visTid(r.gml.tid * 1000)}`
                  : r.gml
                    ? `Rekorden din på ${sp.kort.length} kort: ${r.gml.trekk} trekk · ${visTid(r.gml.tid * 1000)}`
                    : `Første gang på ${sp.kort.length} kort – nå har du en rekord å slå!`
              }</p>
              ${samling(sp)}
              ${dokk}`;
          }
          const rader = sp.poeng.map((p, i) => ({ i, poeng: p }));
          const best = Math.max(...sp.poeng);
          const vinnere = rader.filter((r) => r.poeng === best);
          const alene = vinnere.length === 1;
          return `
            <div class="banner aksent">
              ${alene ? `<span class="ele-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="ele-krone" aria-hidden="true">👑</span></span>` : R.figur()}
              <p class="etikett">${alene ? `Flest par · ${best} av ${parTotalt(sp)}` : `Like mange par · ${best} hver`}</p>
              <h1 id="skjerm-tittel">${esc(`${R.ramsOpp(vinnere.map((r) => R.navn(r.i)))} vinner!`)}</h1>
            </div>
            ${sp.antall >= 3 ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${samling(sp)}
            ${dokk}`;
        },
        // Celebrate in proportion: a fanfare for a win, a record or a good solo game; a warm
        // "pling" when it took many moves.
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          if (sp.antall > 1 || stjerner(sp) >= 2 || r.nyTrekk || r.nyTid) {
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

    handlinger: (H = {
      // A running game is never thrown away without asking (and nothing happens if the screen changed meanwhile).
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreftNytt(!!(S.spill && !S.spill.ferdig))) && fortsatt()) R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      fortsett: (el, e, S) => R.gaTil(S.spill && !S.spill.ferdig ? "spill" : "hjem"),
      tema(el, e, S) {
        S.oppsett.tema = el.dataset.v;
        R.vis();
      },
      storrelse(el, e, S) {
        S.oppsett.kort = Number(el.dataset.v);
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      snu(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || las) return;
        const i = Number(el.dataset.v);
        if (!(i >= 0 && i < sp.kort.length) || sp.funnet[i] >= 0) return;
        if (venter) {
          // Tapping on while two cards wait to turn back: turn them now and go on.
          const ventet = venter.a === i || venter.b === i;
          snuTilbake(S);
          if (ventet) return;
        }
        if (sp.opp.includes(i)) return;
        if (!sp.startet) {
          sp.startet = true;
          startKlokke(S);
        }
        snu(i, true);
        R.lyd.snu();
        R.vibrer(8);
        const navn = ansikt(sp, i).navn;
        R.si(navn);
        if (!sp.opp.length) {
          sp.opp = [i];
          oppdaterEtiketter(S, i);
          R.lagre();
          return;
        }
        const a = sp.opp[0];
        sp.opp = [];
        sp.trekk += 1;
        // The little reactions below only belong to this board.
        const fortsatt = R.vakt();
        if (sp.kort[a] === sp.kort[i]) {
          sp.funnet[a] = sp.tur;
          sp.funnet[i] = sp.tur;
          sp.poeng[sp.tur] += 1;
          (sp.fant = sp.fant || []).push(sp.kort[i]);
          R.lagre();
          for (const k of [a, i]) {
            const kel = kortEl(k);
            kel.classList.add("funnet");
            kel.setAttribute("aria-disabled", "true");
            if (sp.antall > 1) {
              kel.style.setProperty("--pf", `var(--p${(sp.tur % 20) + 1})`);
              kel.querySelector(".ele-for").insertAdjacentHTML("beforeend", `<span class="ele-merke" aria-hidden="true">${R.DYR[sp.tur % 20]}</span>`);
            }
          }
          oppdaterEtiketter(S, a, i);
          const ferdig = sp.funnet.every((f) => f >= 0);
          setTimeout(() => {
            if (!fortsatt()) return;
            R.lyd.riktig();
            R.vibrer([20, 40, 20]);
            for (const k of [a, i]) {
              spill(kortEl(k) && kortEl(k).querySelector(".ele-hopp"), "jubel", 700);
              gnister(kortEl(k));
            }
            venn("jubel", ferdig ? "Hurra!" : R.velg(JA));
          }, 380);
          oppdaterHud(S);
          if (ferdig) {
            melding(`<span>${esc(navn)}!</span>`, "par");
            avslutt(S);
          } else {
            melding(`<span>${esc(navn)}!</span>${sp.antall > 1 ? `<small>Ekstra tur til ${esc(R.navn(sp.tur))}</small>` : ""}`, "par");
            R.si(`Et par: ${navn}${sp.antall > 1 ? `. Ekstra tur til ${R.navn(sp.tur)}` : ""}`);
          }
          return;
        }
        // Not a pair: the turn passes now (saved), the cards turn back a moment later.
        if (sp.antall > 1) sp.tur = (sp.tur + 1) % sp.antall;
        R.lagre();
        oppdaterEtiketter(S, a, i);
        const hud = R.$("#ele-trekk");
        if (hud) hud.textContent = sp.trekk;
        setTimeout(() => {
          if (!fortsatt()) return;
          for (const k of [a, i]) spill(kortEl(k) && kortEl(k).querySelector(".ele-hopp"), "nei", 450);
          // A soft "bonk" – not a buzzer: missing is part of the game.
          R.lyd.tone(330, 0, 0.12, "triangle", 0.09, 220);
          R.lyd.tone(250, 0.1, 0.16, "triangle", 0.08, 170);
          if (Math.random() < 0.6) venn("hmm", R.velg(NEI));
        }, 430);
        venter = { a, b: i, id: setTimeout(() => snuTilbake(S), 1250) };
      },
    }),
  });
})();
