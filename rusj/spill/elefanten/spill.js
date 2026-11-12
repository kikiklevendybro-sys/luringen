/* Elefanten — a pairs game (find two alike).
   Turn two cards and find the pairs. Alone: beat your own record (moves and time) for each board
   size. Against the elephant: the phone plays the other side, with a memory that leaks – three
   strengths, from the calf that forgets most of what it sees to the old one that never forgets.
   2–4 players: take turns, a pair gives another turn, most pairs wins; when it is level at the
   top, those who share the lead settle it on a small extra board.
   The board is drawn once per screen; flips are class changes so the 3D animations stay smooth.
   The rules at the top are pure functions; test/elefanten.test.mjs loads this file without the kit. */
(function () {
  "use strict";

  // ---------- Rules (no kit needed) ----------

  // Cards on the board. Two sides (two players, or one against the elephant) get an odd number
  // of pairs, so somebody always wins.
  const STORRELSER = [12, 16, 20, 24, 30];
  const STORRELSER_TO = [14, 18, 22, 26, 30];
  // husk: the chance that a card the elephant sees being turned, sticks in its memory.
  // Every text goes through Rusj.t (rusj/SPRAK.md): the key is the Norwegian text. The unit tests
  // load this file without the kit, and then the Norwegian text is used as it is.
  const Rusj = window.Rusj && typeof window.Rusj.t === "function" ? window.Rusj : { t: (k) => k };
  const STYRKER = [
    { id: "unge", navn: Rusj.t("Elefantunge"), tekst: Rusj.t("Glemmer det meste"), bestemt: Rusj.t("elefantungen"), husk: 0.35 },
    { id: "voksen", navn: Rusj.t("Elefant"), tekst: Rusj.t("Husker en god del"), bestemt: Rusj.t("elefanten"), husk: 0.65 },
    { id: "gammel", navn: Rusj.t("Gammel elefant"), tekst: Rusj.t("Glemmer aldri"), bestemt: Rusj.t("den gamle elefanten"), husk: 1 },
  ];
  const styrke = (id) => STYRKER.find((s) => s.id === id) || STYRKER[0];

  // Stars for a game alone: few moves compared to the number of pairs. A flawless memory needs
  // about 1.6 moves per pair; three stars are within reach of a child who remembers half of what it sees.
  const stjernerFor = (trekk, par) => (trekk / par <= 1.9 ? 3 : trekk / par <= 2.6 ? 2 : 1);

  // The players with the most pairs (all of them, or only those in `blant`).
  function ledere(poeng, blant) {
    const med = blant || poeng.map((_, i) => i);
    const best = Math.max(...med.map((i) => poeng[i]));
    return med.filter((i) => poeng[i] === best);
  }
  // A tie-break board: three pairs for two players (never level), five for three or four (then at
  // most two can still share the lead – and they get three).
  const omkampPar = (antall) => (antall <= 2 ? 3 : 5);

  // The elephant's brain. kort: the face of every card · funnet: -1 or who found it · husk: the
  // cards (positions) the elephant remembers · rng: a function that gives numbers from 0 to 1.
  const Hjerne = {
    // A card is turned while the elephant watches: it sticks with the chance p. Every time a
    // card is shown is a new chance.
    se(husk, i, p, rng) {
      if (!husk.includes(i) && rng() < p) husk.push(i);
    },
    // Cards that are found are of no interest any more.
    rydd: (husk, funnet) => husk.filter((i) => funnet[i] < 0),
    // Does the elephant remember both cards of a pair?
    kjennerPar(kort, funnet, husk) {
      const k = husk.filter((i) => funnet[i] < 0);
      return k.some((i) => k.some((j) => j !== i && kort[j] === kort[i]));
    },
    // The card to turn. apen: the card the elephant has already turned in this move, or -1.
    // First card: one of a pair it remembers both of, else a card it has not seen (that one may
    // match something it remembers). Second card: the mate if it remembers where that is, else
    // a card it has not seen – a card it knows is not the mate, is never turned.
    velg(kort, funnet, husk, apen, rng) {
      const ledige = kort.map((_, i) => i).filter((i) => funnet[i] < 0 && i !== apen);
      const kjente = husk.filter((i) => funnet[i] < 0 && i !== apen);
      const ukjente = ledige.filter((i) => !kjente.includes(i));
      const tilfeldig = (liste) => liste[Math.floor(rng() * liste.length)];
      if (apen >= 0) {
        const make = kjente.find((i) => kort[i] === kort[apen]);
        return make != null ? make : tilfeldig(ukjente.length ? ukjente : ledige);
      }
      const iPar = kjente.find((i) => kjente.some((j) => j !== i && kort[j] === kort[i]));
      return iPar != null ? iPar : tilfeldig(ukjente.length ? ukjente : ledige);
    },
  };

  // The Christmas pictures are offered from 1 November to 6 January. dag: "2026-12-24".
  function erJul(dag) {
    const [, m, d] = String(dag).split("-").map(Number);
    return m === 11 || m === 12 || (m === 1 && d <= 6);
  }

  const R = window.Rusj;
  if (!R) {
    window.Elefanten = { STORRELSER, STORRELSER_TO, STYRKER, stjernerFor, ledere, omkampPar, Hjerne, erJul };
    return;
  }

  // ---------- The game ----------

  const G = window.RusjGjengen;
  const D = window.RUSJ_DATA.temaer;
  const esc = R.esc;

  const FORHOLD = 1.22; // card height / width
  const TINTER = ["#ffd6e4", "#d4efff", "#d9f6cf", "#fff0bd", "#e6d9ff", "#ffdcc7", "#cbf6e8", "#f5d6ff", "#dae2ff", "#ffe4dc"];
  const GJENGEN = "gjengen";
  const JUL = "jul";
  const MODUSER = ["alene", "elefant", "sammen"];
  // The address to share: this edition's page (rusj.no/elefanten/, rusj.no/en/<slug>/ …).
  const DEL_URL = "https://rusj.no" + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "elefanten") + "/";

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
  const julNa = () => erJul(R.dag().tekst);
  // The themes on offer now: the Christmas pictures first, in season only.
  const temaerNa = () => (julNa() ? [...D.temaer.filter((t) => t.id === JUL), ...D.temaer.filter((t) => t.id !== JUL)] : D.temaer.filter((t) => t.id !== JUL));

  const JA = [R.t("Bra!"), R.t("Supert!"), R.t("Ja!"), R.t("Husket!"), R.t("Kjempebra!"), R.t("Wow!"), R.t("Tøft!"), R.t("Elefantbra!")];
  const NEI = [R.t("Nesten!"), R.t("Hmm …"), R.t("Prøv igjen!"), R.t("Oi!"), R.t("Husk dem!"), R.t("Snart!")];
  // What the elephant says when it plays itself.
  const VET = [R.t("Den husker jeg!"), R.t("Jeg vet det!"), R.t("Aha!"), R.t("Den så jeg!")];
  const TENKER = [R.t("Hmm …"), R.t("Hvor var den nå …"), R.t("La meg se …"), R.t("Tja …")];
  const TOK = [R.t("Husket!"), R.t("Tut-tut!"), R.t("Elefantbra!"), R.t("Der ja!")];
  const BOM = [R.t("Glemte det …"), R.t("Æsj!"), R.t("Nesten!"), R.t("Oi da!")];

  let H; // actions
  let las = false; // input locked (the peek at the start, the end of a game)
  let venter = null; // { a, b, id } two unequal cards that are about to turn back
  let klokkeFra = null; // performance.now() when the clock last started
  let nyDeling = false; // deal the cards with an animation on the next draw
  let meldingId = null;
  let turNr = 0; // the elephant's move that is running (a newer one, or leaving the board, stops it)

  // ---------- Game ----------

  const erSammen = (sp) => sp.antall > 1 && !sp.motstander;
  const tilbud = (S) => (S.oppsett.modus === "elefant" || (S.oppsett.modus === "sammen" && R.klamp(S.antall || 2, 2, 4) === 2) ? STORRELSER_TO : STORRELSER);
  const kortValgt = (S) => tilbud(S)[Math.max(0, STORRELSER.indexOf(S.oppsett.kort))];

  function del(temaId, par) {
    const liste = LISTER[temaId];
    const rng = R.rng(R.nyttFro());
    const valgte = R.stokk(liste.map((_, i) => i), rng).slice(0, Math.min(par, liste.length));
    return R.stokk([...valgte, ...valgte], rng);
  }

  function nyttSpill(S) {
    const o = S.oppsett;
    const modus = MODUSER.includes(o.modus) ? o.modus : "alene";
    const kort = del(o.tema, kortValgt(S) / 2);
    const antall = modus === "sammen" ? R.klamp(S.antall || 2, 2, 4) : modus === "elefant" ? 2 : 1;
    S.spill = {
      modus,
      tema: o.tema,
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
      kikk: !!o.kikk,
      kikket: false,
      omkamp: 0,
      med: null,
    };
    if (modus === "elefant") {
      // The elephant: player 1. Its memory and the seed of its dice live in the saved game, so a
      // reload continues the very same game.
      S.spill.motstander = styrke(o.styrke).id;
      S.spill.husk = [];
      S.spill.efro = R.nyttFro() >>> 0;
    }
    venter = null;
    klokkeFra = null;
    las = false;
    nyDeling = true;
    R.statistikk("start", { modus, kort: kort.length, tema: o.tema, spillere: antall, ...(modus === "elefant" ? { styrke: S.spill.motstander } : {}), kikk: !!o.kikk });
  }

  // Level at the top after the last pair: a small new board for those who share the lead.
  function startOmkamp(S, topp) {
    const sp = S.spill;
    sp.kort = del(sp.tema, omkampPar(topp.length));
    sp.funnet = sp.kort.map(() => -1);
    sp.opp = [];
    sp.omkamp = (sp.omkamp || 0) + 1;
    sp.med = topp;
    sp.tur = topp[0];
    nyDeling = true;
  }

  const ansikt = (sp, i) => LISTER[sp.tema][sp.kort[i]];
  const parTotalt = (sp) => sp.kort.length / 2;
  const parFunnet = (sp) => sp.funnet.filter((f) => f >= 0).length / 2;
  const erElefantensTur = (sp) => !!sp.motstander && sp.tur === 1 && !sp.ferdig;
  // Who is player i on this board? Against the elephant: «Du» and «Elefanten».
  const hvem = (sp, i) => (sp.motstander ? (i === 0 ? R.t("Du") : R.t("Elefanten")) : R.navn(i));
  const fargeFor = (sp, i) => (sp.motstander && i === 1 ? "var(--aksent)" : `var(--p${(i % 20) + 1})`);
  const merkeFor = (sp, i) => (sp.motstander && i === 1 ? "🐘" : R.DYR[i % 20]);
  const avatarFor = (sp, i) => (sp.motstander && i === 1 ? `<span class="avatar ele-elefant" aria-hidden="true">${G.svg("elefanten")}</span>` : R.avatar(i));
  const rekordNokkel = (sp) => (sp.tema === GJENGEN ? "g" : "") + sp.kort.length;

  // One number from the elephant's dice. The seed moves on in the saved game.
  function terning(sp) {
    const r = R.rng(sp.efro >>> 0)();
    sp.efro = (Math.imul(sp.efro, 1664525) + 1013904223) >>> 0;
    return r;
  }

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
    if (f >= 0) return R.t("{bilde} – funnet", { bilde: ansikt(sp, i).navn });
    if (sp.opp.includes(i) || (venter && (venter.a === i || venter.b === i))) return R.t("Kort {n}: {bilde}", { n: i + 1, bilde: ansikt(sp, i).navn });
    return R.t("Kort {n}", { n: i + 1 });
  }

  // ---------- Markup ----------

  function kortHtml(sp, i) {
    const t = ansikt(sp, i);
    const f = sp.funnet[i];
    const opp = f >= 0 || sp.opp.includes(i);
    const flere = sp.antall > 1;
    const merke = f >= 0 && flere ? `<span class="ele-merke" aria-hidden="true">${merkeFor(sp, f)}</span>` : "";
    return `<button class="ele-kort${opp ? " opp" : ""}${f >= 0 ? " funnet" : ""}" data-h="snu" data-v="${i}" data-stille
        style="--i:${i}; --tint:${t.tint}${f >= 0 && flere ? `; --pf: ${fargeFor(sp, f)}` : ""}" aria-label="${esc(etikett(sp, i))}"${f >= 0 ? ' aria-disabled="true"' : ""}>
      <span class="ele-hopp"><span class="ele-indre">
        <span class="ele-side ele-bak"></span>
        <span class="ele-side ele-for">${t.html}${merke}</span>
      </span></span>
    </button>`;
  }

  function hudHtml(S) {
    const sp = S.spill;
    if (sp.antall === 1) {
      const rek = S.rekorder[rekordNokkel(sp)];
      return `<div class="ele-hud solo">
        <span class="ele-stat"><small>${esc(R.t("Par"))}</small><b id="ele-par">${parFunnet(sp)}/${parTotalt(sp)}</b></span>
        <span class="ele-stat"><small>${esc(R.t("Trekk"))}</small><b id="ele-trekk">${sp.trekk}</b></span>
        <span class="ele-stat"><small>${esc(R.t("Tid"))}</small><b id="ele-tid">${visTid(tidMs(sp))}</b></span>
        <span class="ele-stat rekord"><small>${esc(R.t("Rekord"))}</small><b>${rek ? `🏆 ${rek.trekk}` : "–"}</b></span>
      </div>`;
    }
    // Names may wrap to two lines; with three or four players the name gets its own line under the avatar.
    // In a tie-break only those who share the lead play: the others are dimmed.
    return `<div class="ele-hud flere${sp.antall >= 3 ? " stablet" : ""}" style="--antall:${sp.antall}" role="list" aria-label="${esc(R.t("Poeng"))}">${sp.poeng
      .map(
        (p, i) => `<span class="ele-spiller${i === sp.tur ? " na" : ""}${sp.med && !sp.med.includes(i) ? " ute" : ""}" role="listitem" style="--pf: ${fargeFor(sp, i)}"${i === sp.tur ? ' aria-current="true"' : ""}>
          ${avatarFor(sp, i)}<span class="ele-navn">${esc(hvem(sp, i))}</span><b class="ele-poeng">${p}</b>
        </span>`,
      )
      .join("")}</div>`;
  }
  // "Name / what happens" on two lines, so long names are never cut.
  const navnLinje = (sp, i, tekst) => `${avatarFor(sp, i)}<span class="ele-m-tekst"><b>${esc(hvem(sp, i))}</b><small>${esc(tekst)}</small></span>`;
  // Whose turn it is, as the message over the score and for screen readers.
  function meldTur(S, begynner) {
    const sp = S.spill;
    const i = sp.tur;
    if (sp.motstander) {
      const tekst = i === 0 ? (begynner ? R.t("Du begynner!") : R.t("Din tur")) : R.t("Elefantens tur");
      melding(`${avatarFor(sp, i)}<span class="ele-m-tekst"><b>${esc(tekst)}</b></span>`, "tur");
      R.si(tekst);
      return;
    }
    melding(navnLinje(sp, i, begynner ? R.t("begynner!") : R.t("sin tur")), "tur");
    R.si(begynner ? R.t("{navn} begynner", { navn: R.navn(i) }) : R.t("{navn} sin tur", { navn: R.navn(i) }));
  }

  function oppdaterHud(S) {
    const gml = R.$(".ele-hud");
    if (!gml) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = hudHtml(S);
    gml.replaceWith(tmp.firstElementChild);
  }

  // ---------- Board size: the whole board fits on the screen without scrolling ----------

  // Cards are 1.22 times as tall as wide, up to 1.4 when there is spare room; with plenty of room
  // the elephant sits under the board and cheers. The number of columns is the one that gives the
  // biggest cards (a phone on its side: 30 cards as 10 × 3 instead of 5 × 6); full rows are worth
  // a little, a last row with a single card costs a lot. Against the elephant the board makes
  // room for it when the cards stay comfortably big: it is the other player.
  const VENN = 116;
  function tilpass() {
    const brett = R.$(".ele-brett");
    const bord = R.$(".ele-bord");
    if (!brett || !bord) return;
    const n = Number(brett.dataset.n);
    const gap = n >= 24 ? 7 : n >= 16 ? 9 : 11;
    const bredde = bord.clientWidth;
    const topp = bord.getBoundingClientRect().top + window.scrollY;
    const hoyde = window.innerHeight - topp - 20;
    const liggende = window.innerWidth > window.innerHeight && window.innerHeight <= 500;
    const finn = (h) => {
      let best = null;
      for (let k = Math.min(n, 3); k <= Math.min(n, 15); k++) {
        const r = Math.ceil(n / k);
        const b = Math.min((bredde - gap * (k - 1)) / k, (h - gap * (r - 1)) / r / FORHOLD, 128);
        const sist = n - (r - 1) * k;
        const poeng = b * (sist === k ? 1.12 : sist === 1 ? 0.7 : 1);
        if (!best || poeng > best.poeng + 0.5) best = { k, r, b, poeng };
      }
      return best;
    };
    let valgt = finn(hoyde);
    const rest = (v) => hoyde - (v.r * Math.floor(Math.max(44, v.b)) * FORHOLD + gap * (v.r - 1));
    let visVenn = rest(valgt) >= VENN;
    if (!visVenn && !liggende && brett.dataset.venn === "1") {
      const medVenn = finn(hoyde - VENN);
      if (medVenn.b >= 58) {
        valgt = medVenn;
        visVenn = true;
      }
    }
    const b = Math.floor(Math.max(44, valgt.b));
    const fri = Math.max(0, visVenn ? rest(valgt) - VENN : rest(valgt));
    const forhold = Math.min(1.4, FORHOLD + fri / (valgt.r * b));
    brett.style.setProperty("--kol", valgt.k);
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
      meldTur(S);
      elefantTur(S);
    }
  }

  // ---------- A move ----------

  // The turn passes: to the next player, or in a tie-break to the next of those who share the lead.
  function nesteTur(sp) {
    if (sp.antall < 2) return;
    const ko = Array.isArray(sp.med) && sp.med.length ? sp.med : sp.poeng.map((_, i) => i);
    sp.tur = ko[(ko.indexOf(sp.tur) + 1) % ko.length];
  }

  // Turn card i for the player whose turn it is (a person or the elephant).
  // Returns "forste" (one card up), "par", "ferdig" (the last pair) or "bom".
  function vend(S, i) {
    const sp = S.spill;
    if (!sp.startet) {
      sp.startet = true;
      startKlokke(S);
    }
    snu(i, true);
    R.lyd.snu();
    R.vibrer(8);
    const navn = ansikt(sp, i).navn;
    R.si(navn);
    // The elephant watches every card that is turned – and remembers some of them.
    if (sp.motstander) Hjerne.se(sp.husk, i, styrke(sp.motstander).husk, () => terning(sp));
    if (!sp.opp.length) {
      sp.opp = [i];
      oppdaterEtiketter(S, i);
      R.lagre();
      return "forste";
    }
    const a = sp.opp[0];
    sp.opp = [];
    sp.trekk += 1;
    const elefanten = erElefantensTur(sp);
    // The little reactions below only belong to this board.
    const fortsatt = R.vakt();
    if (sp.kort[a] === sp.kort[i]) {
      const f = sp.tur;
      sp.funnet[a] = f;
      sp.funnet[i] = f;
      sp.poeng[f] += 1;
      sp.fant.push([sp.kort[i], f]);
      if (sp.motstander) sp.husk = Hjerne.rydd(sp.husk, sp.funnet);
      R.lagre();
      for (const k of [a, i]) {
        const kel = kortEl(k);
        kel.classList.add("funnet");
        kel.setAttribute("aria-disabled", "true");
        if (sp.antall > 1) {
          kel.style.setProperty("--pf", fargeFor(sp, f));
          kel.querySelector(".ele-for").insertAdjacentHTML("beforeend", `<span class="ele-merke" aria-hidden="true">${merkeFor(sp, f)}</span>`);
        }
      }
      oppdaterEtiketter(S, a, i);
      const ferdig = sp.funnet.every((x) => x >= 0);
      setTimeout(() => {
        if (!fortsatt()) return;
        R.lyd.riktig();
        R.vibrer([20, 40, 20]);
        for (const k of [a, i]) {
          spill(kortEl(k) && kortEl(k).querySelector(".ele-hopp"), "jubel", 700);
          gnister(kortEl(k));
        }
        venn("jubel", elefanten ? R.velg(TOK) : ferdig ? R.t("Hurra!") : R.velg(JA));
      }, 380);
      oppdaterHud(S);
      const ekstra = sp.motstander ? (elefanten ? R.t("Ekstra tur til elefanten") : R.t("Ekstra tur til deg")) : sp.antall > 1 ? R.t("Ekstra tur til {navn}", { navn: R.navn(f) }) : "";
      if (ferdig) {
        melding(`<span>${esc(navn)}!</span>`, "par");
        avslutt(S);
        return "ferdig";
      }
      melding(`<span>${esc(navn)}!</span>${ekstra ? `<small>${esc(ekstra)}</small>` : ""}`, "par");
      R.si(R.t("Et par: {bilde}", { bilde: navn }) + (ekstra ? `. ${ekstra}` : ""));
      return "par";
    }
    // Not a pair: the turn passes now (saved), the cards turn back a moment later.
    nesteTur(sp);
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
      if (elefanten) venn("hmm", R.velg(BOM));
      else if (Math.random() < 0.6) venn("hmm", R.velg(NEI));
    }, 430);
    venter = { a, b: i, id: setTimeout(() => snuTilbake(S), 1250) };
    return "bom";
  }

  // The elephant's turn: it thinks, turns a card, turns another – and goes on while it finds
  // pairs. Taps wait meanwhile. A newer call (after a reload, or back on the board) takes over.
  async function elefantTur(S) {
    const sp = S.spill;
    if (!sp || !erElefantensTur(sp) || venter) return;
    const mitt = ++turNr;
    const stopp = () => mitt !== turNr || S.spill !== sp || sp.ferdig || S.skjerm !== "spill";
    const fart = R.rolig() ? 0.5 : 1;
    const rng = () => terning(sp);
    while (erElefantensTur(sp)) {
      let a = sp.opp.length ? sp.opp[0] : -1;
      if (a < 0) {
        const vet = Hjerne.kjennerPar(sp.kort, sp.funnet, sp.husk);
        venn(vet ? "jubel" : "hmm", R.velg(vet ? VET : TENKER));
        await R.vent(700 * fart);
        if (stopp()) return;
        a = Hjerne.velg(sp.kort, sp.funnet, sp.husk, -1, rng);
        vend(S, a);
      }
      await R.vent(650 * fart);
      if (stopp()) return;
      if (vend(S, Hjerne.velg(sp.kort, sp.funnet, sp.husk, a, rng)) !== "par") return;
      await R.vent(900 * fart);
      if (stopp()) return;
    }
  }

  // «Kikk først»: every card face up for three seconds before the first move. The elephant
  // does not look.
  async function kikk(S) {
    const sp = S.spill;
    las = true;
    const fortsatt = R.vakt();
    await R.vent(R.rolig() ? 250 : 650 + sp.kort.length * 26);
    if (!fortsatt()) return;
    R.$$(".ele-kort").forEach((el) => el.classList.add("opp"));
    R.lyd.sveip();
    melding(`<span>${esc(R.t("Se godt!"))}</span>${sp.motstander ? `<small>${esc(R.t("Elefanten kikker ikke"))}</small>` : ""}`, "par");
    R.si(R.t("Se godt! Alle kortene vises i tre sekunder."));
    venn("hmm", sp.motstander ? R.t("Jeg kikker ikke!") : R.t("Se godt!"));
    await R.vent(3000);
    if (!fortsatt()) return;
    R.$$(".ele-kort").forEach((el) => el.classList.remove("opp"));
    R.lyd.sveip();
    sp.kikket = true;
    R.lagre();
    las = false;
    if (sp.antall > 1) meldTur(S, true);
  }

  // ---------- End ----------

  function avslutt(S) {
    const sp = S.spill;
    stoppKlokke(S);
    // Together, and level at the top: no shared win – those who share the lead play on.
    const topp = erSammen(sp) ? ledere(sp.poeng) : [];
    const omkamp = topp.length > 1;
    if (omkamp) startOmkamp(S, topp);
    else {
      sp.ferdig = true;
      if (sp.antall === 1) {
        const sek = Math.max(1, Math.round(sp.tid / 1000));
        const n = rekordNokkel(sp);
        const gml = S.rekorder[n] || null;
        const st = stjernerFor(sp.trekk, parTotalt(sp));
        sp.resultat = {
          trekk: sp.trekk,
          sek,
          st,
          gml: gml ? { trekk: gml.trekk, tid: gml.tid } : null,
          // (a game with «Kikk først» is a practice game: it never touches the record)
          nyTrekk: !sp.kikk && !!gml && sp.trekk < gml.trekk,
          nyTid: !sp.kikk && !!gml && sek < gml.tid,
        };
        if (!sp.kikk) S.rekorder[n] = { trekk: gml ? Math.min(gml.trekk, sp.trekk) : sp.trekk, tid: gml ? Math.min(gml.tid, sek) : sek, st: Math.max(st, (gml && gml.st) || 0) };
        R.statistikk("ferdig", { modus: "alene", kort: sp.kort.length, trekk: sp.trekk, stjerner: st });
      } else if (sp.motstander) {
        const e = S.elefant[sp.motstander];
        const vant = sp.poeng[0] > sp.poeng[1];
        e.spilt += 1;
        if (vant) e.seirer += 1;
        sp.resultat = { vant, seirer: e.seirer, spilt: e.spilt };
        R.statistikk("ferdig", { modus: "elefant", styrke: sp.motstander, vant, kort: sp.kort.length });
      } else {
        // People ranked against each other: the result goes to «Kveldens gjeng».
        R.kveld.registrer(sp.poeng.map((p, i) => ({ i, poeng: p })));
        R.statistikk("ferdig", { modus: "sammen", spillere: sp.antall, omkamp: sp.omkamp || 0 });
      }
    }
    R.lagre();
    las = true;
    // The celebration belongs to this board only: if the player leaves (and maybe starts a new
    // game) before it ends, nothing here may touch the next screen.
    const fortsatt = R.vakt();
    const antall = R.$$(".ele-kort").length;
    setTimeout(() => {
      if (!fortsatt() || R.rolig()) return;
      R.$$(".ele-kort").forEach((el, n) => setTimeout(() => fortsatt() && spill(el.querySelector(".ele-hopp"), "bolge", 600), n * 35));
    }, 650);
    setTimeout(
      () => {
        if (!fortsatt()) return;
        las = false;
        R.gaTil(omkamp ? "omkamp" : "slutt");
      },
      R.rolig() ? 900 : 1500 + antall * 35,
    );
  }

  // All pairs of the game, in the order they were found, ringed in the finder's colour.
  function samling(sp) {
    const liste = LISTER[sp.tema];
    return `<section class="ele-samling" aria-labelledby="ele-samling-tittel">
      <h2 class="etikett" id="ele-samling-tittel">${esc(sp.motstander ? R.t("Parene dere fant") : sp.antall > 1 ? R.t("Parene dere fant") : R.t("Parene du fant"))}</h2>
      <ul>${sp.fant
        .map(([k, f], n) => `<li style="--n:${n}; --tint:${liste[k].tint}${sp.antall > 1 ? `; --pf: ${fargeFor(sp, f)}` : ""}"><span class="vh">${esc(liste[k].navn)}</span>${liste[k].html}</li>`)
        .join("")}</ul>
    </section>`;
  }

  const TITLER = { 3: R.t("Elefanthukommelse!"), 2: R.t("Skarpt husket!"), 1: R.t("Alle par funnet!") };
  const stjerneHtml = (st) => `<p class="ele-stjerner" role="img" aria-label="${esc(R.t("{n} av 3 stjerner", { n: st }))}">${[1, 2, 3].map((n) => `<span class="${n <= st ? "pa" : ""}" style="--n:${n}">${n <= st ? "★" : "☆"}</span>`).join("")}</p>`;
  const hvor = (sp) => (sp.tema === GJENGEN ? R.t("{n} kort med Rusj-gjengen", { n: sp.kort.length }) : R.t("{n} kort", { n: sp.kort.length }));

  function soloResultat(S) {
    const sp = S.spill;
    const r = sp.resultat || { trekk: sp.trekk, sek: Math.round(sp.tid / 1000), st: stjernerFor(sp.trekk, parTotalt(sp)) };
    const st = r.st || stjernerFor(sp.trekk, parTotalt(sp));
    const rekord = r.nyTrekk || r.nyTid;
    let linje;
    if (sp.kikk) linje = R.t("Med «Kikk først» er det et øvingsspill – rekorden står urørt.");
    else if (rekord) linje = R.t("Ny rekord på {hvor}! Forrige: {trekk} trekk · {tid}", { hvor: hvor(sp), trekk: r.gml.trekk, tid: visTid(r.gml.tid * 1000) });
    else if (r.gml) {
      const unna = r.trekk - r.gml.trekk;
      linje =
        (unna > 0 ? (unna === 1 ? R.t("Bare ett trekk fra rekorden!") : R.t("{n} trekk fra rekorden!", { n: unna })) : R.t("Like få trekk som rekorden!")) +
        " " +
        R.t("Rekorden din på {hvor}: {trekk} trekk · {tid}", { hvor: hvor(sp), trekk: r.gml.trekk, tid: visTid(r.gml.tid * 1000) });
    } else linje = R.t("Første gang på {hvor} – nå har du en rekord å slå!", { hvor: hvor(sp) });
    return `
      <div class="banner aksent">
        ${R.ui.figur(null, { stemning: st >= 2 || rekord ? "jubel" : "" })}
        <p class="etikett">${esc(R.t("{n} av {alle} par", { n: parTotalt(sp), alle: parTotalt(sp) }))}</p>
        <h1 id="skjerm-tittel">${esc(TITLER[st])}</h1>
        ${stjerneHtml(st)}
      </div>
      <div class="ele-resultat">
        <div class="ele-tall${r.nyTrekk ? " ny" : ""}"><b>${r.trekk}</b><span>${esc(R.t("trekk"))}</span>${r.nyTrekk ? `<i class="ele-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
        <div class="ele-tall${r.nyTid ? " ny" : ""}"><b>${visTid(r.sek * 1000)}</b><span>${esc(R.t("tid"))}</span>${r.nyTid ? `<i class="ele-ny">${esc(R.t("Rekord!"))}</i>` : ""}</div>
      </div>
      <p class="hjelp">${esc(linje)}</p>
      ${R.ui.knapp2(R.t("Del resultatet"), "del")}
      ${samling(sp)}`;
  }

  function elefantResultat(S) {
    const sp = S.spill;
    const s = styrke(sp.motstander);
    const r = sp.resultat || { vant: sp.poeng[0] > sp.poeng[1], seirer: 0, spilt: 0 };
    const neste = STYRKER[STYRKER.indexOf(s) + 1];
    const tekst = r.vant
      ? s.id === "gammel"
        ? R.t("Du slo den gamle elefanten – den som aldri glemmer!")
        : R.t("Du slo {hvem}. Tør du prøve en som husker mer?", { hvem: s.bestemt })
      : s.id === "unge"
        ? R.t("Elefantungen husket litt mer enn deg denne gangen. Prøv igjen!")
        : s.id === "voksen"
          ? R.t("Elefanten husket mest denne gangen. Prøv igjen – eller ta en som husker litt mindre.")
          : R.t("Den gamle elefanten glemmer aldri. Prøv igjen – eller ta en som husker litt mindre.");
    return `
      <div class="banner aksent">
        ${r.vant ? `<span class="ele-vinner">${R.avatar(0, "gigant")}<span class="ele-krone" aria-hidden="true">👑</span></span>` : R.ui.figur(null, { stemning: "jubel" })}
        <p class="etikett">${esc(R.t("{a} mot {b} par · {navn}", { a: sp.poeng[0], b: sp.poeng[1], navn: s.navn }))}</p>
        <h1 id="skjerm-tittel">${esc(r.vant ? R.t("Du vant!") : R.t("Elefanten vant!"))}</h1>
        <p class="ingress">${esc(tekst)}</p>
      </div>
      ${r.seirer ? `<p class="ele-seirer"><span>${esc(R.t("Seirer mot {hvem}", { hvem: s.bestemt }))}</span> <b>🏆 ${r.seirer}</b></p>` : ""}
      ${r.vant && neste ? R.ui.knapp2(R.t("Prøv mot {hvem}", { hvem: neste.bestemt }), "sterkere") : ""}
      ${r.vant ? R.ui.knapp2(R.t("Del resultatet"), "del") : ""}
      ${samling(sp)}`;
  }

  function sammenResultat(S) {
    const sp = S.spill;
    const rader = sp.poeng.map((p, i) => ({ i, poeng: p }));
    const best = Math.max(...sp.poeng);
    const vinnere = rader.filter((r) => r.poeng === best);
    const alene = vinnere.length === 1;
    const alle = sp.poeng.reduce((s, p) => s + p, 0);
    return `
      <div class="banner aksent">
        ${alene ? `<span class="ele-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="ele-krone" aria-hidden="true">👑</span></span>` : R.ui.figur(null, { stemning: "jubel" })}
        <p class="etikett">${esc(alene ? R.t("Flest par · {n} av {alle}", { n: best, alle }) + (sp.omkamp ? " · " + R.t("vant omkampen") : "") : R.t("Like mange par · {n} hver", { n: best }))}</p>
        <h1 id="skjerm-tittel">${esc(R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((r) => R.navn(r.i))), n: vinnere.length }))}</h1>
      </div>
      ${sp.antall >= 3 ? R.ui.pall(rader, { enhet: R.t("par") }) : ""}
      ${R.ui.poengliste(rader)}
      ${samling(sp)}`;
  }

  function delTekst(S) {
    const sp = S.spill;
    if (sp.motstander) return R.t("Elefanten 🐘 Jeg slo {hvem} {a}–{b} i å finne to like. Klarer du det?", { hvem: styrke(sp.motstander).bestemt, a: sp.poeng[0], b: sp.poeng[1] });
    const r = sp.resultat || {};
    return R.t("Elefanten 🐘 {hvor} på {trekk} trekk {stjerner}\nKlarer du det på færre?", { hvor: hvor(sp), trekk: r.trekk, stjerner: "⭐".repeat(r.st || 1) });
  }

  // ---------- Start ----------

  R.start({
    id: "elefanten",
    versjon: 1,
    // A game is in progress until all pairs are found (front page «Fortsett», screen wake lock).
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "alene", styrke: "unge", tema: "dyr", kort: 16, kikk: false },
      rekorder: {},
      elefant: {},
      spill: null,
    }),

    lastet(S) {
      const heltall = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      const o = S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {};
      // Saved by an older version: one player meant «alene», more meant «sammen».
      const gammelAntall = R.klamp(Math.floor(Number(S.antall)) || 1, 1, 4);
      S.oppsett = {
        modus: MODUSER.includes(o.modus) ? o.modus : gammelAntall > 1 ? "sammen" : "alene",
        styrke: styrke(o.styrke).id,
        tema: tema(o.tema) && (o.tema !== JUL || julNa()) ? o.tema : "dyr",
        kort: STORRELSER.includes(o.kort) ? o.kort : 16,
        kikk: !!o.kikk,
      };
      S.antall = R.klamp(gammelAntall, 2, 4);
      const rek = S.rekorder && typeof S.rekorder === "object" ? S.rekorder : {};
      S.rekorder = {};
      for (const n of STORRELSER)
        for (const k of [String(n), "g" + n]) {
          const r = rek[k];
          if (r && r.trekk > 0 && r.tid > 0) S.rekorder[k] = { trekk: Math.floor(r.trekk), tid: Math.floor(r.tid), st: R.klamp(Math.floor(Number(r.st)) || stjernerFor(r.trekk, n / 2), 1, 3) };
        }
      const el = S.elefant && typeof S.elefant === "object" ? S.elefant : {};
      S.elefant = {};
      for (const s of STYRKER) {
        const e = el[s.id] || {};
        const spilt = Math.max(0, Math.floor(Number(e.spilt)) || 0);
        S.elefant[s.id] = { seirer: R.klamp(Math.floor(Number(e.seirer)) || 0, 0, spilt), spilt };
      }
      const sp = S.spill;
      if (sp) {
        const liste = LISTER[sp.tema];
        let ok =
          liste &&
          Array.isArray(sp.kort) &&
          sp.kort.length >= 4 &&
          sp.kort.length <= 30 &&
          sp.kort.length % 2 === 0 &&
          sp.kort.every((k) => heltall(k, 0, liste.length - 1)) &&
          Array.isArray(sp.funnet) &&
          sp.funnet.length === sp.kort.length &&
          heltall(sp.antall, 1, 4) &&
          Array.isArray(sp.poeng) &&
          sp.poeng.length === sp.antall;
        if (ok && sp.motstander) ok = STYRKER.some((s) => s.id === sp.motstander) && sp.antall === 2 && Array.isArray(sp.husk) && sp.husk.every((i) => heltall(i, 0, sp.kort.length - 1)) && Number.isFinite(sp.efro);
        if (!ok) S.spill = null;
        else {
          sp.modus = sp.motstander ? "elefant" : sp.antall > 1 ? "sammen" : "alene";
          // A pair that was waiting to turn back counts as turned back.
          if (!Array.isArray(sp.opp) || sp.opp.length > 1 || !sp.opp.every((i) => heltall(i, 0, sp.kort.length - 1) && sp.funnet[i] < 0)) sp.opp = [];
          sp.tur = R.klamp(Math.floor(Number(sp.tur)) || 0, 0, sp.antall - 1);
          sp.omkamp = Math.max(0, Math.floor(Number(sp.omkamp)) || 0);
          sp.med = sp.omkamp && Array.isArray(sp.med) && sp.med.length > 1 && sp.med.every((i) => heltall(i, 0, sp.antall - 1)) ? sp.med : null;
          if (sp.med && !sp.med.includes(sp.tur)) sp.tur = sp.med[0];
          // The pairs that are found, with who found them. (An older version kept only the faces.)
          const gyldig = (p) => Array.isArray(p) && heltall(p[0], 0, liste.length - 1) && heltall(p[1], 0, sp.antall - 1);
          if (!Array.isArray(sp.fant)) sp.fant = [];
          if (!sp.fant.every(gyldig)) sp.fant = sp.fant.filter((k) => heltall(k, 0, liste.length - 1) && sp.kort.includes(k)).map((k) => [k, Math.max(0, sp.funnet[sp.kort.indexOf(k)])]);
        }
      }
      const s = S.spill;
      if (S.skjerm === "slutt" && !(s && s.ferdig)) S.skjerm = "hjem";
      if ((S.skjerm === "spill" || S.skjerm === "omkamp") && !s) S.skjerm = "hjem";
      if (S.skjerm === "omkamp" && s && !s.omkamp) S.skjerm = "spill";
      if (S.skjerm === "spill" && s && s.ferdig) S.skjerm = "slutt";
      // A tie-break board nobody has touched yet: show its introduction first (also after a reload).
      if (S.skjerm === "spill" && s && s.omkamp && !s.funnet.some((f) => f >= 0) && !s.opp.length) S.skjerm = "omkamp";
    },

    regler: {
      intro: R.t("Alle kortene ligger med bildet ned. Snu to og to – og finn like par."),
      steg: [
        [R.t("Snu to kort"), R.t("Trykk på to kort. Er bildene like, har du funnet et par!")],
        [R.t("Husk hvor de lå"), R.t("Ikke like? Da snur kortene seg tilbake. Prøv å huske bildene.")],
        [R.t("Finn alle parene"), R.t("Alene: Klarer du det på færrest mulig trekk? Sammen eller mot elefanten: Et par gir en ekstra tur, og den med flest par vinner.")],
      ],
      tips: [
        R.t("Si navnet på bildet høyt når du snur det. Da husker du det lettere."),
        R.t("Mot elefanten: Elefantungen glemmer det meste, elefanten husker en god del – og den gamle elefanten glemmer aldri."),
        R.t("Står det likt mellom flere til slutt, blir det omkamp på et lite brett."),
        R.t("«Kikk først» viser alle kortene i tre sekunder før start. Fint for de minste – men da teller ikke rekorden."),
        R.t("Rusj-gjengen er ekstra vanskelig: Alle figurene er runde og fargerike!"),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = sp && !sp.ferdig;
          // What there is to beat: wins against the elephant, and the best game alone on every board.
          const mot = STYRKER.filter((s) => S.elefant[s.id].seirer > 0).map((s) => `<li><b>${esc(s.navn)}</b> 🏆 ${esc(R.flertall(S.elefant[s.id].seirer, "seier", "seirer"))}</li>`);
          const alene = [];
          for (const g of ["", "g"])
            for (const n of STORRELSER) {
              const r = S.rekorder[g + n];
              if (r) alene.push(`<li><b>${esc(g ? R.t("{n} kort · gjengen", { n }) : R.t("{n} kort", { n }))}</b> ${esc(R.t("{n} trekk", { n: r.trekk }))}</li>`);
            }
          const rekorder = [mot.length ? `<p class="etikett">${esc(R.t("Seirer mot elefanten"))}</p><ul>${mot.join("")}</ul>` : "", alene.length ? `<p class="etikett">${esc(R.t("Rekorder alene"))}</p><ul>${alene.join("")}</ul>` : ""].join("");
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Snu to kort. Finn parene."))}<br><em>${esc(R.t("En elefant glemmer aldri!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: !!aktiv,
              fortsettTekst: aktiv ? (sp.omkamp ? R.t("Fortsett · omkamp") : R.t("Fortsett · {n} av {alle} par", { n: parFunnet(sp), alle: parTotalt(sp) })) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler") + (rekorder ? `<section class="ele-rekorder" aria-label="${esc(R.t("Dine rekorder"))}">${rekorder}</section>` : ""),
            }),
            merker: [
              ["1–4", R.t("spillere")],
              [String(temaerNa().length), R.t("temaer")],
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
          const sider = tilbud(S);
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon ele-tre">
            ${R.ui.fliser(
              "modus",
              [
                { v: "alene", tittel: R.t("Alene"), tekst: R.t("Slå rekorden din"), ikon: "🏆" },
                { v: "elefant", tittel: R.t("Mot elefanten"), tekst: R.t("Du mot mobilen"), ikon: `<span class="ele-flisfigurer">${G.svg("elefanten")}</span>` },
                { v: "sammen", tittel: R.t("Sammen"), tekst: R.t("2–4 spillere"), ikon: "🦊🐸" },
              ],
              o.modus,
            )}
          </section>
          ${
            o.modus === "elefant"
              ? `<section class="seksjon ele-tre">
            <div class="seksjon-hode"><h2>${esc(R.t("Hvor sterk er elefanten?"))}</h2></div>
            ${R.ui.fliser("styrke", STYRKER.map((s, n) => ({ v: s.id, tittel: s.navn, tekst: s.tekst, ikon: `<span class="ele-flisfigurer ele-str s${n + 1}">${G.svg("elefanten")}</span>` })), o.styrke)}
          </section>`
              : ""
          }
          <section class="seksjon ele-temaer">
            <div class="seksjon-hode"><h2>${esc(R.t("Velg bilder"))}</h2></div>
            ${R.ui.fliser(
              "tema",
              temaerNa().map((t) => ({
                v: t.id,
                tittel: t.navn,
                tekst: t.id === GJENGEN ? t.tekst : R.t("{n} bilder", { n: LISTER[t.id].length }),
                ikon: t.id === GJENGEN ? `<span class="ele-flisfigurer">${["luringen", "skjaera", "elefanten"].map((id) => G.svg(id)).join("")}</span>` : esc(t.ikon),
              })),
              o.tema,
            )}
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Hvor mange kort?"))}</h2><span class="tall">${esc(R.t("{n} par", { n: kortValgt(S) / 2 }))}</span></div>
            ${R.ui.seg("storrelse", sider.map((n) => [n, String(n)]), kortValgt(S), { etikett: R.t("Antall kort") })}
            <div class="ele-skala" aria-hidden="true"><span>${esc(R.t("Lett"))}</span><span>${esc(R.t("Elefant 🐘"))}</span></div>
          </section>
          ${o.modus === "sammen" ? R.ui.spillere({ min: 2, max: 4, tittel: R.t("Hvem spiller?"), hjelp: R.t("Dere bytter på. Finner du et par, får du en tur til.") }) : ""}
          <section class="seksjon">
            ${R.ui.bryter("kikk", o.kikk, R.t("Kikk først"), o.modus === "alene" ? R.t("Alle kortene vises i tre sekunder før start. Rekorden teller ikke da.") : R.t("Alle kortene vises i tre sekunder før start."))}
          </section>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.omkamp ? R.t("Omkamp") : S.spill.motstander ? styrke(S.spill.motstander).navn : tema(S.spill.tema).navn),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.kort.length;
          const del = nyDeling && !R.rolig();
          nyDeling = false;
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("Finn to like"))}</h1>
            <div class="ele-topp">
              ${hudHtml(S)}
              <div class="ele-melding" id="ele-melding" aria-hidden="true"></div>
            </div>
            <div class="ele-bord">
              <div class="ele-brett${del ? " del" : ""}${sp.tema === GJENGEN ? " gjengen" : ""}" data-n="${n}"${sp.motstander ? ' data-venn="1"' : ""} style="--kol:4" role="group" aria-label="${esc(R.t("Kortene"))}">
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
          const fortsatt = R.vakt();
          if (sp.kikk && !sp.kikket && !sp.startet && !sp.omkamp) kikk(S);
          else if (sp.antall > 1 && !sp.startet) setTimeout(() => fortsatt() && meldTur(S, true), R.rolig() ? 0 : 500);
          // The elephant was in the middle of its turn (a reload, or back from the home screen): it goes on.
          else if (erElefantensTur(sp)) setTimeout(() => fortsatt() && elefantTur(S), 500);
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
          turNr++; // the elephant stops where it is
          las = false;
          stoppKlokke(S);
          R.slippVaken();
        },
      },

      // Level at the top when the last pair is found: those who share the lead play a small board.
      omkamp: {
        tittel: R.t("Omkamp"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const par = parTotalt(sp);
          return `
            ${R.ui.banner({
              etikett: sp.omkamp > 1 ? R.t("Fortsatt like mange par") : R.t("Like mange par"),
              tittel: R.t("Omkamp!"),
              tekst: par === 3 ? R.t("{navn} står likt. Tre nye par avgjør – flest vinner.", { navn: R.ramsOpp(sp.med.map((i) => R.navn(i))) }) : R.t("{navn} står likt. Fem nye par avgjør – flest vinner.", { navn: R.ramsOpp(sp.med.map((i) => R.navn(i))) }),
              klasse: "aksent",
              stemning: "",
            })}
            ${R.ui.poengliste(sp.poeng.map((p, i) => ({ i, poeng: p })))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start omkampen"), "start-omkamp"))}`;
        },
        inn(S) {
          if (!S.spill || !S.spill.med) return R.gaTil("hjem");
          R.lyd.trommevirvel();
        },
      },

      slutt: {
        // One player (alone, or against the elephant) is not ranked: the title names the game.
        tittel: (S) => (S.spill.motstander ? R.t("Mot elefanten") : S.spill.antall === 1 ? R.t("{tema} · {n} kort", { tema: tema(S.spill.tema).navn, n: S.spill.kort.length }) : R.t("Kåringen")),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const innhold = sp.motstander ? elefantResultat(S) : sp.antall === 1 ? soloResultat(S) : sammenResultat(S);
          return `
            ${innhold}
            ${R.ui.flereSpill({ antall: sp.motstander ? 1 : sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        // Celebrate in proportion: a fanfare for a win, a record or a good game alone; a warm
        // "pling" when it took many moves or the elephant won.
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const r = sp.resultat || {};
          const fest = sp.motstander ? r.vant : sp.antall > 1 || (r.st || stjernerFor(sp.trekk, parTotalt(sp))) >= 2 || r.nyTrekk || r.nyTid;
          if (fest) {
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
        const sp = S.spill;
        if ((await R.bekreftNytt(!!(sp && !sp.ferdig), !!sp && !erSammen(sp))) && fortsatt()) R.gaTil("oppsett");
      },
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return R.gaTil("hjem");
        // A tie-break board nobody has touched: its introduction first.
        R.gaTil(sp.omkamp && !sp.funnet.some((f) => f >= 0) && !sp.opp.length ? "omkamp" : "spill");
      },
      modus(el, e, S) {
        if (!MODUSER.includes(el.dataset.v)) return;
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      styrke(el, e, S) {
        S.oppsett.styrke = styrke(el.dataset.v).id;
        R.vis();
      },
      tema(el, e, S) {
        if (!temaerNa().some((t) => t.id === el.dataset.v)) return;
        S.oppsett.tema = el.dataset.v;
        R.vis();
      },
      storrelse(el, e, S) {
        const n = tilbud(S).indexOf(Number(el.dataset.v));
        if (n < 0) return;
        S.oppsett.kort = STORRELSER[n];
        R.vis();
      },
      kikk(el, e, S) {
        S.oppsett.kikk = !S.oppsett.kikk;
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
      // After a win against the elephant: the same game against the next one up.
      sterkere(el, e, S) {
        const sp = S.spill;
        const neste = sp && sp.motstander && STYRKER[STYRKER.findIndex((s) => s.id === sp.motstander) + 1];
        if (!neste) return;
        S.oppsett.modus = "elefant";
        S.oppsett.styrke = neste.id;
        nyttSpill(S);
        R.gaTil("spill");
      },
      "start-omkamp"(el, e, S) {
        if (!S.spill || S.spill.ferdig) return R.gaTil("hjem");
        nyDeling = true;
        R.gaTil("spill");
      },
      del(el, e, S) {
        if (S.spill && S.spill.ferdig) R.del(R.app.navn, delTekst(S), DEL_URL);
      },
      snu(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig || las) return;
        const i = Number(el.dataset.v);
        if (!(i >= 0 && i < sp.kort.length) || sp.funnet[i] >= 0) return;
        const elefantens = erElefantensTur(sp);
        if (venter) {
          // Tapping on while two cards wait to turn back: turn them now and go on. (When the
          // turn has passed to the elephant, the tap only hurries the cards back.)
          const ventet = venter.a === i || venter.b === i;
          snuTilbake(S);
          if (ventet || elefantens) return;
        }
        if (elefantens || sp.opp.includes(i)) return;
        vend(S, i);
      },
    }),
  });
})();
