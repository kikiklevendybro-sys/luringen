/* Bokstavtrollet — the alphabet game ("Alfabetleken"). Two modes:
   Bomba: say a word and pass the phone on before the troll wakes. What the word has to fit is chosen
   in the setup: a category, a letter or both. The letter is new on every pass, so each player needs
   one word for a letter of their own. A hidden timer runs while the troll sleeps and its heartbeat
   speeds up; when it wakes (roar, shake, red flash) whoever holds the phone loses a heart. Nobody is
   out: the game stops when someone loses the last of three hearts, and most hearts wins – a tie at
   the top is settled by a sudden-death final. «Sistemann igjen» is the knock-out rule for adults.
   Bokstavjakt: one letter and five categories, everyone writes on paper against the clock, then the
   app walks through the categories so the group can score them (2 unique, 1 shared, 0 nothing).
   Three or five rounds, or first to 30; a tie at the top gives one extra round. */
(function () {
  "use strict";

  const R = window.Rusj;
  const G = window.RusjGjengen;
  const D = window.RUSJ_DATA.kategorier;
  const esc = R.esc;

  const KAT = D.kategorier;
  const NIVA = { barn: 1, familie: 2, voksen: 3 };
  // Kid-friendly letters, weighted by how many Norwegian words start with them.
  const VEKT = { S: 3, B: 3, K: 3, M: 3, H: 3, T: 3, F: 3, P: 3, L: 3, G: 3, R: 3, A: 2, V: 2, D: 2, E: 2, N: 2, O: 2, J: 2, I: 1, U: 1 };
  const LETTE = Object.keys(VEKT);
  // "Vanskelig" adds these. Q and X are left out: almost no Norwegian words start with them.
  const VANSKELIGE = ["C", "W", "Y", "Z", "Æ", "Ø", "Å"];
  const ALFABET = "ABCDEFGHIJKLMNOPRSTUVWYZÆØÅ".split("");
  const SOVN = { tungt: [25, 50], normalt: [15, 45], lett: [8, 25] };
  const LIV = 3;
  // What a word must fit in Bomba. Until someone chooses, the level decides: children get a letter
  // only (any word will do), everyone else a category and a letter.
  const KRAV = [
    ["kategori", "Kategori"],
    ["bokstav", "Bokstav"],
    ["begge", "Begge"],
  ];
  const KRAV_TEKST = {
    kategori: "Trollet velger en kategori – si noe som passer. Fra 4 år.",
    bokstav: "Trollet velger en bokstav – si et ord som begynner på den. Fra 6 år.",
    begge: "Kategori og bokstav, for eksempel «Dyr på K». Fra 9 år.",
  };
  const erKrav = (k) => KRAV.some(([v]) => v === k);
  const kravFor = (o) => (erKrav(o.krav) ? o.krav : o.niva === "barn" ? "bokstav" : "begge");
  // Bokstavjakt ends by itself: after three or five rounds, or when someone reaches 30 points.
  const LENGDER = [
    ["3", "3 runder"],
    ["5", "5 runder"],
    ["30", "Først til 30"],
  ];
  const FARGE = G.farge("bokstavtrollet");
  const REKORD = "bokstavtrollet.rekord"; // most words before the troll woke, on this phone
  const DEL_URL = "https://rusj.no/bokstavtrollet/";
  const kortstokk = R.kortstokk("kategorier", KAT.length);

  let H; // actions
  let nyttKort = false; // spin the letter on the next draw
  let bytter = false; // «Bytt bokstav» is spinning: the phone cannot be passed on meanwhile

  const lesRekord = () => {
    const r = R.les(REKORD, null);
    return { ord: r && Number.isInteger(r.ord) && r.ord > 0 ? r.ord : 0 };
  };
  const ordTekst = (n) => R.flertall(n, "ord", "ord");

  // ---------- The troll (drawn like the mascot in gjengen.js, with a sleeping and a roaring face) ----------

  function troll(ansikt, bokstav) {
    const B = "#170e2b";
    const P = "#fff1dd";
    const BRUN = "#6b4329";
    const strek = (d, w, c) => `<path d="${d}" fill="none" stroke="${c || B}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const nese = `<ellipse cx="60" cy="72" rx="16" ry="13" fill="#a8e09a" stroke="${B}" stroke-width="4.5"/><circle cx="54" cy="76" r="2.4" fill="${B}"/><circle cx="66" cy="76" r="2.4" fill="${B}"/>`;
    let fjes;
    if (ansikt === "sover") {
      fjes = strek("M38 53 Q46 60 54 53M66 53 Q74 60 82 53", 4.5) + strek("M33 43 Q44 39 54 43M66 43 Q76 39 87 43", 6, BRUN) + nese + `<ellipse class="bt-snork" cx="60" cy="97" rx="7" ry="5.5" fill="${B}"/>`;
    } else if (ansikt === "vaken") {
      fjes =
        `<circle cx="45" cy="51" r="11" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="75" cy="51" r="11" fill="${P}" stroke="${B}" stroke-width="4"/>` +
        `<circle cx="47" cy="53" r="3.2" fill="${B}"/><circle cx="73" cy="53" r="3.2" fill="${B}"/>` +
        strek("M29 33 L54 43M91 33 L66 43", 7, BRUN) +
        nese +
        `<path d="M31 86 Q60 128 89 86 Q60 97 31 86Z" fill="${B}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="M47 104 Q60 95 73 104 Q60 114 47 104Z" fill="#ff4f8b"/>` +
        `<path d="M38 88 L43 99 L48 90Z M82 88 L77 99 L72 90Z" fill="${P}" stroke="${B}" stroke-width="2" stroke-linejoin="round"/>`;
    } else {
      fjes =
        `<circle cx="46" cy="52" r="8" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="74" cy="52" r="8" fill="${P}" stroke="${B}" stroke-width="4"/>` +
        `<circle cx="48" cy="53" r="3.6" fill="${B}"/><circle cx="72" cy="53" r="3.6" fill="${B}"/>` +
        strek("M32 40 Q44 32 54 40M66 40 Q76 32 88 40", 7, BRUN) +
        nese +
        strek("M38 94 Q60 108 82 94", 5) +
        `<rect x="54" y="98" width="9" height="8" rx="2" fill="${P}" stroke="${B}" stroke-width="2.5"/>`;
    }
    const blokk =
      bokstav != null
        ? `<rect x="84" y="80" width="32" height="32" rx="7" fill="#ffd23f" stroke="${B}" stroke-width="4.5" transform="rotate(10 100 96)"/><text x="100" y="106" font-family="ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold',system-ui,sans-serif" font-weight="900" font-size="24" text-anchor="middle" fill="${B}" transform="rotate(10 100 106)">${esc(bokstav)}</text>`
        : "";
    return `<svg class="figur bt-troll" viewBox="-6 -10 132 132" aria-hidden="true" focusable="false">
      <path d="M14 58 L2 44 L20 46Z M106 58 L118 44 L100 46Z" fill="${FARGE}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="60" cy="64" r="48" fill="${FARGE}" stroke="${B}" stroke-width="5"/>
      <path d="M38 22 Q30 2 48 8 Q50 -4 62 6 Q72 -6 76 10 Q92 4 84 24 Q60 12 38 22Z" fill="${BRUN}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
      ${fjes}${blokk}
    </svg>`;
  }

  const sovendeTroll = () => `<span class="bt-trollramme sover">${troll("sover")}<span class="bt-zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span></span>`;

  // ---------- Sounds ----------

  function brol() {
    R.lyd.tone(150, 0, 1.15, "sawtooth", 0.28, 52);
    R.lyd.tone(158, 0.02, 1.1, "sawtooth", 0.22, 58);
    R.lyd.tone(76, 0, 1.2, "square", 0.14, 38);
    R.lyd.stoy(0, 1.1, 0.5, 520, "lowpass");
    R.lyd.stoy(0.04, 0.8, 0.25, 1600);
  }
  const snork = () => R.lyd.stoy(0, 0.7, 0.05, 280, "lowpass");

  // ---------- Letters and categories ----------

  function trekkBokstav(sp) {
    const sett = LETTE.concat(sp.vanskelig ? VANSKELIGE : []);
    let ledige = sett.filter((b) => !sp.brukt.includes(b));
    if (!ledige.length) {
      sp.brukt = sp.brukt.slice(-3);
      ledige = sett.filter((b) => !sp.brukt.includes(b));
    }
    const vekt = (b) => VEKT[b] || 2;
    let r = Math.random() * ledige.reduce((s, b) => s + vekt(b), 0);
    let valgt = ledige[0];
    for (const b of ledige) {
      r -= vekt(b);
      if (r <= 0) {
        valgt = b;
        break;
      }
    }
    sp.brukt.push(valgt);
    return valgt;
  }

  // Which categories a game draws from: the level, the mode («Hva som helst» is only for Bomba) and
  // the Christmas set (jul: 1 = only with the switch on, 2 = also an ordinary category). The chain in
  // Bomba needs wide categories, or the words run out after a few turns: b: 1 = many answers (fine
  // without a letter), b: 2 = many answers on almost every letter (fine with a new letter per pass).
  const passer = (sp, unntak) => (i) => {
    const k = KAT[i];
    if (k.n > NIVA[sp.niva] || (k.kun && k.kun !== sp.modus) || (unntak || []).includes(i)) return false;
    if (sp.jul ? !k.jul : k.jul === 1) return false;
    if (sp.modus !== "bomba") return true;
    return sp.krav === "begge" ? k.b === 2 : sp.krav === "kategori" ? k.b >= 1 && !k.kun : false;
  };
  const trekkKategori = (sp, unntak) => kortstokk.neste(passer(sp, unntak));
  const antallKat = (sp) => KAT.reduce((s, k, i) => s + (passer(sp)(i) ? 1 : 0), 0);

  // A new card for a round of Bomba: a category (never the same twice in a row), a letter, or both.
  function trekkKort(sp) {
    let k = -1;
    if (sp.krav !== "bokstav") {
      k = trekkKategori(sp, sp.kort && sp.kort.k >= 0 ? [sp.kort.k] : []);
      if (k < 0) k = trekkKategori(sp);
      if (k < 0) k = 0;
    }
    return { k, b: sp.krav === "kategori" ? "" : trekkBokstav(sp) };
  }

  function kortHtml(kort, o = {}) {
    const k = kort.k >= 0 ? KAT[kort.k] : null;
    const klasse = `bt-kort${o.liten ? " liten" : ""}${o.nytt ? " nytt" : ""}`;
    // Category only: the category's own picture sits where the letter block would be.
    if (!kort.b && k)
      return `<h1 class="${klasse}" id="skjerm-tittel">
        <span class="bt-kat"><span class="bt-kat-navn">${esc(k.t)}</span></span>
        <span class="bt-pa">si noe som passer</span>
        <span class="bt-bokstav bilde" aria-hidden="true"><span>${esc(k.i)}</span></span>
      </h1>`;
    return `<h1 class="${klasse}" id="skjerm-tittel">
      <span class="bt-kat">${k ? `<span class="bt-kat-ikon" aria-hidden="true">${esc(k.i)}</span><span class="bt-kat-navn">${esc(k.t)}</span>` : `<span class="bt-kat-navn">Et ord</span>`}</span>
      <span class="bt-pa">som begynner på</span>
      <span class="bt-bokstav" data-bokstav="${esc(kort.b)}"><span>${esc(kort.b)}</span></span>
    </h1>`;
  }

  // Slot-machine spin that lands on the letter. A new spin (or a new screen) stops the old one.
  let spinnNr = 0;
  function spinn(el, endelig) {
    return new Promise((ferdig) => {
      if (!el) return ferdig();
      const span = el.querySelector("span");
      if (R.rolig()) {
        span.textContent = endelig;
        return ferdig();
      }
      const fortsatt = R.vakt();
      const nr = ++spinnNr;
      el.classList.add("spinner");
      let n = 0;
      const steg = 14;
      const neste = () => {
        if (!fortsatt() || nr !== spinnNr) return ferdig();
        n += 1;
        if (n >= steg) {
          span.textContent = endelig;
          el.classList.remove("spinner");
          el.classList.add("landet");
          R.lyd.pling();
          R.vibrer(25);
          return ferdig();
        }
        span.textContent = ALFABET[Math.floor(Math.random() * ALFABET.length)];
        R.lyd.tikk();
        setTimeout(neste, 45 + n * n * 1.6);
      };
      neste();
    });
  }

  // ---------- Players and hearts ----------

  // Who the phone goes round between: everyone with a heart left – or, in the final, the finalists.
  const aktive = (sp) => (sp.finale ? sp.finale.slice() : sp.liv.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0));
  function nesteAktiv(sp, i) {
    const a = aktive(sp);
    for (let n = 1; n <= sp.antall; n++) {
      const j = (i + n) % sp.antall;
      if (a.includes(j)) return j;
    }
    return i;
  }
  // Those with the most hearts.
  const flest = (sp) => {
    const topp = Math.max(...sp.liv);
    return sp.liv.map((l, i) => (l === topp ? i : -1)).filter((i) => i >= 0);
  };
  // Nobody is out: when someone has lost the last heart the game is over, and several players with
  // the most hearts play a final.
  const noenTom = (sp) => sp.liv.some((l) => l <= 0);
  const trengerFinale = (sp) => !sp.sistemann && !sp.finale && noenTom(sp) && flest(sp).length > 1;
  const hjerter = (l, maks) =>
    `<span class="bt-hjerter" role="img" aria-label="${l} av ${maks} hjerter">${Array.from({ length: maks }, (_, n) => `<i class="${n < l ? "pa" : ""}" aria-hidden="true">♥</i>`).join("")}</span>`;

  function livRad(sp, o = {}) {
    const hvem = sp.finale ? sp.finale : sp.liv.map((_, i) => i);
    return `<ul class="bt-liv${hvem.length > 6 ? " mange" : ""}" aria-label="${sp.finale ? "Finalistene" : "Hjerter"}">${hvem
      .map((i) => {
        const l = sp.liv[i];
        return `<li class="${l > 0 ? "" : "ute"}${o.na === i ? " na" : ""}" style="--pf: var(--p${(i % 20) + 1})">
          ${R.avatar(i)}<span class="bt-liv-navn">${esc(R.navn(i))}</span>${l > 0 || !sp.sistemann ? hjerter(l, LIV) : '<span class="bt-ute">👻<span class="bt-ute-tekst"> Ute</span></span>'}
        </li>`;
      })
      .join("")}</ul>`;
  }

  // ---------- Bomba: the hidden timer and the heartbeat ----------

  let sjekkId = null;
  let slagId = null;
  let snorkId = null;
  let sistSendt = 0;

  function stoppBomba() {
    clearInterval(sjekkId);
    clearTimeout(slagId);
    clearInterval(snorkId);
    sjekkId = slagId = snorkId = null;
  }

  function andel(sp) {
    return R.klamp(1 - (sp.slutt - Date.now()) / sp.varighet, 0, 1);
  }

  function startKlokke(S) {
    const sp = S.spill;
    const fortsatt = R.vakt();
    stoppBomba();
    const slag = () => {
      if (!fortsatt() || !sp.slutt) return;
      const a = andel(sp);
      R.lyd.hjerteslag();
      if (a > 0.65) R.vibrer(18);
      const skjerm = R.$("#skjerm");
      if (skjerm) skjerm.style.setProperty("--fare", (a * a).toFixed(3));
      const hj = R.$(".bt-puls");
      if (hj && !R.rolig()) {
        hj.classList.remove("slag");
        void hj.offsetWidth;
        hj.classList.add("slag");
      }
      const ramme = R.$(".bt-trollramme");
      if (ramme) ramme.style.setProperty("--pust", `${(2.6 - a * 2).toFixed(2)}s`);
      slagId = setTimeout(slag, 1080 - 800 * Math.pow(a, 1.25));
    };
    slag();
    snorkId = setInterval(() => {
      if (andel(sp) < 0.45) snork();
    }, 2600);
    sjekkId = setInterval(() => {
      if (!fortsatt()) return stoppBomba();
      if (Date.now() >= sp.slutt) vakne(S);
    }, 100);
  }

  async function vakne(S) {
    const sp = S.spill;
    if (!sp.slutt) return;
    stoppBomba();
    sp.slutt = 0;
    sp.fase = "vakna";
    // The record: most words (passes) in one round before the troll woke.
    const rekord = lesRekord().ord;
    sp.nyRekord = rekord > 0 && sp.ord > rekord;
    if (sp.ord > rekord) R.skriv(REKORD, { ord: sp.ord });
    sp.best = Math.max(sp.best || 0, sp.ord);
    R.lagre();
    const fortsatt = R.vakt();
    const ramme = R.$(".bt-trollramme");
    if (ramme) {
      ramme.classList.remove("sover");
      ramme.classList.add("vaken");
      ramme.innerHTML = `${troll("vaken")}<span class="bt-bo" aria-hidden="true">BØØØ!</span>`;
    }
    const skjerm = R.$("#skjerm");
    if (skjerm) skjerm.classList.add("vakner");
    brol();
    R.lyd.bom();
    R.vibrer([320, 90, 320]);
    R.si("Trollet våknet!");
    if (!R.rolig()) {
      const blink = document.createElement("div");
      blink.className = "bt-blink";
      blink.setAttribute("aria-hidden", "true");
      document.body.appendChild(blink);
      setTimeout(() => blink.remove(), 1200);
      if (skjerm) {
        skjerm.classList.remove("risting");
        void skjerm.offsetWidth;
        skjerm.classList.add("risting");
      }
    }
    await R.vent(R.rolig() ? 900 : 1600);
    if (!fortsatt()) return;
    R.gaTil("vakna");
  }

  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (!S || S.skjerm !== "bomba" || !S.spill || !S.spill.slutt) return;
    const sp = S.spill;
    if (document.hidden) {
      sp.pauset = Math.max(1000, sp.slutt - Date.now());
      stoppBomba();
    } else if (sp.pauset) {
      sp.slutt = Date.now() + sp.pauset;
      sp.pauset = 0;
      startKlokke(S);
    }
  });

  // ---------- Bokstavjakt ----------

  function nyJaktRunde(sp) {
    const b = trekkBokstav(sp);
    const k = [];
    for (let n = 0; n < 5; n++) {
      const i = trekkKategori(sp, k);
      if (i >= 0) k.push(i);
    }
    sp.r = { b, k, fase: "trekk", igjen: sp.tid, nr: 0, score: Array.from({ length: sp.antall }, () => k.map(() => null)) };
  }

  // The screen that belongs to a phase of a Bokstavjakt round.
  const jaktSkjerm = (r) => (r.fase === "poeng" ? "jakt-poeng" : r.fase === "ferdig" ? "jakt-stilling" : "jakt");
  // How many rounds a game is (0 = no fixed number: «Først til 30», or a game from the first version).
  const jaktRunder = (sp) => (sp.lengde === "3" || sp.lengde === "5" ? Number(sp.lengde) : 0);
  // After a round is scored: "" = play on, "ekstra" = the game is over but the top is tied (one extra
  // round decides), "ferdig" = to «Kåringen».
  function jaktStatus(sp) {
    const topp = Math.max(...sp.poeng);
    const naadd = sp.lengde === "30" ? topp >= 30 : jaktRunder(sp) > 0 && (sp.spilt || 0) >= jaktRunder(sp);
    if (!naadd) return "";
    return sp.poeng.filter((p) => p === topp).length > 1 && !sp.ekstra ? "ekstra" : "ferdig";
  }
  const jaktTittel = (sp) => (sp.ekstra ? "Ekstrarunde" : `Runde ${sp.runde}${jaktRunder(sp) ? ` av ${jaktRunder(sp)}` : ""}`);

  function jaktSlutt(S, tidUte) {
    const sp = S.spill;
    if (!sp.r || sp.r.fase !== "skriv") return;
    sp.r.fase = "poeng";
    sp.r.nr = 0;
    R.lagre();
    const t = R.timer("jakt-tid");
    if (t) t.stopp();
    const fortsatt = R.vakt();
    const ramme = R.$(".bt-jakt-troll");
    if (ramme) ramme.innerHTML = `${troll("vaken")}<span class="bt-bo" aria-hidden="true">Blyantene ned!</span>`;
    if (tidUte) {
      brol();
      R.vibrer([200, 80, 200]);
    } else R.lyd.pling();
    R.toast("✏️ Blyantene ned!");
    R.si("Blyantene ned!");
    setTimeout(() => fortsatt() && R.gaTil("jakt-poeng"), R.rolig() ? 700 : 1500);
  }

  // ---------- Results ----------

  // Bomba's ranking, best first: [{ i, plass }]. Most hearts first; the final sorts its players (the
  // one left wins, then last out first); in a knock-out game those who are out come in the order
  // they left, last out first. What is still equal shares a place (a game that was ended early).
  function bombaRangering(sp) {
    const ut = sp.finaleUt || [];
    const verdi = (i) => sp.liv[i] * 1000 + (sp.finale && sp.finale.includes(i) ? 500 : 0) + (ut.indexOf(i) + 1) * 10 + (sp.liv[i] > 0 ? 0 : sp.ute.indexOf(i) + 1);
    const rad = sp.liv.map((_, i) => ({ i, v: verdi(i) })).sort((a, b) => b.v - a.v || a.i - b.i);
    rad.forEach((r, n) => {
      r.plass = n && rad[n - 1].v === r.v ? rad[n - 1].plass : n + 1;
    });
    return rad;
  }

  function nySpill(S) {
    const o = S.oppsett;
    const antall = R.klamp(S.antall || 2, 2, 12);
    const sp = { modus: o.modus, antall, niva: o.niva, vanskelig: !!o.vanskelig, jul: !!o.jul, brukt: [], runde: 1, ferdig: false };
    if (o.modus === "bomba") {
      Object.assign(sp, { krav: kravFor(o), sistemann: !!o.sistemann, sovn: o.sovn, liv: Array.from({ length: antall }, () => LIV), ute: [], finale: null, finaleUt: [], start: R.heltall(0, antall - 1), ord: 0, best: 0, slutt: 0 });
      if (sp.krav === "bokstav") sp.jul = false; // no categories in play
      sp.holder = sp.start;
      sp.kort = trekkKort(sp);
    } else {
      Object.assign(sp, { tid: o.tid, lengde: o.lengde, ekstra: false, poeng: Array.from({ length: antall }, () => 0), rundePoeng: Array.from({ length: antall }, () => 0), r: null });
    }
    S.spill = sp;
    R.statistikk("start", { modus: sp.modus, spillere: antall, niva: sp.niva, krav: sp.krav || "", jul: sp.jul, lengde: sp.lengde || (sp.sistemann ? "sistemann" : "hjerter") });
    return sp;
  }

  // ---------- Start ----------

  R.start({
    id: "bokstavtrollet",
    versjon: 1,
    // A game is in progress until «Kåringen».
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      antall: 3,
      oppsett: { modus: "bomba", niva: "barn", vanskelig: false, sovn: "normalt", tid: 90, krav: null, sistemann: false, jul: false, lengde: "3" },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "bomba", niva: "barn", vanskelig: false, sovn: "normalt", tid: 90, krav: null, sistemann: false, jul: false, lengde: "3" }, S.oppsett || {}));
      if (!["bomba", "jakt"].includes(o.modus)) o.modus = "bomba";
      if (!(o.niva in NIVA)) o.niva = "barn";
      if (!(o.sovn in SOVN)) o.sovn = "normalt";
      if (![60, 90, 120].includes(o.tid)) o.tid = 90;
      if (!erKrav(o.krav)) o.krav = null;
      if (!LENGDER.some(([v]) => v === o.lengde)) o.lengde = "3";
      o.sistemann = !!o.sistemann;
      o.jul = !!o.jul;
      S.antall = R.klamp(Number(S.antall) || 3, 2, 12);
      const sp = S.spill;
      if (sp) {
        const godKat = (i) => Number.isInteger(i) && KAT[i];
        let ok = (sp.modus === "bomba" || sp.modus === "jakt") && Number.isInteger(sp.antall) && sp.antall >= 2 && Array.isArray(sp.brukt) && sp.niva in NIVA;
        if (ok && sp.modus === "bomba") ok = Array.isArray(sp.liv) && sp.liv.length === sp.antall && sp.kort && (godKat(sp.kort.k) || sp.kort.k === -1) && Array.isArray(sp.ute);
        if (ok && sp.modus === "jakt") ok = Array.isArray(sp.poeng) && sp.poeng.length === sp.antall && (!sp.r || (Array.isArray(sp.r.k) && sp.r.k.every(godKat)));
        if (!ok) S.spill = null;
        else if (sp.modus === "bomba") {
          // A game saved by the first version keeps its own rules: category and letter, last one standing.
          if (!erKrav(sp.krav)) {
            sp.krav = "begge";
            sp.sistemann = true;
          }
          sp.sistemann = !!sp.sistemann;
          sp.jul = !!sp.jul;
          const spiller = (i) => Number.isInteger(i) && i >= 0 && i < sp.antall;
          sp.finale = Array.isArray(sp.finale) && sp.finale.length && sp.finale.every(spiller) ? sp.finale : null;
          sp.finaleUt = Array.isArray(sp.finaleUt) ? sp.finaleUt.filter(spiller) : [];
          if (!spiller(sp.start)) sp.start = 0;
          if (!spiller(sp.holder)) sp.holder = sp.start;
          if (sp.krav === "bokstav") sp.kort.k = -1;
          else if (!godKat(sp.kort.k)) sp.kort.k = Math.max(0, trekkKategori(sp));
          if (sp.krav === "kategori") sp.kort.b = "";
          else if (typeof sp.kort.b !== "string" || !sp.kort.b) sp.kort.b = trekkBokstav(sp);
        } else {
          if (!LENGDER.some(([v]) => v === sp.lengde)) sp.lengde = ""; // (the first version had no end)
          sp.ekstra = !!sp.ekstra;
          sp.jul = !!sp.jul;
        }
      }
      // A round of Bomba is never resumed half-way: back to the card, with a fresh hidden timer
      // (unless the troll had already woken up – then someone still has to lose a heart).
      if (S.skjerm === "bomba") S.skjerm = S.spill && S.spill.fase === "vakna" ? "vakna" : "klar";
      if (S.skjerm === "tap" && S.spill && !(S.spill.taper >= 0)) S.skjerm = "klar";
      const spillSkjerm = ["klar", "bomba", "vakna", "tap", "jakt-klar", "jakt", "jakt-poeng", "jakt-stilling", "vinner"];
      if (!S.spill && spillSkjerm.includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.spill.modus === "jakt" && ["jakt", "jakt-poeng"].includes(S.skjerm) && !S.spill.r) S.skjerm = "jakt-klar";
      // Bokstavjakt: always resume to the screen that fits the phase of the round (a reload during
      // «Blyantene ned!» must land on the scoring, not on a clock that has already stopped).
      const r = S.spill && S.spill.modus === "jakt" && S.spill.r;
      if (r && ["jakt", "jakt-poeng", "jakt-stilling"].includes(S.skjerm)) S.skjerm = jaktSkjerm(r);
    },

    regler: {
      intro: "To leker med bokstaver: Bomba, der dere sender mobilen før trollet våkner, og Bokstavjakt med blyant og papir.",
      steg: [
        ["Bomba: si et ord", "Trollet gir deg en bokstav, en kategori – eller begge deler, som «Dyr på B». Si et ord som passer, og send mobilen videre. Neste spiller får en ny bokstav."],
        ["Ikke vekk trollet!", "Trollet kan våkne når som helst. Den som holder mobilen da, mister et hjerte. Når noen har mistet alle tre, er spillet slutt – og den med flest hjerter vinner."],
        ["Bokstavjakt: skriv ord", "Alle skriver ett ord til hver av de fem kategoriene. Les opp etterpå: et ord ingen andre har, gir 2 poeng. Likt ord gir 1."],
      ],
      tips: [
        "Ordet er allerede sagt? Da må du finne et nytt.",
        "Umulig bokstav? Trykk «Bytt bokstav» – men det koster et par dyrebare sekunder.",
        "Har flere like mange hjerter til slutt, blir det finale: Den som holder mobilen når trollet våkner, ryker ut.",
        "For de minste: Velg «Kategori» i oppsettet – da trengs ingen bokstav.",
        "Vil dere spille til bare én står igjen? Skru på «Sistemann igjen». Vanskelige bokstaver (C, W, Y, Z, Æ, Ø og Å) skrur dere også på der.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = sp && !sp.ferdig;
          const fortsett = aktiv ? R.ui.knapp(sp.modus === "bomba" ? (sp.finale ? "Fortsett Bomba · finalen" : `Fortsett Bomba · runde ${sp.runde}`) : `Fortsett Bokstavjakt · ${jaktTittel(sp).toLowerCase()}`, "fortsett") : "";
          const rekord = lesRekord().ord;
          return R.ui.spillhjem({
            slagordHtml: "Si et ord på bokstaven.<br><em>Ikke vekk trollet!</em>",
            knapperHtml: `${fortsett}
              <div class="bt-moduser">
                <button class="bt-modus bomba" data-h="velg-modus" data-v="bomba"><span class="bt-modus-ikon" aria-hidden="true">💣</span><b>Bomba</b><span>Send mobilen før trollet våkner</span></button>
                <button class="bt-modus jakt" data-h="velg-modus" data-v="jakt"><span class="bt-modus-ikon" aria-hidden="true">✏️</span><b>Bokstavjakt</b><span>Skriv ord med blyant og papir</span></button>
              </div>
              ${rekord ? `<p class="bt-rekord"><span class="etikett">Rekord</span> <b>${esc(ordTekst(rekord))}</b> <span>før trollet våknet</span></p>` : ""}
              ${R.ui.lenke("Slik spiller du", "regler")}`,
            merker: [
              ["2–12", "spillere"],
              [String(KAT.length), "kategorier"],
              ["0", "reklame"],
            ],
          });
        },
      },

      // The game (Bomba or Bokstavjakt) is chosen once, with the two big buttons on the home screen.
      oppsett: {
        tittel: (S) => (S.oppsett.modus === "jakt" ? "Bokstavjakt" : "Bomba"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const bomba = o.modus === "bomba";
          const krav = kravFor(o);
          const medKategori = !bomba || krav !== "bokstav";
          const utvalg = { modus: o.modus, niva: o.niva, krav, jul: o.jul };
          const nivaTekst = `${D.nivaer.find((n) => n.id === o.niva).tekst} · ${antallKat(utvalg)} kategorier`;
          return `
            <h1 id="skjerm-tittel" class="bt-oppsett-tittel"><span aria-hidden="true">${bomba ? "💣" : "✏️"}</span> Gjør klart til ${bomba ? "Bomba" : "Bokstavjakt"}</h1>
            ${R.ui.spillere({ min: 2, max: 12, tittel: "Hvem spiller?", hjelp: bomba ? "Sitt i ring, i samme rekkefølge som her." : "Alle trenger et ark og en blyant." })}
            ${
              bomba
                ? `<section class="seksjon">
                    <div class="seksjon-hode"><h2>Hva må ordet passe?</h2></div>
                    ${R.ui.seg("krav", KRAV, krav, { etikett: "Hva må ordet passe?" })}
                    <p class="hjelp">${esc(KRAV_TEKST[krav])}</p>
                  </section>`
                : ""
            }
            ${
              medKategori
                ? `<section class="seksjon">
                    <div class="seksjon-hode"><h2>${bomba ? "Kategorier" : "Nivå"}</h2></div>
                    ${R.ui.seg("niva", D.nivaer.map((n) => [n.id, n.navn]), o.niva, { etikett: bomba ? "Kategorier" : "Nivå" })}
                    <p class="hjelp">${esc(nivaTekst)}</p>
                  </section>`
                : ""
            }
            ${
              bomba
                ? `<section class="seksjon">
                    <div class="seksjon-hode"><h2>Hvor tungt sover trollet?</h2></div>
                    ${R.ui.seg("sovn", [["tungt", "😴 Tungt"], ["normalt", "Normalt"], ["lett", "👂 Lett"]], o.sovn, { etikett: "Søvn" })}
                    <p class="hjelp">${o.sovn === "tungt" ? "Lang tid før trollet våkner." : o.sovn === "lett" ? "Trollet kan våkne veldig fort!" : "Trollet våkner etter 15 til 45 sekunder."}</p>
                  </section>`
                : `<section class="seksjon">
                    <div class="seksjon-hode"><h2>Tid til å skrive</h2></div>
                    ${R.ui.seg("tid", [[60, "1 min"], [90, "1½ min"], [120, "2 min"]], o.tid, { etikett: "Tid" })}
                  </section>
                  <section class="seksjon">
                    <div class="seksjon-hode"><h2>Lengde</h2></div>
                    ${R.ui.seg("lengde", LENGDER, o.lengde, { etikett: "Lengde" })}
                    <p class="hjelp">${o.lengde === "30" ? "Spill til noen har 30 poeng." : "Flest poeng til slutt vinner."} Står det likt, blir det én ekstrarunde.</p>
                  </section>`
            }
            ${medKategori ? R.ui.bryter("jul", o.jul, "Julekategorier 🎄", "Bare kategorier om jul og vinter.") : ""}
            ${!bomba || krav !== "kategori" ? R.ui.bryter("vanskelig", o.vanskelig, "Vanskelige bokstaver", "C, W, Y, Z, Æ, Ø og Å kan også komme.") : ""}
            ${bomba ? R.ui.bryter("sistemann", o.sistemann, "Sistemann igjen", o.sistemann ? "Den som mister alle hjertene, er ute. Den siste som er igjen, vinner." : "Av: Ingen går ut. Spillet slutter når noen mister det siste hjertet.") : ""}
            ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor" }))}`;
        },
      },

      // ---------- Bomba ----------

      klar: {
        tittel: (S) => (S.spill.finale ? "Finalen" : `Runde ${S.spill.runde}`),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ny = nyttKort;
          nyttKort = false;
          const hint = sp.krav === "kategori" ? "Si noe som passer <span aria-hidden=\"true\">➜</span> trykk «Send videre» og gi mobilen til neste" : `Si et ord ${sp.krav === "bokstav" ? "på bokstaven" : "som passer"} <span aria-hidden="true">➜</span> trykk «Send videre» – neste får en ny bokstav`;
          return `
            ${sp.finale ? `<p class="bt-finale"><b>Finale!</b> <span>Den som holder mobilen når trollet våkner, ryker ut.</span></p>` : ""}
            <div class="bt-klar">
              ${sovendeTroll()}
              ${kortHtml(sp.kort, { nytt: ny })}
            </div>
            <p class="bt-forst">${R.avatar(sp.start)}<span><b>${esc(R.navn(sp.start))}</b> begynner</span></p>
            ${sp.runde === 1 ? `<p class="bt-hint"><span aria-hidden="true">🗣️</span> ${hint}</p>` : ""}
            ${livRad(sp, { na: sp.start })}
            ${R.ui.dokk(R.ui.knapp("Start runden", "bomba-start", { variant: "stor" }), R.ui.lenkerad(R.ui.lenke(sp.krav === "bokstav" ? "Ny bokstav" : "Nytt kort", "nytt-kort"), R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn(S) {
          const el = R.$(".bt-kort.nytt .bt-bokstav:not(.bilde)");
          if (el) spinn(el, S.spill.kort.b);
        },
      },

      bomba: {
        tittel: (S) => (S.spill.finale ? "Finalen" : `Runde ${S.spill.runde}`),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            ${kortHtml(sp.kort, { liten: true })}
            <div class="bt-scene">
              ${sovendeTroll()}
              <span class="bt-puls" aria-hidden="true">♥</span>
            </div>
            <p class="bt-holder"><span class="bt-mobil" aria-hidden="true">📱</span><span class="bt-holder-navn">${R.avatar(sp.holder)}<b>${esc(R.navn(sp.holder))}</b></span><span class="bt-ord">${esc(ordTekst(sp.ord))}</span></p>
            <div class="bt-fare" aria-hidden="true"></div>
            ${R.ui.dokk(R.ui.knapp("Send videre", "send", { variant: "stor" }), sp.kort.b ? R.ui.lenkerad(R.ui.lenke("Bytt bokstav", "bytt-bokstav")) : `<p class="bt-hvisk">Pssst … ikke vekk trollet!</p>`)}`;
        },
        inn(S) {
          const sp = S.spill;
          R.holdVaken();
          bytter = false;
          // The final is quick: the troll sleeps lightly.
          const [min, maks] = sp.finale ? SOVN.lett : SOVN[sp.sovn] || SOVN.normalt;
          sp.varighet = Math.round((min + Math.random() * (maks - min)) * 1000);
          sp.slutt = Date.now() + sp.varighet;
          sp.pauset = 0;
          startKlokke(S);
        },
        ut(S) {
          stoppBomba();
          bytter = false;
          if (S.spill) S.spill.slutt = 0;
          const skjerm = R.$("#skjerm");
          if (skjerm) {
            skjerm.classList.remove("vakner", "risting");
            skjerm.style.removeProperty("--fare");
          }
        },
      },

      vakna: {
        tittel: (S) => (S.spill.finale ? "Finalen" : `Runde ${S.spill.runde}`),
        tilbake: "hjem",
        // The phone's best guess (from the "Send videre" taps) is one big button; the others below.
        vis(S) {
          const sp = S.spill;
          const liste = aktive(sp);
          const gjett = liste.includes(sp.holder) ? sp.holder : -1;
          const andre = liste.filter((i) => i !== gjett);
          const knapp = (i, stor) => `<button class="bt-spiller${stor ? " trolig" : ""}" data-h="taper" data-v="${i}" style="--pf: var(--p${(i % 20) + 1})">
              ${R.avatar(i, stor ? "stor" : "mid")}<span class="bt-spiller-tekst"><span class="bt-spiller-navn">${esc(R.navn(i))}</span>${hjerter(sp.liv[i], LIV)}</span>${stor ? '<span class="bt-trolig" aria-hidden="true">📱</span>' : ""}
            </button>`;
          return `
            <div class="bt-vakna">
              <span class="bt-trollramme vaken">${troll("vaken")}<span class="bt-bo" aria-hidden="true">BØØØ!</span></span>
              <h1 id="skjerm-tittel">Trollet våknet!</h1>
              <p class="ingress">Hvem holdt mobilen?</p>
            </div>
            ${gjett >= 0 ? `<div class="bt-gjett">${knapp(gjett, true)}</div>` : ""}
            ${andre.length ? `${gjett >= 0 ? '<p class="bt-eller">… eller var det en av disse?</p>' : ""}<div class="bt-velg${andre.length > 4 ? " mange" : ""}">${andre.map((i) => knapp(i)).join("")}</div>` : ""}`;
        },
      },

      tap: {
        tittel: (S) => (S.spill.finale ? "Finalen" : `Runde ${S.spill.runde}`),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.taper;
          const l = sp.liv[i];
          const navn = R.navn(i);
          let tittel, tekst, knapp, merke;
          if (sp.finale) {
            // The final takes no hearts: whoever held the phone is out of it.
            const igjen = sp.finale.length > 1;
            tittel = `${navn} røk ut av finalen!`;
            tekst = igjen ? "Finalen fortsetter med dem som er igjen." : "Da er det bare én igjen …";
            knapp = igjen ? R.ui.knapp("Neste finalerunde", "neste-runde") : R.ui.knapp("Til kåringen", "bomba-vinner");
            merke = "👋";
          } else if (l > 0) {
            tittel = `${navn} mistet et hjerte!`;
            tekst = R.velg(["Trollet gjesper og sovner igjen …", "Det var nære på!", "Trollet knurrer fornøyd.", "Pass deg neste gang!", "Trollet smatter og sover videre."]);
            knapp = R.ui.knapp("Neste runde", "neste-runde");
            merke = "💔";
          } else if (sp.sistemann) {
            const slutt = aktive(sp).length <= 1;
            tittel = `${navn} er ute!`;
            tekst = R.velg(["Trollet tok deg med hjem til hula!", "Nå må du heie på de andre!", "Ute – men du var tøff!"]);
            knapp = slutt ? R.ui.knapp("Til kåringen", "bomba-vinner") : R.ui.knapp("Neste runde", "neste-runde");
            merke = "💔";
          } else {
            const finale = trengerFinale(sp);
            tittel = `${navn} mistet det siste hjertet!`;
            tekst = finale ? `Da er spillet slutt. ${R.ramsOpp(flest(sp).map((x) => R.navn(x)))} har like mange hjerter – det blir finale!` : "Da er spillet slutt – nå telles hjertene.";
            knapp = finale ? R.ui.knapp("Til finalen", "finale") : R.ui.knapp("Til kåringen", "bomba-vinner");
            merke = "💔";
          }
          return `
            <div class="bt-tap">
              <span class="bt-tap-avatar">${R.avatar(i, "gigant")}<span class="bt-knust" aria-hidden="true">${merke}</span></span>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${sp.finale ? "" : l > 0 || !sp.sistemann ? `<p class="bt-stor-hjerter">${hjerter(l, LIV)}</p>` : `<p class="bt-stor-ute" aria-hidden="true">👻</p>`}
              <p class="ingress">${esc(tekst)}</p>
              ${sp.ord > 0 ? `<p class="bt-rundeord${sp.nyRekord ? " rekord" : ""}">${sp.nyRekord ? `<b>Ny rekord!</b> ` : ""}${esc(ordTekst(sp.ord))} før trollet våknet</p>` : ""}
            </div>
            ${livRad(sp)}
            ${R.ui.dokk(knapp, R.ui.lenkerad(R.ui.lenke("Angre – det var feil person", "angre")))}`;
        },
        // A soft "uff" for a lost heart (no booing at children); a deeper thud when someone is out
        // or the game is over.
        inn(S) {
          const sp = S.spill;
          if (!sp.finale && sp.liv[sp.taper] > 0) {
            R.lyd.tone(392, 0, 0.18, "triangle", 0.12, 330);
            R.lyd.tone(294, 0.16, 0.32, "triangle", 0.11, 220);
          } else {
            R.lyd.bom();
            R.vibrer([100, 60, 100]);
          }
        },
      },

      // ---------- Bokstavjakt ----------

      "jakt-klar": {
        tittel: (S) => jaktTittel(S.spill),
        tilbake: "hjem",
        vis: (S) => `
          <div class="bt-jakt-start">
            <span class="bt-trollramme glad">${troll("glad", "?")}</span>
            <p class="etikett">Bokstavjakt · ${esc(jaktTittel(S.spill).toLowerCase())}</p>
            <h1 id="skjerm-tittel">${S.spill.ekstra ? "Det står likt – denne runden avgjør!" : "Finn fram blyant og papir!"}</h1>
            <ol class="bt-forbered">
              <li><span aria-hidden="true">📝</span>Skriv 1 til 5 nedover arket</li>
              <li><span aria-hidden="true">🔤</span>Trollet trekker en bokstav</li>
              <li><span aria-hidden="true">⏱️</span>${S.spill.tid} sekunder – skriv et ord til hver kategori</li>
            </ol>
          </div>
          ${R.ui.dokk(R.ui.knapp("Trekk bokstav", "jakt-trekk", { variant: "stor" }), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`,
      },

      jakt: {
        tittel: (S) => jaktTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const r = S.spill.r;
          const trekk = r.fase === "trekk";
          return `
            <div class="bt-jakt-topp">
              <div class="bt-jakt-bokstav">
                <h1 id="skjerm-tittel" class="vh">Ord på ${esc(r.b)}</h1>
                <span class="bt-bokstav stor${trekk ? " nytt" : ""}" data-bokstav="${esc(r.b)}" aria-hidden="true"><span>${trekk ? "?" : esc(r.b)}</span></span>
              </div>
              ${R.ui.timer({ id: "jakt-tid", sekunder: r.igjen, kontrollHtml: `<button class="knapp-2 liten" data-h="timer-veksle" data-v="jakt-tid" data-timer-pause>Pause</button><button class="knapp-2 liten" data-h="timer-pluss" data-v="jakt-tid">+30 s</button>` })}
            </div>
            <ol class="bt-kategorier${trekk ? " skjult" : ""}">${r.k
              .map((k, n) => `<li style="--n:${n}"><span class="bt-nr">${n + 1}</span><span class="bt-ki" aria-hidden="true">${esc(KAT[k].i)}</span><span class="bt-kn">${esc(KAT[k].t)}</span></li>`)
              .join("")}</ol>
            <span class="bt-trollramme bt-jakt-troll glad" aria-hidden="true">${troll("glad", r.b)}</span>
            ${R.ui.dokk(R.ui.knapp("Alle er ferdige", "jakt-ferdig", { av: trekk }))}`;
        },
        async inn(S) {
          const fortsatt = R.vakt();
          const sp = S.spill;
          const r = sp.r;
          // Pens are already down (e.g. a reload during «Blyantene ned!»): go to the scoring.
          if (!r || r.fase === "poeng" || r.fase === "ferdig") return R.gaTil(r ? jaktSkjerm(r) : "jakt-klar");
          R.holdVaken();
          if (r.fase === "trekk") {
            await R.vent(R.rolig() ? 50 : 350);
            if (!fortsatt()) return;
            await spinn(R.$(".bt-jakt-bokstav .bt-bokstav"), r.b);
            if (!fortsatt()) return;
            const liste = R.$(".bt-kategorier");
            if (liste) liste.classList.remove("skjult");
            R.si(`Bokstaven er ${r.b}. Kategoriene er: ${r.k.map((k) => KAT[k].t).join(", ")}.`);
            await R.vent(R.rolig() ? 100 : 900);
            if (!fortsatt()) return;
            r.fase = "skriv";
            R.lagre();
            const knapp = R.$('[data-h="jakt-ferdig"]');
            if (knapp) knapp.disabled = false;
          }
          if (r.fase !== "skriv") return;
          let sist = Date.now();
          new R.Timer({
            id: "jakt-tid",
            sekunder: Math.max(1, r.igjen),
            vedTikk(sek) {
              r.igjen = sek;
              if (Date.now() - sist > 1900) {
                sist = Date.now();
                R.lagre();
              }
            },
            vedSlutt: () => jaktSlutt(S, true),
          }).start();
        },
        ut(S) {
          const t = R.timer("jakt-tid");
          if (t && S.spill && S.spill.r) S.spill.r.igjen = Math.max(1, Math.ceil(t.igjen));
          R.slippVaken();
        },
      },

      "jakt-poeng": {
        tittel: (S) => `Kategori ${S.spill.r.nr + 1} av ${S.spill.r.k.length}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const k = r.k[r.nr];
          const siste = r.nr === r.k.length - 1;
          const mangler = r.mangler ? r.score.filter((rad) => rad[r.nr] == null).length : 0;
          return `
            <div class="bt-poengkort">
              <p class="etikett">Les opp svarene!</p>
              <h1 id="skjerm-tittel"><span class="bt-ki" aria-hidden="true">${esc(KAT[k].i)}</span>${esc(KAT[k].t)} <span class="bt-pa-bokstav">på ${esc(r.b)}</span></h1>
              <ul class="bt-forklaring" aria-label="Poeng">
                <li><b>2</b> Ingen andre hadde ordet</li>
                <li><b>1</b> Flere hadde samme ord</li>
                <li><b>0</b> Ikke noe ord</li>
              </ul>
            </div>
            <ul class="bt-poengrader">${Array.from({ length: sp.antall }, (_, i) => {
              const v = r.score[i][r.nr];
              // A row nobody has scored is marked when the group tries to move on (never a silent 0).
              const tom = r.mangler && v == null;
              return `<li class="${tom ? "mangler" : ""}" style="--pf: var(--p${(i % 20) + 1})">${R.avatar(i)}<span class="bt-pr-navn">${esc(R.navn(i))}${tom ? '<small class="bt-mangler">Mangler poeng</small>' : ""}</span>
                <div class="seg bt-pseg" role="group" aria-label="Poeng til ${esc(R.navn(i))}">${[0, 1, 2]
                  .map((p) => `<button data-h="poeng" data-v="${i}:${p}" aria-pressed="${v === p}">${p}</button>`)
                  .join("")}</div></li>`;
            }).join("")}</ul>
            ${R.ui.dokk(
              mangler ? `<p class="bt-mangler-linje" role="status">Sett 0, 1 eller 2 for ${mangler === 1 ? "den siste" : "alle"} før dere går videre.</p>` : "",
              R.ui.knapp(siste ? "Se poengene" : "Neste kategori", "kat-neste"),
              r.nr > 0 ? R.ui.lenkerad(R.ui.lenke("Forrige kategori", "kat-forrige")) : "",
            )}`;
        },
      },

      "jakt-stilling": {
        tittel: "Stillingen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = sp.poeng.map((p, i) => ({ i, poeng: p, pluss: sp.rundePoeng[i] || 0 }));
          const best = Math.max(...sp.poeng);
          const ledere = rader.filter((r) => r.poeng === best).map((r) => R.navn(r.i));
          const status = jaktStatus(sp);
          const tittel = status === "ekstra" ? `${R.ramsOpp(ledere)} står likt!` : best === 0 ? "Alle står likt" : ledere.length === sp.antall ? "Helt likt!" : `${R.ramsOpp(ledere)} leder!`;
          const knapp = status === "ferdig" ? R.ui.knapp("Til kåringen", "jakt-karing") : R.ui.knapp(status === "ekstra" ? "Ekstrarunde" : "Ny runde", "jakt-ny-runde");
          return `
            <div class="banner">
              <span class="bt-trollramme glad">${troll("glad", sp.r ? sp.r.b : "A")}</span>
              <p class="etikett">${status ? "Siste runde er ferdig" : `${esc(jaktTittel(sp))} er ferdig`}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              ${status === "ekstra" ? `<p class="ingress">Én ekstrarunde avgjør.</p>` : sp.lengde === "30" && !status ? `<p class="ingress">Første til 30 poeng vinner.</p>` : ""}
            </div>
            ${R.ui.poengliste(rader)}
            ${R.ui.dokk(knapp, R.ui.lenkerad(R.ui.lenke("Endre poengene", "endre-poeng"), status === "ferdig" ? "" : R.ui.lenke("Avslutt", "avslutt")))}`;
        },
      },

      vinner: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const dokk = R.ui.flereSpill({ antall: sp.antall }) + R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'));
          if (sp.modus === "bomba") {
            const rad = bombaRangering(sp);
            const vant = rad.filter((r) => r.plass === 1);
            const alene = vant.length === 1;
            const v = vant[0].i;
            // Worth telling others about: this game holds the phone's record.
            const rekord = lesRekord().ord;
            const del = (sp.best || 0) >= 5 && sp.best >= rekord;
            return `
              <div class="banner aksent">
                ${alene ? `<span class="bt-vinner">${R.avatar(v, "gigant")}<span class="bt-krone" aria-hidden="true">👑</span></span>` : `<span class="bt-trollramme glad">${troll("glad", "A")}</span>`}
                <p class="etikett">${alene ? (sp.finaleUt && sp.finaleUt.length ? "Vant finalen" : "Lurte trollet til slutt") : "Like mange hjerter"}</p>
                <h1 id="skjerm-tittel">${esc(`${R.ramsOpp(vant.map((r) => R.navn(r.i)))} vinner!`)}</h1>
                <p class="bt-stor-hjerter">${hjerter(sp.liv[v], LIV)}</p>
              </div>
              <ol class="bt-rekke">${rad
                .map(
                  (r) =>
                    `<li class="${r.plass === 1 ? "vinner" : ""}" style="--pf: var(--p${(r.i % 20) + 1})"><span class="bt-plass">${r.plass}</span>${R.avatar(r.i)}<span class="bt-pr-navn">${esc(R.navn(r.i))}</span>${
                      sp.liv[r.i] > 0 || !sp.sistemann ? hjerter(sp.liv[r.i], LIV) : '<span aria-hidden="true">👻</span>'
                    }</li>`,
                )
                .join("")}</ol>
              ${del ? `<p class="bt-rundeord rekord"><b>Rekord!</b> ${esc(ordTekst(sp.best))} før trollet våknet</p>${R.ui.knapp2("Del rekorden", "del")}` : ""}
              ${dokk}`;
          }
          const rader = sp.poeng.map((p, i) => ({ i, poeng: p }));
          const best = Math.max(...sp.poeng);
          const vinnere = rader.filter((r) => r.poeng === best);
          const alene = vinnere.length === 1;
          return `
            <div class="banner aksent">
              ${alene ? `<span class="bt-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="bt-krone" aria-hidden="true">👑</span></span>` : `<span class="bt-trollramme glad">${troll("glad", "A")}</span>`}
              <p class="etikett">${alene ? `${best} poeng etter ${R.flertall(sp.spilt || 1, "runde", "runder")}` : `Like mange poeng · ${best} hver`}</p>
              <h1 id="skjerm-tittel">${esc(`${R.ramsOpp(vinnere.map((r) => R.navn(r.i)))} vinner!`)}</h1>
            </div>
            ${sp.antall >= 3 ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp.meldt) {
            // Once per game: «Kveldens gjeng» and the statistics. Bomba is ranked by place (the final
            // and the order of leaving count), Bokstavjakt by points.
            sp.meldt = true;
            R.statistikk("ferdig", { modus: sp.modus, runder: sp.modus === "bomba" ? sp.runde : sp.spilt || 0 });
            R.kveld.registrer(sp.modus === "bomba" ? bombaRangering(sp).map((r) => ({ i: r.i, poeng: 100 - r.plass })) : sp.poeng.map((p, i) => ({ i, poeng: p })));
          }
          R.lyd.fanfare();
          R.konfetti();
        },
      },
    },

    handlinger: (H = {
      hjem: () => R.gaTil("hjem"),
      nytt: () => R.gaTil("oppsett"),
      "velg-modus"(el, e, S) {
        S.oppsett.modus = el.dataset.v === "jakt" ? "jakt" : "bomba";
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return R.gaTil("hjem");
        if (sp.modus === "bomba") return R.gaTil(sp.fase === "vakna" ? "vakna" : sp.fase === "tap" && sp.taper >= 0 ? "tap" : "klar");
        if (!sp.r || sp.r.fase === "ferdig") return R.gaTil(sp.r ? "jakt-stilling" : "jakt-klar");
        R.gaTil(sp.r.fase === "poeng" ? "jakt-poeng" : "jakt");
      },
      krav(el, e, S) {
        if (erKrav(el.dataset.v)) S.oppsett.krav = el.dataset.v;
        R.vis();
      },
      niva(el, e, S) {
        if (el.dataset.v in NIVA) S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      sovn(el, e, S) {
        S.oppsett.sovn = el.dataset.v;
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      lengde(el, e, S) {
        if (LENGDER.some(([v]) => v === el.dataset.v)) S.oppsett.lengde = el.dataset.v;
        R.vis();
      },
      vanskelig(el, e, S) {
        S.oppsett.vanskelig = !S.oppsett.vanskelig;
        R.vis();
      },
      jul(el, e, S) {
        S.oppsett.jul = !S.oppsett.jul;
        R.vis();
      },
      sistemann(el, e, S) {
        S.oppsett.sistemann = !S.oppsett.sistemann;
        R.vis();
      },
      // Every action that awaits checks R.vakt() afterwards: if the screen changed meanwhile, it stops.
      async start(el, e, S) {
        // Never throw away a running game without asking.
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig))) || !fortsatt()) return;
        const sp = nySpill(S);
        nyttKort = true;
        R.gaTil(sp.modus === "bomba" ? "klar" : "jakt-klar");
      },
      igjen(el, e, S) {
        H.start(el, e, S);
      },
      // Ending early is always just «Avslutt»; the sheet says what happens. With something to rank
      // (a heart lost, a round scored) it goes to «Kåringen»; otherwise the game is cleared.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return R.gaTil("hjem");
        const karing = sp.modus === "jakt" ? (sp.spilt || 0) > 0 : sp.liv.some((l) => l < LIV) || !!sp.finale;
        const tekst = !karing ? "Spillet blir borte – ingen har vunnet noe ennå." : sp.modus === "jakt" ? "Den som har flest poeng nå, vinner." : "Den som har flest hjerter nå, vinner.";
        const fortsatt = R.vakt();
        if (!(await R.bekreft("Avslutte spillet?", tekst, "Avslutt", "Spill videre")) || !fortsatt()) return;
        R.slippVaken();
        if (karing) {
          sp.ferdig = true;
          R.gaTil("vinner");
          return;
        }
        S.spill = null;
        R.gaTil("hjem");
      },

      // Bomba
      "nytt-kort"(el, e, S) {
        const sp = S.spill;
        sp.kort = trekkKort(sp);
        nyttKort = true;
        R.vis();
        const ny = R.$(".bt-kort.nytt .bt-bokstav:not(.bilde)");
        if (ny) spinn(ny, sp.kort.b);
      },
      async "bomba-start"(el, e, S) {
        const sp = S.spill;
        sp.holder = sp.start;
        sp.ord = 0;
        sp.nyRekord = false;
        // Back during the countdown: stay where the player went (no hidden clock behind their back).
        if (!(await R.nedtelling(["3", "2", "1", "Si et ord!"], 650))) return;
        sp.fase = "bomba";
        R.gaTil("bomba");
      },
      send(el, e, S) {
        const sp = S.spill;
        if (!sp.slutt || bytter || Date.now() - sistSendt < 350) return;
        sistSendt = Date.now();
        sp.holder = nesteAktiv(sp, sp.holder);
        sp.ord += 1;
        R.lyd.sveip();
        R.vibrer(12);
        const navn = R.$(".bt-holder-navn");
        if (navn) {
          navn.innerHTML = `${R.avatar(sp.holder)}<b>${esc(R.navn(sp.holder))}</b>`;
          if (!R.rolig()) {
            navn.classList.remove("ny");
            void navn.offsetWidth;
            navn.classList.add("ny");
          }
        }
        const ord = R.$(".bt-ord");
        if (ord) ord.textContent = ordTekst(sp.ord);
        // A new letter for the next player (the category stays for the whole round): every turn
        // needs one word for one letter, so the chain never runs dry.
        if (sp.kort.b) {
          sp.kort.b = trekkBokstav(sp);
          const blokk = R.$(".bt-kort .bt-bokstav");
          if (blokk) {
            blokk.dataset.bokstav = sp.kort.b;
            blokk.querySelector("span").textContent = sp.kort.b;
            if (!R.rolig()) {
              blokk.classList.remove("vendt", "landet");
              void blokk.offsetWidth;
              blokk.classList.add("vendt");
            }
          }
          setTimeout(() => R.lyd.tikk(), 120);
        }
        R.si(sp.kort.b ? `${R.navn(sp.holder)}: ${sp.kort.b}` : R.navn(sp.holder));
      },
      // A new letter for the one who holds the phone. It spins for about two seconds: the price is time.
      async "bytt-bokstav"(el, e, S) {
        const sp = S.spill;
        if (!sp.slutt || !sp.kort.b || bytter) return;
        bytter = true;
        const send = R.$('#skjerm [data-h="send"]');
        if (send) send.disabled = true;
        sp.kort.b = trekkBokstav(sp);
        const ny = sp.kort.b;
        const blokk = R.$(".bt-kort .bt-bokstav");
        if (blokk) {
          blokk.dataset.bokstav = ny;
          blokk.classList.remove("vendt", "landet");
        }
        R.si("Bytter bokstav");
        if (R.rolig()) await R.vent(1500); // no spinning with reduced motion, but the same price
        await spinn(blokk, ny);
        bytter = false;
        const send2 = R.$('#skjerm [data-h="send"]');
        if (send2) send2.disabled = false;
        if (S.spill === sp && sp.slutt) R.si(`Ny bokstav: ${ny}`);
      },
      taper(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!aktive(sp).includes(i)) return;
        if (sp.finale) {
          sp.sist = { i, finale: sp.finale.slice() };
          sp.finale = sp.finale.filter((x) => x !== i);
          sp.finaleUt.push(i);
        } else {
          sp.sist = { i, liv: sp.liv[i] };
          sp.liv[i] -= 1;
          if (sp.liv[i] === 0) sp.ute.push(i);
        }
        sp.taper = i;
        sp.fase = "tap";
        R.gaTil("tap");
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp.sist) return R.gaTil("vakna");
        const { i } = sp.sist;
        if (sp.sist.finale) {
          sp.finale = sp.sist.finale;
          sp.finaleUt = sp.finaleUt.filter((x) => x !== i);
        } else {
          sp.liv[i] = sp.sist.liv;
          sp.ute = sp.ute.filter((x) => x !== i);
        }
        sp.sist = null;
        sp.taper = null;
        sp.fase = "vakna";
        R.gaTil("vakna");
      },
      "neste-runde"(el, e, S) {
        const sp = S.spill;
        const t = sp.taper;
        sp.runde += 1;
        // The one who lost the heart begins – or the next one who is still in.
        sp.start = aktive(sp).includes(t) ? t : nesteAktiv(sp, t);
        sp.holder = sp.start;
        sp.ord = 0;
        sp.nyRekord = false;
        sp.sist = null;
        sp.taper = null;
        sp.fase = "klar";
        sp.kort = trekkKort(sp);
        nyttKort = true;
        R.gaTil("klar");
      },
      // Several players have the most hearts: they play on alone until one is left.
      finale(el, e, S) {
        const sp = S.spill;
        if (!trengerFinale(sp)) return;
        sp.finale = flest(sp);
        sp.finaleUt = [];
        H["neste-runde"](el, e, S);
      },
      "bomba-vinner"(el, e, S) {
        S.spill.ferdig = true;
        R.slippVaken();
        R.gaTil("vinner");
      },
      del(el, e, S) {
        const sp = S.spill;
        if (sp && sp.best) R.del("Bokstavtrollet", `Bokstavtrollet 💣 Vi rakk ${ordTekst(sp.best)} før trollet våknet! Klarer dere flere?`, DEL_URL);
      },

      // Bokstavjakt
      "jakt-trekk"(el, e, S) {
        nyJaktRunde(S.spill);
        R.gaTil("jakt");
      },
      async "jakt-ferdig"(el, e, S) {
        const t = R.timer("jakt-tid");
        const kjorte = t && t.kjorer;
        if (t) t.pause();
        const fortsatt = R.vakt();
        const ferdig = await R.bekreft("Er alle ferdige?", "Da går dere videre til poengene.", "Ja, ferdig!", "Nei, vent");
        if (!fortsatt()) return;
        if (ferdig) jaktSlutt(S, false);
        else if (t && kjorte) t.fortsett();
      },
      poeng(el, e, S) {
        const [i, p] = el.dataset.v.split(":").map(Number);
        const r = S.spill.r;
        if (!r || !r.score[i]) return;
        r.score[i][r.nr] = r.score[i][r.nr] === p ? null : p;
        R.vis();
      },
      "kat-forrige"(el, e, S) {
        const r = S.spill.r;
        r.nr = Math.max(0, r.nr - 1);
        r.mangler = false;
        R.gaTil("jakt-poeng");
      },
      "kat-neste"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        // Everyone gets 0, 1 or 2 before the group moves on: a row nobody touched is not a silent 0.
        const uten = r.score.map((rad, i) => (rad[r.nr] == null ? i : -1)).filter((i) => i >= 0);
        if (uten.length) {
          r.mangler = true;
          R.vis();
          R.lyd.tikk();
          R.vibrer(30);
          R.si(`Mangler poeng for ${R.ramsOpp(uten.map((i) => R.navn(i)))}.`);
          return;
        }
        r.mangler = false;
        if (r.nr < r.k.length - 1) {
          r.nr += 1;
          R.gaTil("jakt-poeng");
          return;
        }
        sp.rundePoeng = r.score.map((rad) => rad.reduce((s, p) => s + (p || 0), 0));
        sp.rundePoeng.forEach((p, i) => (sp.poeng[i] += p));
        sp.spilt = (sp.spilt || 0) + 1;
        r.fase = "ferdig";
        R.lyd.fanfare();
        R.gaTil("jakt-stilling");
      },
      // Undo the round's points and go back to the last category (until a new round starts).
      "endre-poeng"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
        if (!r || r.fase !== "ferdig") return;
        sp.rundePoeng.forEach((p, i) => (sp.poeng[i] -= p));
        sp.rundePoeng = sp.rundePoeng.map(() => 0);
        sp.spilt = Math.max(0, (sp.spilt || 1) - 1);
        r.fase = "poeng";
        r.nr = r.k.length - 1;
        R.gaTil("jakt-poeng");
      },
      "jakt-ny-runde"(el, e, S) {
        const sp = S.spill;
        if (jaktStatus(sp) === "ferdig") return H["jakt-karing"](el, e, S);
        if (jaktStatus(sp) === "ekstra") sp.ekstra = true;
        sp.runde += 1;
        sp.r = null;
        sp.rundePoeng = sp.rundePoeng.map(() => 0);
        R.gaTil("jakt-klar");
      },
      "jakt-karing"(el, e, S) {
        S.spill.ferdig = true;
        R.slippVaken();
        R.gaTil("vinner");
      },
    }),
  });
})();
