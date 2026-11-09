/* Bokstavtrollet — the alphabet game ("Alfabetleken"). Two modes:
   Bomba: the troll draws a category and a letter. Say a word that fits and pass the phone on. A
   hidden timer runs while the troll sleeps and its heartbeat speeds up; when it wakes (roar, shake,
   red flash) whoever holds the phone loses a heart. Three hearts each; the last one standing wins.
   Bokstavjakt: one letter and five categories, everyone writes on paper against the clock, then the
   app walks through the categories so the group can score them (2 unique, 1 shared, 0 nothing). */
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
  const FARGE = G.farge("bokstavtrollet");
  const kortstokk = R.kortstokk("kategorier", KAT.length);

  let H; // actions
  let nyttKort = false; // spin the letter on the next draw

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

  const passer = (sp, unntak) => (i) => KAT[i].n <= NIVA[sp.niva] && !(KAT[i].kun && KAT[i].kun !== sp.modus) && !(unntak || []).includes(i);
  const trekkKategori = (sp, unntak) => kortstokk.neste(passer(sp, unntak));

  function kortHtml(k, b, o = {}) {
    return `<h1 class="bt-kort${o.liten ? " liten" : ""}${o.nytt ? " nytt" : ""}" id="skjerm-tittel">
      <span class="bt-kat"><span class="bt-kat-ikon" aria-hidden="true">${esc(KAT[k].i)}</span><span class="bt-kat-navn">${esc(KAT[k].t)}</span></span>
      <span class="bt-pa">som begynner på</span>
      <span class="bt-bokstav" data-bokstav="${esc(b)}"><span>${esc(b)}</span></span>
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

  const levende = (sp) => sp.liv.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);
  function nesteLevende(sp, i) {
    for (let n = 1; n <= sp.antall; n++) {
      const j = (i + n) % sp.antall;
      if (sp.liv[j] > 0) return j;
    }
    return i;
  }
  const hjerter = (l, maks) =>
    `<span class="bt-hjerter" aria-label="${l} av ${maks} hjerter">${Array.from({ length: maks }, (_, n) => `<i class="${n < l ? "pa" : ""}">♥</i>`).join("")}</span>`;

  function livRad(sp, o = {}) {
    return `<ul class="bt-liv${sp.antall > 6 ? " mange" : ""}" aria-label="Hjerter">${sp.liv
      .map(
        (l, i) => `<li class="${l > 0 ? "" : "ute"}${o.na === i ? " na" : ""}" style="--pf: var(--p${(i % 20) + 1})">
          ${R.avatar(i)}<span class="bt-liv-navn">${esc(R.navn(i))}</span>${l > 0 ? hjerter(l, LIV) : '<span class="bt-ute">👻<span class="bt-ute-tekst"> Ute</span></span>'}
        </li>`,
      )
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

  function rangering(sp) {
    if (sp.modus === "bomba") {
      const vinner = levende(sp);
      return [...vinner, ...sp.ute.slice().reverse()];
    }
    return sp.poeng.map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p).map((r) => r.i);
  }

  function nySpill(S) {
    const o = S.oppsett;
    const antall = R.klamp(S.antall || 2, 2, 12);
    const sp = { modus: o.modus, antall, niva: o.niva, vanskelig: !!o.vanskelig, brukt: [], runde: 1, ferdig: false };
    if (o.modus === "bomba") {
      Object.assign(sp, { sovn: o.sovn, liv: Array.from({ length: antall }, () => LIV), ute: [], start: R.heltall(0, antall - 1), ord: 0, slutt: 0 });
      sp.holder = sp.start;
      sp.kort = { k: trekkKategori(sp), b: trekkBokstav(sp) };
    } else {
      Object.assign(sp, { tid: o.tid, poeng: Array.from({ length: antall }, () => 0), rundePoeng: Array.from({ length: antall }, () => 0), r: null });
    }
    S.spill = sp;
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
      oppsett: { modus: "bomba", niva: "barn", vanskelig: false, sovn: "normalt", tid: 90 },
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "bomba", niva: "barn", vanskelig: false, sovn: "normalt", tid: 90 }, S.oppsett || {}));
      if (!["bomba", "jakt"].includes(o.modus)) o.modus = "bomba";
      if (!(o.niva in NIVA)) o.niva = "barn";
      if (!(o.sovn in SOVN)) o.sovn = "normalt";
      if (![60, 90, 120].includes(o.tid)) o.tid = 90;
      S.antall = R.klamp(Number(S.antall) || 3, 2, 12);
      const sp = S.spill;
      if (sp) {
        const godKat = (i) => Number.isInteger(i) && KAT[i];
        let ok = (sp.modus === "bomba" || sp.modus === "jakt") && Number.isInteger(sp.antall) && sp.antall >= 2 && Array.isArray(sp.brukt);
        if (ok && sp.modus === "bomba") ok = Array.isArray(sp.liv) && sp.liv.length === sp.antall && sp.kort && godKat(sp.kort.k) && Array.isArray(sp.ute);
        if (ok && sp.modus === "jakt") ok = Array.isArray(sp.poeng) && sp.poeng.length === sp.antall && (!sp.r || (Array.isArray(sp.r.k) && sp.r.k.every(godKat)));
        if (!ok) S.spill = null;
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
        ["Bomba: si et ord", "Trollet trekker en kategori og en bokstav, for eksempel «Dyr på B». Si et ord som passer, og send mobilen videre."],
        ["Ikke vekk trollet!", "Trollet kan våkne når som helst. Den som holder mobilen da, mister et hjerte. Den som er igjen til slutt, vinner."],
        ["Bokstavjakt: skriv ord", "Alle skriver ett ord til hver av de fem kategoriene. Les opp etterpå: et ord ingen andre har, gir 2 poeng. Likt ord gir 1."],
      ],
      tips: [
        "Ordet er allerede sagt? Da må du finne et nytt.",
        "Er kortet helt umulig? Trykk «Nytt kort» før dere starter.",
        "Vanskelige bokstaver (C, W, Y, Z, Æ, Ø og Å) skrur du på i oppsettet.",
        "Små barn kan få hjelp av en voksen – eller si et hvilket som helst ord på bokstaven, uten kategori.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = sp && !sp.ferdig;
          const fortsett = aktiv ? R.ui.knapp(sp.modus === "bomba" ? `Fortsett Bomba · runde ${sp.runde}` : `Fortsett Bokstavjakt · runde ${sp.runde}`, "fortsett", { ikon: "▶" }) : "";
          return R.ui.spillhjem({
            slagordHtml: "Si et ord på bokstaven.<br><em>Ikke vekk trollet!</em>",
            knapperHtml: `${fortsett}
              <div class="bt-moduser">
                <button class="bt-modus bomba" data-h="velg-modus" data-v="bomba"><span class="bt-modus-ikon" aria-hidden="true">💣</span><b>Bomba</b><span>Send mobilen før trollet våkner</span></button>
                <button class="bt-modus jakt" data-h="velg-modus" data-v="jakt"><span class="bt-modus-ikon" aria-hidden="true">✏️</span><b>Bokstavjakt</b><span>Skriv ord med blyant og papir</span></button>
              </div>
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
          return `
            <h1 id="skjerm-tittel" class="bt-oppsett-tittel"><span aria-hidden="true">${o.modus === "jakt" ? "✏️" : "💣"}</span> Gjør klart til ${o.modus === "jakt" ? "Bokstavjakt" : "Bomba"}</h1>
            ${R.ui.spillere({ min: 2, max: 12, tittel: "Hvem spiller?", hjelp: o.modus === "bomba" ? "Sitt i ring, i samme rekkefølge som her." : "Alle trenger et ark og en blyant." })}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Nivå</h2></div>
              ${R.ui.seg("niva", D.nivaer.map((n) => [n.id, n.navn]), o.niva, { etikett: "Nivå" })}
              <p class="hjelp">${esc(D.nivaer.find((n) => n.id === o.niva).tekst)} · ${KAT.filter((k) => k.n <= NIVA[o.niva] && !(k.kun && k.kun !== o.modus)).length} kategorier</p>
            </section>
            ${
              o.modus === "bomba"
                ? `<section class="seksjon">
                    <div class="seksjon-hode"><h2>Hvor tungt sover trollet?</h2></div>
                    ${R.ui.seg("sovn", [["tungt", "😴 Tungt"], ["normalt", "Normalt"], ["lett", "👂 Lett"]], o.sovn, { etikett: "Søvn" })}
                    <p class="hjelp">${o.sovn === "tungt" ? "Lang tid før trollet våkner." : o.sovn === "lett" ? "Trollet kan våkne veldig fort!" : "Trollet våkner etter 15 til 45 sekunder."}</p>
                  </section>`
                : `<section class="seksjon">
                    <div class="seksjon-hode"><h2>Tid til å skrive</h2></div>
                    ${R.ui.seg("tid", [[60, "1 min"], [90, "1½ min"], [120, "2 min"]], o.tid, { etikett: "Tid" })}
                  </section>`
            }
            ${R.ui.bryter("vanskelig", o.vanskelig, "Vanskelige bokstaver", "C, W, Y, Z, Æ, Ø og Å kan også komme.")}
            ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: o.modus === "bomba" ? "💣" : "✏️" }))}`;
        },
      },

      // ---------- Bomba ----------

      klar: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const ny = nyttKort;
          nyttKort = false;
          return `
            <div class="bt-klar">
              ${sovendeTroll()}
              ${kortHtml(sp.kort.k, sp.kort.b, { nytt: ny })}
            </div>
            <p class="bt-forst">${R.avatar(sp.start)}<span><b>${esc(R.navn(sp.start))}</b> begynner</span></p>
            ${sp.runde === 1 ? '<p class="bt-hint"><span aria-hidden="true">🗣️</span> Si et ord som passer <span aria-hidden="true">➜</span> trykk «Send videre» og gi mobilen til neste</p>' : ""}
            ${livRad(sp, { na: sp.start })}
            ${R.ui.dokk(R.ui.knapp("Start runden", "bomba-start", { variant: "stor", ikon: "💣" }), R.ui.lenkerad(R.ui.lenke("Nytt kort", "nytt-kort"), R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn(S) {
          const el = R.$(".bt-kort.nytt .bt-bokstav");
          if (el) spinn(el, S.spill.kort.b);
        },
      },

      bomba: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            ${kortHtml(sp.kort.k, sp.kort.b, { liten: true })}
            <div class="bt-scene">
              ${sovendeTroll()}
              <span class="bt-puls" aria-hidden="true">♥</span>
            </div>
            <p class="bt-holder"><span class="bt-mobil" aria-hidden="true">📱</span><span class="bt-holder-navn" aria-live="polite">${R.avatar(sp.holder)}<b>${esc(R.navn(sp.holder))}</b></span><span class="bt-ord">${sp.ord} ord</span></p>
            <div class="bt-fare" aria-hidden="true"></div>
            ${R.ui.dokk(R.ui.knapp("Send videre", "send", { variant: "stor", ikon: "➜" }), `<p class="bt-hvisk">Pssst … ikke vekk trollet!</p>`)}`;
        },
        inn(S) {
          const sp = S.spill;
          R.holdVaken();
          const [min, maks] = SOVN[sp.sovn] || SOVN.normalt;
          sp.varighet = Math.round((min + Math.random() * (maks - min)) * 1000);
          sp.slutt = Date.now() + sp.varighet;
          sp.pauset = 0;
          startKlokke(S);
        },
        ut(S) {
          stoppBomba();
          if (S.spill) S.spill.slutt = 0;
          const skjerm = R.$("#skjerm");
          if (skjerm) {
            skjerm.classList.remove("vakner", "risting");
            skjerm.style.removeProperty("--fare");
          }
        },
      },

      vakna: {
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        // The phone's best guess (from the "Send videre" taps) is one big button; the others below.
        vis(S) {
          const sp = S.spill;
          const liste = levende(sp);
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
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.taper;
          const l = sp.liv[i];
          const ferdig = levende(sp).length <= 1;
          const tekst =
            l > 0
              ? R.velg(["Trollet gjesper og sovner igjen …", "Det var nære på!", "Trollet knurrer fornøyd.", "Pass deg neste gang!", "Trollet smatter og sover videre."])
              : R.velg(["Trollet tok deg med hjem til hula!", "Nå må du heie på de andre!", "Ute – men du var tøff!"]);
          return `
            <div class="bt-tap">
              <span class="bt-tap-avatar">${R.avatar(i, "gigant")}<span class="bt-knust" aria-hidden="true">💔</span></span>
              <h1 id="skjerm-tittel">${esc(l > 0 ? `${R.navn(i)} mistet et hjerte!` : `${R.navn(i)} er ute!`)}</h1>
              ${l > 0 ? `<p class="bt-stor-hjerter">${hjerter(l, LIV)}</p>` : `<p class="bt-stor-ute" aria-hidden="true">👻</p>`}
              <p class="ingress">${esc(tekst)}</p>
            </div>
            ${livRad(sp)}
            ${R.ui.dokk(R.ui.knapp(ferdig ? "Se vinneren" : "Neste runde", ferdig ? "bomba-vinner" : "neste-runde", { ikon: ferdig ? "🏆" : "➜" }), R.ui.lenkerad(R.ui.lenke("Angre – det var feil person", "angre")))}`;
        },
        // A soft "uff" for a lost heart (no booing at children); a deeper thud when someone is out.
        inn(S) {
          const sp = S.spill;
          if (sp.liv[sp.taper] > 0) {
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
        tittel: (S) => `Runde ${S.spill.runde}`,
        tilbake: "hjem",
        vis: (S) => `
          <div class="bt-jakt-start">
            <span class="bt-trollramme glad">${troll("glad", "?")}</span>
            <p class="etikett">Bokstavjakt · runde ${S.spill.runde}</p>
            <h1 id="skjerm-tittel">Finn fram blyant og papir!</h1>
            <ol class="bt-forbered">
              <li><span aria-hidden="true">📝</span>Skriv 1 til 5 nedover arket</li>
              <li><span aria-hidden="true">🔤</span>Trollet trekker en bokstav</li>
              <li><span aria-hidden="true">⏱️</span>${S.spill.tid} sekunder – skriv et ord til hver kategori</li>
            </ol>
          </div>
          ${R.ui.dokk(R.ui.knapp("Trekk bokstav!", "jakt-trekk", { variant: "stor", ikon: "🔤" }), R.ui.lenkerad(R.ui.lenke("Avslutt", "avslutt")))}`,
      },

      jakt: {
        tittel: (S) => `Runde ${S.spill.runde}`,
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
            ${R.ui.dokk(R.ui.knapp("Alle er ferdige!", "jakt-ferdig", { ikon: "✋", av: trekk }))}`;
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
              return `<li style="--pf: var(--p${(i % 20) + 1})">${R.avatar(i)}<span class="bt-pr-navn">${esc(R.navn(i))}</span>
                <div class="seg bt-pseg" role="group" aria-label="Poeng til ${esc(R.navn(i))}">${[0, 1, 2]
                  .map((p) => `<button data-h="poeng" data-v="${i}:${p}" aria-pressed="${v === p}">${p}</button>`)
                  .join("")}</div></li>`;
            }).join("")}</ul>
            ${R.ui.dokk(
              R.ui.knapp(siste ? "Se poengene" : "Neste kategori", "kat-neste", { ikon: siste ? "🏆" : "➜" }),
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
          const tittel = best === 0 ? "Alle står likt" : ledere.length === sp.antall ? "Helt likt!" : `${R.ramsOpp(ledere)} leder!`;
          return `
            <div class="banner">
              <span class="bt-trollramme glad">${troll("glad", sp.r ? sp.r.b : "A")}</span>
              <p class="etikett">Runde ${sp.runde} er ferdig</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
            </div>
            ${R.ui.poengliste(rader)}
            ${R.ui.dokk(
              R.ui.knapp("Ny runde", "jakt-ny-runde", { ikon: "✏️" }),
              R.ui.lenkerad(R.ui.lenke("Endre poengene", "endre-poeng"), R.ui.lenke("Avslutt", "avslutt")),
            )}`;
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
            const rekke = rangering(sp);
            const v = rekke[0];
            return `
              <div class="banner aksent">
                <span class="bt-vinner">${R.avatar(v, "gigant")}<span class="bt-krone" aria-hidden="true">👑</span></span>
                <p class="etikett">Lurte trollet til slutt</p>
                <h1 id="skjerm-tittel">${esc(R.navn(v))} vinner!</h1>
                <p class="bt-stor-hjerter">${hjerter(sp.liv[v], LIV)}</p>
              </div>
              <ol class="bt-rekke">${rekke
                .map((i, n) => `<li style="--pf: var(--p${(i % 20) + 1})"><span class="bt-plass">${n + 1}</span>${R.avatar(i)}<span class="bt-pr-navn">${esc(R.navn(i))}</span>${n === 0 ? "🏆" : "👻"}</li>`)
                .join("")}</ol>
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
        inn() {
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
      niva(el, e, S) {
        S.oppsett.niva = el.dataset.v;
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
      vanskelig(el, e, S) {
        S.oppsett.vanskelig = !S.oppsett.vanskelig;
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
      // Ending early is always just «Avslutt»; the sheet says what happens. Bokstavjakt with points
      // goes to «Kåringen» (most points wins); otherwise the game is cleared.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return R.gaTil("hjem");
        const karing = sp.modus === "jakt" && (sp.spilt || 0) > 0;
        const tekst = karing ? "Den som har flest poeng nå, vinner." : sp.modus === "bomba" ? "Hjertene og runden forsvinner." : "Runden forsvinner.";
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
        sp.kort = { k: trekkKategori(sp, [sp.kort.k]), b: trekkBokstav(sp) };
        nyttKort = true;
        R.vis();
        const ny = R.$(".bt-kort.nytt .bt-bokstav");
        if (ny) spinn(ny, sp.kort.b);
      },
      async "bomba-start"(el, e, S) {
        const sp = S.spill;
        sp.holder = sp.start;
        sp.ord = 0;
        // Back during the countdown: stay where the player went (no hidden clock behind their back).
        if (!(await R.nedtelling(["3", "2", "1", "Si et ord!"], 650))) return;
        sp.fase = "bomba";
        R.gaTil("bomba");
      },
      send(el, e, S) {
        const sp = S.spill;
        if (!sp.slutt || Date.now() - sistSendt < 350) return;
        sistSendt = Date.now();
        sp.holder = nesteLevende(sp, sp.holder);
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
        if (ord) ord.textContent = `${sp.ord} ord`;
      },
      taper(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (!(sp.liv[i] > 0)) return;
        sp.sist = { i, liv: sp.liv[i] };
        sp.liv[i] -= 1;
        if (sp.liv[i] === 0) sp.ute.push(i);
        sp.taper = i;
        sp.fase = "tap";
        R.gaTil("tap");
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp.sist) return R.gaTil("vakna");
        const { i, liv } = sp.sist;
        sp.liv[i] = liv;
        sp.ute = sp.ute.filter((x) => x !== i);
        sp.sist = null;
        sp.taper = null;
        sp.fase = "vakna";
        R.gaTil("vakna");
      },
      "neste-runde"(el, e, S) {
        const sp = S.spill;
        const t = sp.taper;
        sp.runde += 1;
        sp.start = sp.liv[t] > 0 ? t : nesteLevende(sp, t);
        sp.holder = sp.start;
        sp.ord = 0;
        sp.sist = null;
        sp.taper = null;
        sp.fase = "klar";
        sp.kort = { k: trekkKategori(sp, [sp.kort.k]), b: trekkBokstav(sp) };
        nyttKort = true;
        R.gaTil("klar");
      },
      "bomba-vinner"(el, e, S) {
        S.spill.ferdig = true;
        R.slippVaken();
        R.gaTil("vinner");
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
        R.gaTil("jakt-poeng");
      },
      "kat-neste"(el, e, S) {
        const sp = S.spill;
        const r = sp.r;
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
        sp.runde += 1;
        sp.r = null;
        sp.rundePoeng = sp.rundePoeng.map(() => 0);
        R.gaTil("jakt-klar");
      },
    }),
  });
})();
