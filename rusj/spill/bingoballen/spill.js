/* Bingoballen — "Festbingo". Two kinds of bingo, every player with a card on their own phone:
   - Tallbingo (75 balls): the host phone draws the balls; each phone gets its own 5×5 card made
     from the join code and a random four-digit card number, and the host checks a «BINGO!» by
     typing that number (the host's phone can rebuild any card from the code).
   - Festbingo: 4×4 cards of party moments for a theme (julebord, bryllup, 17. mai …); mark what
     happens, and the first full row wins.
   A card is fixed to the phone as soon as it is shown – also after leaving and joining again with
   the same code – so nobody can shop around for a better card. Nothing is sent anywhere. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA;
  const esc = R.esc;
  let H; // the actions, so one action can reuse another

  // The "install as an app" tip at a calm moment – only if the player is still on this screen.
  // (The kit shows it after R.kveld.registrer; games without an evening score call it here.)
  function visTipsSnart() {
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.visInstallTips(), 2500);
  }

  const TEMAER = D.temaer;
  const tema = (id) => TEMAER.find((t) => t.id === id) || TEMAER[0];
  const BOKSTAVER = ["B", "I", "N", "G", "O"];
  const BALLER = 75;
  const AUTO_SEK = 10;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const bokstav = (x) => BOKSTAVER[Math.floor((x - 1) / 15)];
  const MAAL = {
    rekke: { navn: "Én rekke", kort: "én rekke" },
    to: { navn: "To rekker", kort: "to rekker" },
    full: { navn: "Fullt brett", kort: "fullt brett" },
  };
  const NESTE_MAAL = { rekke: "to", to: "full", full: null };

  // ---------- Cards ----------

  // A 75-ball card: column B has 1–15, I 16–30, N 31–45, G 46–60, O 61–75, sorted top to bottom;
  // the centre is free (0). Cells row by row.
  function tallbrett(fro, nr) {
    const t = R.rng(R.hash("tall:" + fro + ":" + nr));
    const kolonner = BOKSTAVER.map((_, k) =>
      R.stokk(
        range(15).map((i) => k * 15 + i + 1),
        t,
      )
        .slice(0, 5)
        .sort((a, b) => a - b),
    );
    const celler = [];
    for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) celler.push(r === 2 && k === 2 ? 0 : kolonner[k][r]);
    return celler;
  }

  // A party card: 16 different moments of the theme.
  function festbrett(fro, temaId, nr) {
    const t = R.rng(R.hash("fest:" + fro + ":" + temaId + ":" + nr));
    return R.stokk(range(tema(temaId).oyeblikk.length), t).slice(0, 16);
  }

  function lagLinjer(n) {
    const l = [];
    for (let r = 0; r < n; r++) l.push(range(n).map((k) => r * n + k));
    for (let k = 0; k < n; k++) l.push(range(n).map((r) => r * n + k));
    l.push(range(n).map((i) => i * n + i));
    l.push(range(n).map((i) => i * n + (n - 1 - i)));
    return l;
  }
  const LINJER = { 4: lagLinjer(4), 5: lagLinjer(5) };
  const hele = (merket, n) => LINJER[n].filter((l) => l.every((i) => merket.has(i)));

  // The host's check of a number card against the balls drawn so far.
  function sjekkBrett(fro, nr, trukket) {
    const celler = tallbrett(fro, nr);
    const sett = new Set(trukket);
    const merket = new Set();
    celler.forEach((x, i) => {
      if (x === 0 || sett.has(x)) merket.add(i);
    });
    const linjer = hele(merket, 5);
    return { celler, merket, linjer, full: merket.size === 25 };
  }
  const oppfyller = (res, maal) => (maal === "full" ? res.full : res.linjer.length >= (maal === "to" ? 2 : 1));

  // ---------- Join codes ----------
  // kind (1 bit) | theme (3) | seed (24), plus two check symbols → 8 characters.
  // Party bingo is salted with the moments, so a phone with other content rejects the code instead
  // of showing other cards. Number bingo has its own salt: its cards never depend on the themes,
  // so a corrected moment must not break a number game between two versions of the site.
  const BREDDER = [1, 3, 24];
  const SJEKK = 2;
  const SALT_TALL = "bingoballen:tall:1";
  const SALT_FEST = "bingoballen:fest:1:" + R.hash(JSON.stringify(TEMAER));
  const KODELENGDE = R.kode.lengde(BREDDER, SJEKK);

  const lagKode = (o) =>
    o.modus === "fest"
      ? R.kode.lag([1, Math.max(0, TEMAER.findIndex((t) => t.id === o.tema)), o.fro], BREDDER, SALT_FEST, SJEKK)
      : R.kode.lag([0, 0, o.fro], BREDDER, SALT_TALL, SJEKK);
  function lesKode(tekst) {
    const tall = R.kode.les(tekst, BREDDER, SALT_TALL, SJEKK);
    if (tall && tall[0] === 0) return { kode: R.kode.normaliser(tekst), modus: "tall", tema: TEMAER[0].id, fro: tall[2] };
    const fest = R.kode.les(tekst, BREDDER, SALT_FEST, SJEKK);
    if (fest && fest[0] === 1 && fest[1] < TEMAER.length) return { kode: R.kode.normaliser(tekst), modus: "fest", tema: TEMAER[fest[1]].id, fro: fest[2] };
    return null;
  }

  function kodeFeil(tekst) {
    const kode = R.kode.normaliser(tekst);
    if (!kode) return "Skriv inn koden først.";
    if (kode.length !== KODELENGDE) return `Koden har ${KODELENGDE} tegn – du har skrevet ${kode.length}.`;
    return "Koden stemmer ikke. Sjekk at den er skrevet riktig.";
  }

  // Six digits: with 40 players the chance of two equal cards is about 1 in 1100.
  const NR_MIN = 100000;
  const NR_MAKS = 999999;
  const nyttNr = () => NR_MIN + (R.nyttFro() % (NR_MAKS - NR_MIN + 1));
  const laastNr = (S, kode) => (S.laste && Number.isInteger(S.laste[kode]) ? S.laste[kode] : null);

  // A card for this phone. The number is locked to the code at once: the card is shown right away.
  function nyGjest(S, o) {
    const gammel = S.gjest && S.gjest.kode === o.kode ? S.gjest : null;
    const nr = laastNr(S, o.kode) != null ? laastNr(S, o.kode) : gammel ? gammel.nr : nyttNr();
    S.laste = S.laste || {};
    S.laste[o.kode] = nr;
    const keys = Object.keys(S.laste);
    if (keys.length > 30) delete S.laste[keys[0]];
    return {
      kode: o.kode,
      modus: o.modus,
      tema: o.tema,
      fro: o.fro,
      nr,
      merket: gammel && gammel.nr === nr ? gammel.merket : o.modus === "tall" ? [12] : [],
      feiret: gammel && gammel.nr === nr ? gammel.feiret : 0,
    };
  }

  // ---------- Small building blocks ----------

  function ballHtml(x, klasse) {
    const b = bokstav(x);
    return `<span class="bb-ball b-${b} ${klasse || ""}" aria-hidden="true"><span class="bb-ball-indre"><small>${b}</small><b>${x}</b></span></span>`;
  }

  function piller(liste) {
    return `<div class="bb-piller">${liste.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("")}</div>`;
  }

  const typeTekst = (o) => (o.modus === "tall" ? "🎱 Tallbingo" : `${tema(o.tema).ikon} ${tema(o.tema).navn}`);

  const trukketListe = (sp) => sp.rekke.slice(0, sp.trukket);

  function tavla(sp, o = {}) {
    const sett = new Set(trukketListe(sp));
    const siste = sp.trukket ? sp.rekke[sp.trukket - 1] : null;
    return `<div class="bb-tavla" role="img" aria-label="${sp.trukket} av ${BALLER} baller er trukket">${BOKSTAVER.map(
      (b, k) =>
        `<span class="bb-tavla-b b-${b}">${b}</span>${range(15)
          .map((i) => {
            const x = k * 15 + i + 1;
            return `<span class="bb-t${sett.has(x) ? " pa" : ""}${x === siste && !o.utenSiste ? " ny" : ""}">${x}</span>`;
          })
          .join("")}`,
    ).join("")}</div>`;
  }

  // One card as a grid. o: { celler | oyeblikk, merket: Set, linjer, knapper, sjekk (host view) }
  function brettHtml(g, o = {}) {
    const merket = o.merket || new Set(g.merket);
    const n = g.modus === "tall" ? 5 : 4;
    const iLinje = new Set((o.linjer || hele(merket, n)).flat());
    if (g.modus === "tall") {
      const celler = o.celler || tallbrett(g.fro, g.nr);
      const rader = celler
        .map((x, i) => {
          const pa = merket.has(i);
          const klasse = `bb-rute${pa ? " merket" : ""}${iLinje.has(i) ? " linje" : ""}${o.sist === i ? " ny" : ""}`;
          if (x === 0) return `<span class="${klasse} fri" aria-label="Fri rute">★</span>`;
          if (!o.knapper) return `<span class="${klasse}" aria-label="${bokstav(x)} ${x}${pa ? ", trukket" : ""}">${x}</span>`;
          return `<button class="${klasse}" data-h="merk" data-v="${i}" aria-pressed="${pa}" aria-label="${bokstav(x)} ${x}">${x}</button>`;
        })
        .join("");
      return `<div class="bb-brett fem${o.liten ? " liten" : ""}" role="group" aria-label="Bingobrett ${g.nr}">${BOKSTAVER.map((b) => `<span class="bb-hode b-${b}" aria-hidden="true">${b}</span>`).join("")}${rader}</div>`;
    }
    const T = tema(g.tema);
    const celler = festbrett(g.fro, g.tema, g.nr);
    const ruter = celler
      .map((m, i) => {
        const [ikon, tekst] = T.oyeblikk[m];
        const pa = merket.has(i);
        const klasse = `bb-rute fest${pa ? " merket" : ""}${iLinje.has(i) ? " linje" : ""}${o.sist === i ? " ny" : ""}`;
        return `<button class="${klasse}" data-h="merk" data-v="${i}" aria-pressed="${pa}"><span class="bb-ikon" aria-hidden="true">${esc(ikon)}</span><span class="bb-tekst">${esc(tekst)}</span></button>`;
      })
      .join("");
    return `<div class="bb-brett fire" role="group" aria-label="Festbingo: ${esc(T.navn)}, brett ${g.nr}">${ruter}</div>`;
  }

  const gjestLinjer = (g) => hele(new Set(g.merket), g.modus === "tall" ? 5 : 4);

  // ---------- The draw (host, number bingo) ----------

  let autoTimer = null;
  const stoppAuto = () => {
    clearTimeout(autoTimer);
    autoTimer = null;
  };

  function planleggAuto(S) {
    stoppAuto();
    const sp = S.spill;
    if (!sp || !sp.auto || S.skjerm !== "trekk" || sp.trukket >= BALLER) return;
    const fortsatt = R.vakt();
    const bar = R.$(".bb-auto-bar i");
    if (bar && !R.rolig()) {
      bar.style.transition = "none";
      bar.style.transform = "scaleX(0)";
      void bar.offsetWidth;
      bar.style.transition = `transform ${AUTO_SEK}s linear`;
      bar.style.transform = "scaleX(1)";
    }
    autoTimer = setTimeout(() => {
      autoTimer = null;
      if (fortsatt() && S.spill === sp && sp.auto) trekkBall(S);
    }, AUTO_SEK * 1000);
  }

  function rulleLyd() {
    const L = R.lyd;
    [0, 0.07, 0.15, 0.24, 0.34].forEach((t, i) => L.stoy(t, 0.06, 0.08 + i * 0.02, 900 + i * 200));
    L.tone(523.25, 0.42, 0.12, "triangle", 0.12);
    L.tone(1046.5, 0.5, 0.35, "sine", 0.14);
  }

  // ---------- Reading the numbers aloud ----------
  // With the phone's own Norwegian voice, so the host doesn't have to shout. Only voices on the
  // phone itself: an online voice would send the numbers away. Follows the sound switch at the top.
  let stemme = null;
  function finnStemme() {
    try {
      const stemmer = window.speechSynthesis ? speechSynthesis.getVoices() || [] : [];
      stemme = stemmer.find((v) => /^(nb|no|nn)([-_]|$)/i.test(v.lang) && v.localService) || null;
    } catch (e) {
      stemme = null;
    }
  }
  try {
    if (window.speechSynthesis) {
      finnStemme();
      const nyeStemmer = () => {
        const hadde = !!stemme;
        finnStemme();
        if (!hadde && stemme && R.S && R.S.skjerm === "trekk") R.vis();
      };
      if (speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", nyeStemmer);
      else speechSynthesis.onvoiceschanged = nyeStemmer;
    }
  } catch (e) {
    stemme = null;
  }
  const stille = () => {
    try {
      if (window.speechSynthesis) speechSynthesis.cancel();
    } catch (e) {
      /* ignore */
    }
  };
  function lesOpp(S, x) {
    if (!stemme || !R.felles.lyd || !S.oppsett.les) return;
    try {
      stille();
      const u = new SpeechSynthesisUtterance(`${bokstav(x)}, ${x}`);
      u.voice = stemme;
      u.lang = stemme.lang;
      u.rate = 0.9;
      const fortsatt = R.vakt();
      setTimeout(() => fortsatt() && speechSynthesis.speak(u), R.rolig() ? 100 : 650); // after the roll
    } catch (e) {
      /* no voice after all: the screen still shows the ball */
    }
  }

  function trekkBall(S) {
    const sp = S.spill;
    if (!sp || sp.trukket >= BALLER) return;
    sp.trukket += 1;
    sp.nyBall = true;
    if (sp.trukket >= BALLER) sp.auto = false;
    const x = sp.rekke[sp.trukket - 1];
    R.vis();
    sp.nyBall = false;
    rulleLyd();
    R.vibrer(20);
    R.si(`${bokstav(x)} ${x}`);
    lesOpp(S, x);
    if (sp.trukket === 1) R.statistikk("start", { modus: "tall", auto: !!sp.auto });
    planleggAuto(S);
  }
  // A quick double tap must not draw two balls (the first would only flash by).
  let sisteTrekk = -1e9;

  // ---------- The app ----------

  const SPILLSKJERMER = ["kode", "trekk", "sjekk", "slutt"];
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  const DEF = {
    id: "bingoballen",
    versjon: 1,
    pagar: (S) => pagar(S) || !!S.gjest,

    tilstand: () => ({
      oppsett: { modus: "tall", tema: "julebord", auto: false, les: true },
      spill: null,
      // Card numbers this phone has been given, per code: the same card every time.
      laste: {},
      gjest: null,
      kodeUtkast: "",
      kodeFeil: "",
      sjekkUtkast: "",
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "tall", tema: "julebord", auto: false, les: true }, S.oppsett));
      if (!["tall", "fest"].includes(o.modus)) o.modus = "tall";
      if (!TEMAER.some((t) => t.id === o.tema)) o.tema = TEMAER[0].id;
      o.auto = !!o.auto;
      o.les = o.les !== false;
      const laste = {};
      if (S.laste && typeof S.laste === "object") {
        for (const [k, v] of Object.entries(S.laste).slice(-30)) if (/^[0-9A-Z]{8}$/.test(k) && Number.isInteger(v) && v >= NR_MIN && v <= NR_MAKS) laste[k] = v;
      }
      S.laste = laste;
      const sp = S.spill;
      const okRekke = (r) => Array.isArray(r) && r.length === BALLER && new Set(r).size === BALLER && r.every((x) => Number.isInteger(x) && x >= 1 && x <= BALLER);
      if (sp && (sp.versjon !== 2 || !lesKode(sp.kode) || (sp.modus === "tall" && (!okRekke(sp.rekke) || !(sp.trukket >= 0 && sp.trukket <= BALLER) || !Array.isArray(sp.vinnere))))) S.spill = null;
      if (S.spill) {
        S.spill.auto = false; // after a reload the draw waits for a tap
        S.spill.nyBall = false;
        if (!MAAL[S.spill.maal]) S.spill.maal = "rekke";
      }
      const g = S.gjest;
      if (g && (!lesKode(g.kode) || laastNr(S, g.kode) !== g.nr || !Array.isArray(g.merket))) S.gjest = null;
      if (S.gjest) S.gjest.merket = S.gjest.merket.filter((i) => Number.isInteger(i) && i >= 0 && i < (S.gjest.modus === "tall" ? 25 : 16));
      if (!S.spill && SPILLSKJERMER.includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.spill.modus === "fest" && ["trekk", "sjekk", "slutt"].includes(S.skjerm)) S.skjerm = "kode";
      if (!S.gjest && ["brett", "bingo"].includes(S.skjerm)) S.skjerm = "hjem";
      S.sjekkUtkast = "";
    },

    regler: {
      intro: "Bingo der alle har brettet på sin egen mobil. Velg tallbingo med 75 baller, eller festbingo med øyeblikk som skjer på festen.",
      steg: [
        ["Del koden", "Den som starter, viser QR-koden. Alle skanner den og får et eget brett med et fast nummer."],
        ["Merk det som skjer", "Tallbingo: verten trekker baller, og du trykker på tallene du har. Festbingo: trykk på øyeblikkene når de skjer."],
        ["Rop BINGO!", "Første hele rekke vinner – vannrett, loddrett eller på skrå. I tallbingo sjekker verten brettet ditt med brettnummeret."],
      ],
      tips: [
        "I tallbingo kan dere spille videre om to rekker og fullt brett etter første bingo.",
        "Brettet låses til mobilen. Går du ut og inn igjen med samme kode, får du det samme brettet.",
        "Midtruta i tallbingo er fri – den teller alltid som merket.",
        "Festbingo passer til julebord, julaften, bryllup, 17. mai, hyttetur, bursdag og konfirmasjon.",
        "Verten kan slå på automatisk trekning og spille selv med «Mitt brett».",
      ],
    },

    // Join links: …/bingoballen/#CODE
    vedHash(S, hash) {
      const o = lesKode(hash);
      if (!o) {
        S.kodeUtkast = R.kode.formater(R.kode.normaliser(hash).slice(0, KODELENGDE));
        S.kodeFeil = "Lenken inneholder ingen gyldig kode. " + kodeFeil(hash);
        return "bli-med";
      }
      S.gjest = nyGjest(S, o);
      S.kodeFeil = "";
      S.kodeUtkast = "";
      return "brett";
    },

    felt: {
      kode(S, el) {
        S.kodeUtkast = el.value;
      },
      sjekknr(S, el) {
        const ren = el.value.replace(/\D/g, "").slice(0, 6);
        if (ren !== el.value) el.value = ren;
        S.sjekkUtkast = ren;
      },
    },

    skjema: {
      kode(S, form) {
        const felt = form.querySelector("#kodefelt");
        const o = lesKode(felt.value);
        if (!o) {
          S.kodeUtkast = felt.value;
          S.kodeFeil = kodeFeil(felt.value);
          R.vis();
          const nytt = R.$("#kodefelt");
          if (nytt) {
            nytt.classList.add("risting");
            nytt.focus();
          }
          R.lyd.feil();
          R.vibrer(120);
          return;
        }
        S.kodeUtkast = "";
        S.kodeFeil = "";
        S.gjest = nyGjest(S, o);
        R.lyd.riktig();
        R.gaTil("brett");
      },
      sjekk(S, form) {
        const felt = form.querySelector("#bb-sjekknr");
        const nr = Number(String(felt.value).replace(/\D/g, ""));
        const sp = S.spill;
        if (!(nr >= NR_MIN && nr <= NR_MAKS)) {
          sp.sjekk = null;
          S.sjekkUtkast = felt.value;
          R.vis();
          const f = R.$("#bb-sjekknr");
          if (f) {
            f.classList.add("risting");
            f.focus();
          }
          const feil = R.$("#bb-sjekkfeil");
          if (feil) feil.textContent = "Brettnummeret har seks sifre. Det står øverst på brettet.";
          R.lyd.feil();
          return;
        }
        const res = sjekkBrett(sp.fro, nr, trukketListe(sp));
        sp.sjekk = { nr, ok: oppfyller(res, sp.maal), godkjent: false };
        S.sjekkUtkast = "";
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        R.vis();
        if (sp.sjekk.ok) {
          R.lyd.fanfare();
          R.vibrer([60, 30, 120]);
          R.konfetti();
        } else {
          R.lyd.feil();
          R.vibrer(120);
        }
      },
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Alle har brettet på mobilen.<br><em>Første hele rekke vinner!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: S.spill && S.spill.modus === "tall" ? `Fortsett · ${S.spill.trukket} av ${BALLER} baller` : "Fortsett · vis koden",
                            ekstraHtml:
                (S.gjest ? R.ui.knapp2(`Til brettet ditt · nr. ${S.gjest.nr}`, "til-brett", { ikon: "🎟️" }) : "") +
                R.ui.knapp2("Bli med i et spill", "bli-med", { ikon: "📲" }) +
                R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["3–40", "spillere"],
              ["75", "baller"],
              [String(TEMAER.reduce((s, t) => s + t.oyeblikk.length, 0)), "festøyeblikk"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hva slags bingo?</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "tall", tittel: "Tallbingo", tekst: "75 baller – denne mobilen trekker", ikon: "🎱" },
                  { v: "fest", tittel: "Festbingo", tekst: "Merk det som skjer på festen", ikon: "🎉" },
                ],
                o.modus,
              )}
            </section>
            ${
              o.modus === "fest"
                ? `<section class="seksjon">
                    <h2>Hvor er festen?</h2>
                    ${R.ui.fliser(
                      "tema",
                      TEMAER.map((t) => ({ v: t.id, tittel: t.navn, tekst: t.tekst, ikon: t.ikon })),
                      o.tema,
                    )}
                  </section>`
                : `<section class="seksjon">
                    <h2>Trekningen</h2>
                    ${R.ui.seg(
                      "auto",
                      [
                        ["nei", "Jeg trykker selv"],
                        ["ja", `Automatisk (${AUTO_SEK} s)`],
                      ],
                      o.auto ? "ja" : "nei",
                      { etikett: "Trekningen" },
                    )}
                    <p class="hjelp">Med automatisk trekning kan du spille selv med et eget brett.</p>
                  </section>`
            }
            <p class="bb-info">📲 Alle får et eget brett på sin mobil – med QR-kode eller kode. Ingen app, ingen konto.</p>
            ${R.ui.dokk(R.ui.knapp("Start", "start"))}`;
        },
      },

      // Share the code; every phone that joins gets its own card.
      kode: {
        tittel: (S) => (S.spill.modus === "tall" ? "Tallbingo" : tema(S.spill.tema).navn),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const lenke = R.kode.lenke(sp.kode);
          const qr = /^https?:$/.test(location.protocol) ? R.kode.qr(lenke) : "";
          const tall = sp.modus === "tall";
          const startet = tall && sp.trukket > 0;
          return `
            ${piller([typeTekst(sp), tall ? "75 baller" : "4 × 4 øyeblikk"])}
            <h1 id="skjerm-tittel">Del brettene</h1>
            <div class="kodekort bb-kodekort">
              <span class="etikett">Skann for å få et brett</span>
              ${qr ? `<div class="qr">${qr}</div>` : ""}
              <span class="kode" id="bb-kode">${esc(R.kode.formater(sp.kode))}</span>
              <div class="knapprad">${R.ui.knapp2("Kopier lenke", "kopier", { variant: "liten" })}${R.ui.knapp2("Del lenke", "del", { variant: "liten" })}</div>
            </div>
            <ol class="steg bb-slik">
              <li><b>Skann QR-koden</b><span>Eller åpne Bingoballen, trykk «Bli med i et spill» og skriv koden.</span></li>
              <li><b>Hver mobil får sitt eget brett</b><span>${tall ? "Brettnummeret står øverst. Vis det til verten når du roper BINGO!" : "Trykk på øyeblikkene når de skjer. Første hele rekke vinner."}</span></li>
            </ol>
            ${R.ui.dokk(
              tall ? R.ui.knapp(startet ? "Tilbake til trekningen" : "Start trekningen", "til-trekk", { ikon: "🎱" }) : R.ui.knapp("Hent ditt eget brett", "eget-brett", { ikon: "🎟️" }),
              R.ui.lenkerad(tall ? R.ui.lenke("Mitt brett", "eget-brett") : "", R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
      },

      trekk: {
        tittel: "Tallbingo",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.trukket;
          const siste = n ? sp.rekke[n - 1] : null;
          const forrige = sp.rekke.slice(Math.max(0, n - 6), Math.max(0, n - 1)).reverse();
          const tomt = n >= BALLER;
          return `
            <h1 class="vh" id="skjerm-tittel">Tallbingo: ${n} av ${BALLER} baller</h1>
            <div class="bb-status">
              <span class="bb-maal">Spiller om <b>${MAAL[sp.maal].kort}</b></span>
              <span class="bb-teller"><b>${n}</b> / ${BALLER}</span>
            </div>
            <div class="bb-scene" aria-live="polite">
              ${siste ? ballHtml(siste, `stor${sp.nyBall ? " inn" : ""}`) : `<span class="bb-trommel" aria-hidden="true">🎱</span>`}
              <p class="vh">${siste ? `Siste ball: ${bokstav(siste)} ${siste}` : "Ingen baller er trukket ennå"}</p>
            </div>
            ${siste ? "" : '<p class="hjelp bb-forste">Trykk «Trekk ball» når alle har brettet sitt.</p>'}
            ${forrige.length ? `<div class="bb-forrige" aria-label="Forrige baller">${forrige.map((x) => ballHtml(x, "liten")).join("")}</div>` : ""}
            ${sp.auto ? `<div class="bb-auto-bar" aria-hidden="true"><i></i></div>` : ""}
            ${stemme ? R.ui.bryter("les", S.oppsett.les, "Les opp tallene", "Med mobilens norske stemme") : ""}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Tavla</h2><span class="tall">${BALLER - n} igjen</span></div>
              ${tavla(sp)}
            </section>
            ${R.ui.lenkerad(R.ui.lenke("Vis koden igjen", "vis-kode"), R.ui.lenke("Mitt brett", "eget-brett"))}
            ${R.ui.dokk(
              R.ui.knapp(tomt ? "Alle ballene er trukket" : "Trekk ball", "trekk", { av: tomt, ikon: "🎱" }),
              `<div class="knapprad">${R.ui.knapp2("Sjekk bingo", "til-sjekk")}${R.ui.knapp2(sp.auto ? "Pause" : "Auto", "auto-veksle", { ikon: sp.auto ? "⏸" : "▶" })}</div>`,
              R.ui.lenkerad(`<button class="lenke" data-h="angre"${n ? "" : " disabled"}>↶ Angre ball</button>`, R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn: (S) => planleggAuto(S),
        ut() {
          stoppAuto();
          stille();
        },
      },

      sjekk: {
        tittel: "Sjekk bingo",
        tilbake: "trekk",
        vis(S) {
          const sp = S.spill;
          const s = sp.sjekk;
          const maal = MAAL[sp.maal];
          let resultat = "";
          if (s) {
            const res = sjekkBrett(sp.fro, s.nr, trukketListe(sp));
            const mangler = s.ok ? 0 : manglerTil(res, sp.maal);
            resultat = `
              <div class="bb-svar ${s.ok ? "ok" : "nei"}" role="status">
                <div class="stempel-sted">${s.ok ? `<span class="stempel ${s.godkjent ? "mynte" : "lampe"}">${s.godkjent ? "Vinner!" : "Bingo!"}</span>` : '<span class="stempel">Ikke ennå</span>'}</div>
                <p class="bb-svar-tekst">${
                  s.ok
                    ? `Brett ${s.nr} har ${esc(maal.kort)}${res.linjer.length > 1 && sp.maal === "rekke" ? ` – faktisk ${res.linjer.length} rekker` : ""}.`
                    : `Brett ${s.nr} mangler ${R.flertall(mangler, "tall", "tall")} for å få ${esc(maal.kort)}.`
                }</p>
              </div>
              <div class="bb-kort-ramme"><p class="etikett">Brett ${s.nr}</p>${brettHtml({ modus: "tall", fro: sp.fro, nr: s.nr }, { celler: res.celler, merket: res.merket, linjer: res.linjer, liten: true })}</div>`;
          }
          const dokk = !s
            ? R.ui.dokk(R.ui.lenkerad(R.ui.lenke("Tilbake til trekningen", "til-trekk")))
            : !s.ok
              ? R.ui.dokk(R.ui.knapp("Spill videre", "til-trekk"), R.ui.lenkerad(R.ui.lenke("Sjekk et annet brett", "ny-sjekk")))
              : !s.godkjent
                ? R.ui.dokk(R.ui.knapp(`Godkjenn brett ${s.nr}`, "godkjenn", { variant: "mynte", ikon: "🏆" }), R.ui.lenkerad(R.ui.lenke("Ikke godkjenn", "ny-sjekk")))
                : R.ui.dokk(
                    NESTE_MAAL[sp.maal] && sp.trukket < BALLER ? R.ui.knapp(`Spill videre om ${MAAL[NESTE_MAAL[sp.maal]].kort}`, "neste-maal") : R.ui.knapp("Se kåringen", "til-slutt", { ikon: "🏆" }),
                    R.ui.lenkerad(R.ui.lenke("Flere med bingo? Sjekk et brett til", "ny-sjekk"), R.ui.lenke("Angre", "angre-godkjenn"), NESTE_MAAL[sp.maal] ? R.ui.lenke("Avslutt", "avslutt") : ""),
                  );
          return `
            <h1 id="skjerm-tittel" class="bb-sjekk-tittel">${!s ? "Hvem har bingo?" : !s.ok ? "Ikke bingo ennå" : s.godkjent ? `Brett ${s.nr} vinner!` : `Brett ${s.nr} har bingo!`}</h1>
            ${
              s
                ? ""
                : `<p class="ingress">Skriv nummeret som står øverst på brettet. Dere spiller om <b>${esc(maal.kort)}</b>.</p>
                   <form class="bb-sjekkskjema" data-skjema="sjekk" autocomplete="off" novalidate>
                     <label class="vh" for="bb-sjekknr">Brettnummer</label>
                     <input class="kodefelt" id="bb-sjekknr" data-felt="sjekknr" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="123456" value="${esc(S.sjekkUtkast || "")}">
                     <p class="feil" id="bb-sjekkfeil" role="alert"></p>
                     <button class="knapp" type="submit"><span class="ikon" aria-hidden="true">🔍</span>Sjekk brettet</button>
                   </form>`
            }
            ${resultat}
            ${dokk}`;
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.vinnere;
          const sisteMaal = v.length ? v[v.length - 1].maal : null;
          const toppen = v.filter((x) => x.maal === sisteMaal).map((x) => x.nr);
          const rader = ["rekke", "to", "full"]
            .filter((m) => v.some((x) => x.maal === m))
            .map(
              (m) => `<li><span class="bb-premie">${esc(MAAL[m].navn)}</span><span class="bb-vinner">${esc(R.ramsOpp(v.filter((x) => x.maal === m).map((x) => `Brett ${x.nr}`)))}</span><small>ball ${v.find((x) => x.maal === m).ball}</small></li>`,
            )
            .join("");
          return `
            <div class="banner ${v.length ? "aksent" : ""}">
              ${R.figur()}
              <p class="etikett">Tallbingo · ${R.flertall(sp.trukket, "ball", "baller")}</p>
              <h1 id="skjerm-tittel">${v.length ? `${esc(toppen.length > 1 ? "Brett " + R.ramsOpp(toppen.map(String)) : "Brett " + toppen[0])} vinner!` : "Ingen bingo denne gangen"}</h1>
            </div>
            ${rader ? `<ul class="bb-premier">${rader}</ul>` : '<p class="ingress midt">Kanskje neste gang? Det er lov å prøve igjen.</p>'}
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Tavla</h2><span class="tall">${R.flertall(sp.trukket, "ball", "baller")}</span></div>
              ${tavla(sp, { utenSiste: true })}
            </section>
            ${R.ui.flereSpill()}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.ferdig) return;
          sp.ferdig = true;
          R.lagre();
          R.slippVaken();
          R.statistikk("ferdig", { modus: "tall", baller: sp.trukket, vinnere: sp.vinnere.length });
          if (sp.vinnere.length) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
          visTipsSnart();
        },
      },

      // ----- Players -----

      "bli-med": {
        tittel: "Bli med",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Bli med i et spill</h1>
          <p class="ingress">Skann QR-koden med kameraet – eller skriv koden fra mobilen til den som startet.</p>
          <form class="seksjon bb-kodeskjema" data-skjema="kode" autocomplete="off" novalidate>
            <label class="vh" for="kodefelt">Spillkode</label>
            <input class="kodefelt" id="kodefelt" data-felt="kode" name="kode" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="20" placeholder="ABCD EFGH" value="${esc(S.kodeUtkast || "")}">
            <p class="feil" id="kodefeil" role="alert">${esc(S.kodeFeil || "")}</p>
            ${R.ui.dokk('<button class="knapp" type="submit">Hent brettet mitt</button>')}
          </form>`,
        ut(S) {
          S.kodeFeil = "";
          S.kodeUtkast = "";
        },
      },

      brett: {
        tittel: (S) => (S.gjest.modus === "tall" ? "Tallbingo" : tema(S.gjest.tema).navn),
        tilbake: "hjem",
        vis(S) {
          const g = S.gjest;
          const linjer = gjestLinjer(g);
          const vert = S.spill && S.spill.kode === g.kode;
          return `
            <div class="bb-topp">
              <h1 id="skjerm-tittel" class="bb-nr"><small>Brett</small> ${g.nr}</h1>
              <span class="bb-type">${esc(typeTekst(g))}</span>
            </div>
            ${brettHtml(g, { knapper: true, sist: sistMerket })}
            <p class="hjelp bb-brett-hjelp">${
              g.modus === "tall"
                ? linjer.length
                  ? "Hel rekke! Rop BINGO og vis brettnummeret til verten."
                  : "Trykk på tallene du har når de blir ropt opp."
                : linjer.length
                  ? "Hel rekke! Rop BINGO så alle hører det."
                  : "Trykk på et øyeblikk når det skjer. Hel rekke vinner."
            }</p>
            ${R.ui.lenkerad(vert ? R.ui.lenke(g.modus === "tall" ? "Til trekningen" : "Vis koden", g.modus === "tall" ? "til-trekk" : "vis-kode") : "", R.ui.lenke("Forlat spillet", "forlat"))}
            ${R.ui.dokk(R.ui.knapp("BINGO!", "bingo", { av: !linjer.length, variant: "rosa", id: "bb-bingo" }))}`;
        },
        etter() {
          sistMerket = null;
        },
      },

      // Festbingo: the full row, big, to show the others.
      bingo: {
        tittel: "Kåringen",
        tilbake: "brett",
        vis(S) {
          const g = S.gjest;
          const T = tema(g.tema);
          const celler = festbrett(g.fro, g.tema, g.nr);
          const merket = new Set(g.merket);
          const linjer = hele(merket, 4);
          const full = merket.size === 16;
          const vis = full ? range(16) : (linjer[0] || []);
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${esc(T.navn)} · brett ${g.nr}</p>
              <h1 id="skjerm-tittel">${full ? "Fullt brett!" : "Bingo!"}</h1>
              <p class="ingress">${full ? "Alt skjedde. For en fest!" : "Du har en hel rekke. Vis de andre hva som skjedde:"}</p>
            </div>
            <ul class="bb-bevis">${vis
              .map((i) => {
                const [ikon, tekst] = T.oyeblikk[celler[i]];
                return `<li><span aria-hidden="true">${esc(ikon)}</span>${esc(tekst)}</li>`;
              })
              .join("")}</ul>
            ${R.ui.flereSpill()}
            ${R.ui.dokk(
              full ? R.ui.knapp("Spill igjen", "nytt") : R.ui.knapp("Spill videre mot fullt brett", "til-brett"),
              R.ui.lenkerad(full ? R.ui.lenke("Til brettet", "til-brett") : "", '<a class="lenke" href="/">Alle spill</a>'),
            )}`;
        },
        inn(S) {
          // Celebrate a new bingo once (not again after a reload).
          const g = S.gjest;
          const jubel = g.merket.length === 16 ? "full" : "rekke";
          if (g.jubel === jubel) return;
          g.jubel = jubel;
          R.lagre();
          R.lyd.fanfare();
          R.vibrer([60, 30, 120]);
          R.konfetti();
          R.statistikk("ferdig", { modus: "fest", tema: g.tema, full: jubel === "full" });
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        stoppAuto();
        S.spill = null;
        R.slippVaken();
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.gaTil(sp.modus === "fest" ? "kode" : SPILLSKJERMER.includes(sp.skjerm) && sp.skjerm !== "slutt" ? sp.skjerm : sp.trukket ? "trekk" : "kode");
      },
      "til-brett": (el, e, S) => (S.gjest ? R.gaTil("brett") : null),
      "bli-med"(el, e, S) {
        S.kodeFeil = "";
        R.gaTil("bli-med");
        const felt = R.$("#kodefelt");
        if (felt) felt.focus();
      },

      // Setup
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "fest" ? "fest" : "tall";
        R.vis();
      },
      tema(el, e, S) {
        S.oppsett.tema = tema(el.dataset.v).id;
        R.vis();
      },
      auto(el, e, S) {
        S.oppsett.auto = el.dataset.v === "ja";
        R.vis();
      },
      start(el, e, S) {
        stoppAuto();
        const o = S.oppsett;
        const sp = {
          versjon: 2,
          modus: o.modus,
          tema: o.tema,
          fro: R.nyttFro() % 2 ** 24,
          rekke: R.stokk(
            range(BALLER).map((i) => i + 1),
            R.rng(R.nyttFro()),
          ),
          trukket: 0,
          maal: "rekke",
          vinnere: [],
          sjekk: null,
          auto: o.modus === "tall" && o.auto,
          ferdig: false,
          skjerm: null,
        };
        sp.kode = lagKode(sp);
        S.spill = sp;
        if (o.modus === "fest") R.statistikk("start", { modus: "fest", tema: o.tema });
        R.gaTil("kode");
      },
      igjen: (el, e, S) => H.start(el, e, S),

      // Host
      kopier: (el, e, S) => R.kopier(R.kode.lenke(S.spill.kode)),
      del: (el, e, S) =>
        R.del("Bingoballen", `Bli med på bingo! Trykk på lenken for å få ditt eget brett – eller skriv koden ${R.kode.formater(S.spill.kode)}.`, R.kode.lenke(S.spill.kode)),
      "vis-kode": () => R.gaTil("kode"),
      "til-trekk": (el, e, S) => (S.spill && S.spill.modus === "tall" ? R.gaTil("trekk") : null),
      "eget-brett"(el, e, S) {
        const sp = S.spill;
        S.gjest = nyGjest(S, { kode: sp.kode, modus: sp.modus, tema: sp.tema, fro: sp.fro });
        R.gaTil("brett");
      },
      trekk(el, e, S) {
        if (performance.now() - sisteTrekk < 800) return;
        sisteTrekk = performance.now();
        trekkBall(S);
      },
      les(el, e, S) {
        S.oppsett.les = !S.oppsett.les;
        R.vis();
        if (!S.oppsett.les) stille();
      },
      angre(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.trukket) return;
        const x = sp.rekke[sp.trukket - 1];
        sp.trukket -= 1;
        R.vis();
        R.toast(`${bokstav(x)} ${x} er lagt tilbake`);
        planleggAuto(S);
      },
      "auto-veksle"(el, e, S) {
        const sp = S.spill;
        sp.auto = !sp.auto && sp.trukket < BALLER;
        S.oppsett.auto = sp.auto;
        R.vis();
        if (sp.auto) planleggAuto(S);
        else stoppAuto();
      },
      "til-sjekk"(el, e, S) {
        stoppAuto();
        S.spill.sjekk = null;
        S.sjekkUtkast = "";
        R.gaTil("sjekk");
        const felt = R.$("#bb-sjekknr");
        if (felt) felt.focus();
      },
      "ny-sjekk"(el, e, S) {
        S.spill.sjekk = null;
        R.vis();
        window.scrollTo(0, 0);
        const felt = R.$("#bb-sjekknr");
        if (felt) felt.focus();
      },
      godkjenn(el, e, S) {
        const sp = S.spill;
        const s = sp.sjekk;
        if (!s || !s.ok || s.godkjent) return;
        s.godkjent = true;
        if (!sp.vinnere.some((v) => v.nr === s.nr && v.maal === sp.maal)) sp.vinnere.push({ nr: s.nr, maal: sp.maal, ball: sp.trukket });
        R.vis();
        R.lyd.riktig();
        R.konfetti(["--aksent", "--mynte", "--papir"]);
      },
      "angre-godkjenn"(el, e, S) {
        const sp = S.spill;
        const s = sp.sjekk;
        if (!s || !s.godkjent) return;
        s.godkjent = false;
        sp.vinnere = sp.vinnere.filter((v) => !(v.nr === s.nr && v.maal === sp.maal));
        R.vis();
        R.toast("Godkjenningen er angret");
      },
      "neste-maal"(el, e, S) {
        const sp = S.spill;
        const neste = NESTE_MAAL[sp.maal];
        if (!neste) return R.gaTil("slutt");
        sp.maal = neste;
        sp.sjekk = null;
        R.gaTil("trekk");
        R.toast(`Nå spiller dere om ${MAAL[neste].kort}`);
      },
      "til-slutt": (el, e, S) => R.gaTil("slutt"),
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const tall = S.spill.modus === "tall";
        const ja = await R.bekreft(
          tall ? "Avslutte bingoen?" : "Avslutte spillet?",
          tall ? "Dere går til kåringen med vinnerne så langt." : "Koden slutter å vises her. Brettene på mobilene virker fortsatt.",
          "Avslutt",
          "Spill videre",
        );
        if (!ja || !fortsatt()) return;
        stoppAuto();
        if (tall) R.gaTil("slutt");
        else {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },

      // Players
      merk(el, e, S) {
        const g = S.gjest;
        const i = Number(el.dataset.v);
        const maks = g.modus === "tall" ? 25 : 16;
        if (!(i >= 0 && i < maks) || (g.modus === "tall" && i === 12)) return;
        const for_ = gjestLinjer(g).length;
        const pa = !g.merket.includes(i);
        g.merket = pa ? [...g.merket, i] : g.merket.filter((x) => x !== i);
        sistMerket = pa ? i : null;
        const etter = gjestLinjer(g).length;
        R.vis();
        if (pa) R.lyd.pop();
        else R.lyd.takk();
        R.vibrer(pa ? 12 : 6);
        if (etter > for_ && etter > g.feiret) {
          g.feiret = etter;
          R.lagre();
          R.lyd.riktig();
          R.vibrer([40, 40, 80]);
          const knapp = R.$("#bb-bingo");
          if (knapp) knapp.classList.add("pop");
          R.si("Hel rekke! Rop BINGO!");
        }
        if (g.modus === "fest" && pa && g.merket.length === 16) R.gaTil("bingo");
      },
      bingo(el, e, S) {
        const g = S.gjest;
        if (!gjestLinjer(g).length) return;
        if (g.modus === "fest") return R.gaTil("bingo");
        R.lyd.fanfare();
        R.vibrer([60, 30, 120]);
        R.konfetti();
        R.ark(`
          <h2 id="ark-tittel" class="bb-rop">BINGO!</h2>
          <p class="ingress">Rop det høyt – og vis brettet ditt til verten.</p>
          <p class="bb-ark-nr"><small>Brettnummer</small><b>${g.nr}</b></p>
          <p class="hjelp">Verten skriver nummeret og sjekker tallene dine.</p>
          <button class="knapp" data-h="lukk-ark">Tilbake til brettet</button>`);
      },
      async forlat(el, e, S) {
        const fortsatt = R.vakt();
        if ((await R.bekreft("Forlate spillet?", "Brettet ditt er låst til denne mobilen. Blir du med igjen med samme kode, får du det samme brettet.", "Forlat", "Bli")) && fortsatt()) {
          S.gjest = null;
          R.slippVaken();
          R.gaTil("hjem");
        }
      },
    }),

    // The pure parts, for the unit tests (test/bingoballen.test.mjs).
    kjerne: { tallbrett, festbrett, hele, LINJER, sjekkBrett, oppfyller, lagKode, lesKode, nyttNr, KODELENGDE, TEMAER, BOKSTAVER },
  };

  // The cell that was just marked gets a little stamp animation (once).
  let sistMerket = null;

  // How many numbers a card lacks for the current goal (best line, best two lines, or the whole card).
  function manglerTil(res, maal) {
    if (maal === "full") return 25 - res.merket.size;
    const mangel = LINJER[5].map((l) => l.filter((i) => !res.merket.has(i)).length).sort((a, b) => a - b);
    return maal === "to" ? mangel[0] + mangel[1] : mangel[0];
  }

  // Remember which game screen was open, so «Fortsett» on the home screen returns to it.
  SPILLSKJERMER.forEach((navn) => {
    const sk = DEF.skjermer[navn];
    const inn = sk.inn;
    sk.inn = (S) => {
      if (S.spill) S.spill.skjerm = navn;
      if (inn) inn(S);
    };
  });

  R.start(DEF);
})();
