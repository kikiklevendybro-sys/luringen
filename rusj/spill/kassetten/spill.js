/* Kassetten — «Si det baklengs».
   Two players a turn, on one phone. The teller sees a secret word (or a short sentence) and says it
   into the microphone; the phone plays it backwards. The copier listens to the backwards sound as
   often as they like and copies it into the microphone. Then the phone plays the copy backwards:
   if the copy was good, the word comes back. The group judges: «Helt likt» 2, «Nesten» 1, «Bom» 0,
   to both. The roles move one seat on every turn.

   Privacy: the sound only ever lives in this page's memory (the variables below). It is never put
   in the saved state, never stored and never sent, and it is thrown away after every turn. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const DATA = window.RUSJ_DATA.kassett;
  // One list: words first, then sentences, so the deck remembers what this device has shown.
  const ALLE = DATA.ord.map((t) => ({ t, s: false })).concat(DATA.setninger.map((t) => ({ t, s: true })));
  const stokk = R.kortstokk("kassett", ALLE.length);

  const TYPER = ["ord", "setninger", "blandet"];
  const RUNDER = [1, 2, 3];
  const STD = { type: "blandet", runder: 1 };
  const MAKS_SEK = 6;
  const POENG = { likt: 2, nesten: 1, bom: 0 };

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const forteller = (sp) => (sp.start + sp.tur) % sp.antall;
  const hermer = (sp) => (forteller(sp) + 1) % sp.antall;
  const rundeNr = (sp) => Math.floor(sp.tur / sp.antall) + 1;
  const ordNa = (sp) => (ALLE[sp.na.q] || ALLE[0]).t;
  const tittel = (S) => (S.spill && S.spill.runder > 1 ? R.t("Runde {nr} av {alle}", { nr: rundeNr(S.spill), alle: S.spill.runder }) : R.app.navn);

  // ---------- The sound (memory only) ----------

  let ac = null;
  const lyd = { a: null, b: null }; // a: the teller's word, b: the copy (AudioBuffer, mono)
  let pagarOpptak = null; // { hvilken, stopp() }
  let spiller = null;
  let feil = ""; // "nektet" | "sperret" | "stille" | ""

  // Browsers inside apps (Facebook, Instagram …) often refuse the microphone.
  const iApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|TikTok|musical_ly|Snapchat|LinkedInApp|Line\//i.test(navigator.userAgent);
  const kanTaOpp = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);

  function kontekst() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state !== "running") ac.resume().catch(() => {});
    return ac;
  }
  // iPhone: say whether we record or only play, so playback is not quiet afterwards and the silent
  // switch does not mute it (Safari 16.4 and later; ignored elsewhere).
  function okt(type) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = type;
    } catch (e) {
      /* not supported */
    }
  }
  function glem() {
    stoppSpill();
    if (pagarOpptak) pagarOpptak.stopp(true);
    lyd.a = null;
    lyd.b = null;
  }
  function stoppSpill() {
    if (!spiller) return;
    try {
      spiller.stop();
    } catch (e) {
      /* already stopped */
    }
    spiller = null;
  }
  const toppI = (x, fra, n) => {
    let m = 0;
    for (let i = fra, til = Math.min(x.length, fra + n); i < til; i++) {
      const v = x[i] < 0 ? -x[i] : x[i];
      if (v > m) m = v;
    }
    return m;
  };
  // Cut the silence before and after the word, fade the ends and lift the level.
  function rens(x, sr) {
    const topp = toppI(x, 0, x.length);
    if (topp < 0.004) return null;
    const terskel = Math.max(0.012, topp * 0.06);
    const vindu = Math.round(sr * 0.02);
    let fra = -1;
    let til = -1;
    for (let i = 0; i + vindu <= x.length; i += vindu)
      if (toppI(x, i, vindu) > terskel) {
        fra = Math.max(0, i - Math.round(sr * 0.06));
        break;
      }
    for (let i = x.length - vindu; i >= 0; i -= vindu)
      if (toppI(x, i, vindu) > terskel) {
        til = Math.min(x.length, i + vindu + Math.round(sr * 0.1));
        break;
      }
    if (fra < 0 || til - fra < sr * 0.15) return null;
    const ut = x.slice(fra, til);
    const k = Math.min(8, 0.9 / topp);
    const fade = Math.round(sr * 0.012);
    for (let i = 0; i < ut.length; i++) ut[i] *= k * Math.min(1, i / fade, (ut.length - 1 - i) / fade);
    return ut;
  }
  function spillLyd(hvilken, baklengs, fart) {
    const b = lyd[hvilken];
    const c = kontekst();
    if (!b || !c || pagarOpptak) return;
    stoppSpill();
    okt("playback");
    let buf = b;
    if (baklengs) {
      buf = c.createBuffer(1, b.length, b.sampleRate);
      const inn = b.getChannelData(0);
      const ut = buf.getChannelData(0);
      for (let i = 0, n = inn.length; i < n; i++) ut[i] = inn[n - 1 - i];
    }
    const k = c.createBufferSource();
    k.buffer = buf;
    k.playbackRate.value = fart || 1;
    k.connect(c.destination);
    k.onended = () => {
      if (spiller === k) spiller = null;
    };
    try {
      k.start();
      spiller = k;
    } catch (e) {
      /* nothing to play */
    }
  }

  // Record into lyd[hvilken]; resolves true when a usable sound was caught. The microphone is only
  // asked for here, after a tap, and released as soon as the recording stops.
  async function taOpp(hvilken, vedNiva, vedStart) {
    stoppSpill();
    const c = kontekst();
    if (!c || !kanTaOpp()) {
      feil = "sperret";
      return false;
    }
    okt("play-and-record");
    let strom;
    try {
      // No echo or noise filters: they are made for calls and eat parts of the word.
      strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      okt("playback");
      feil = e && e.name === "NotAllowedError" ? "nektet" : "sperret";
      return false;
    }
    feil = "";
    // A paused sound engine would record nothing at all.
    if (c.state !== "running") await c.resume().catch(() => {});
    return new Promise((ferdig) => {
      const biter = [];
      let antall = 0;
      let slutt = false;
      const kilde = c.createMediaStreamSource(strom);
      const proc = c.createScriptProcessor(4096, 1, 1);
      const taus = c.createGain();
      taus.gain.value = 0;
      const stopp = (avbrutt) => {
        if (slutt) return;
        slutt = true;
        proc.onaudioprocess = null;
        try {
          kilde.disconnect();
          proc.disconnect();
          taus.disconnect();
        } catch (e) {
          /* already disconnected */
        }
        clearTimeout(vakt);
        strom.getTracks().forEach((t) => t.stop());
        okt("playback");
        pagarOpptak = null;
        if (avbrutt) return ferdig(false);
        const raa = new Float32Array(antall);
        let o = 0;
        for (const b of biter) {
          raa.set(b, o);
          o += b.length;
        }
        const ren = rens(raa, c.sampleRate);
        if (!ren) {
          feil = "stille";
          return ferdig(false);
        }
        const buf = c.createBuffer(1, ren.length, c.sampleRate);
        buf.getChannelData(0).set(ren);
        lyd[hvilken] = buf;
        ferdig(true);
      };
      proc.onaudioprocess = (ev) => {
        const inn = ev.inputBuffer.getChannelData(0);
        biter.push(new Float32Array(inn));
        antall += inn.length;
        if (vedNiva) vedNiva(toppI(inn, 0, inn.length));
        if (antall >= MAKS_SEK * c.sampleRate) stopp(false);
      };
      kilde.connect(proc);
      proc.connect(taus);
      taus.connect(c.destination);
      const vakt = setTimeout(() => stopp(false), (MAKS_SEK + 1) * 1000);
      pagarOpptak = { hvilken, stopp };
      if (vedStart) vedStart();
    });
  }

  // ---------- Pieces ----------

  function varsel() {
    if (feil === "nektet") return `<p class="ka-varsel" role="alert">${esc(R.t("Mikrofonen ble ikke tillatt. Trykk «Tillat» når mobilen spør, eller slå på mikrofonen for nettleseren i innstillingene."))}</p>`;
    if (feil === "sperret") return `<p class="ka-varsel" role="alert">${esc(iApp ? R.t("Mikrofonen virker ikke inne i denne appen. Åpne rusj.no i Safari eller Chrome.") : R.t("Denne nettleseren gir ikke tilgang til mikrofonen. Prøv Safari eller Chrome."))}</p>`;
    if (feil === "stille") return `<p class="ka-varsel" role="alert">${esc(R.t("Jeg hørte ingenting. Hold mobilen nær munnen og prøv igjen."))}</p>`;
    return "";
  }
  // The big record button with its level meter. Its text changes while it records.
  const opptakKnapp = (h, tekst) =>
    `<div class="ka-opptak">${R.ui.knapp(tekst, h, { variant: "rosa", ikon: "⏺", id: "ka-ta-opp", tekstHtml: `<span id="ka-knapptekst">${esc(tekst)}</span>` })}<div class="ka-maler" aria-hidden="true"><div id="ka-niva"></div></div></div>`;
  const kassett = (spoler) => `<div class="ka-kassett${spoler ? " spoler" : ""}" aria-hidden="true">${R.figur()}</div>`;

  const rader = (sp, pluss) => sp.poeng.map((poeng, i) => ({ i, poeng, pluss: pluss && pluss.i.includes(i) && pluss.p ? pluss.p : null }));
  function stilling(sp, pluss) {
    const alle = rader(sp, pluss);
    if (alle.length <= 8) return R.ui.poengliste(alle);
    const topp = alle.slice().sort((a, b) => b.poeng - a.poeng).slice(0, 5);
    return `${R.ui.poengliste(topp)}<p class="hjelp">${esc(R.t("Topp fem av {n}. Hele lista kommer på slutten.", { n: alle.length }))}</p>`;
  }
  function nyttOrd(sp) {
    const lov = (n) => (sp.type === "ord" ? !ALLE[n].s : sp.type === "setninger" ? ALLE[n].s : true) && n !== sp.na.q;
    let q = stokk.neste(lov);
    if (q < 0) q = 0;
    sp.na.q = q;
  }
  function nyTur(sp) {
    glem();
    sp.na = { q: -1, steg: "gi" };
    nyttOrd(sp);
  }
  function settNiva(v) {
    const el = document.getElementById("ka-niva");
    if (el) el.style.width = Math.min(100, v * 220) + "%";
  }

  // Record from the button: tap to start, tap again (or wait) to stop.
  async function opptak(S, hvilken, videre) {
    const sp = S.spill;
    if (!sp) return;
    if (pagarOpptak) return pagarOpptak.stopp(false);
    const knapp = document.getElementById("ka-ta-opp");
    const fortsatt = R.vakt();
    // The button flips to «Stopp» only once the microphone is really on.
    const ok = await taOpp(hvilken, settNiva, () => {
      if (!knapp) return;
      knapp.classList.add("ka-pa");
      const t = document.getElementById("ka-knapptekst");
      if (t) t.textContent = R.t("Stopp");
    });
    if (!fortsatt() || S.spill !== sp) return;
    if (!ok) return R.vis();
    videre(sp);
  }

  // ---------- The game ----------

  let H; // the actions, so one can call another
  // Leaving a recording screen ends the recording without keeping it.
  const avbryt = () => {
    stoppSpill();
    if (pagarOpptak) pagarOpptak.stopp(true);
  };

  R.start({
    id: "kassetten",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 3, 2, 20),
      oppsett: Object.assign({}, STD),
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({}, STD, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      if (!TYPER.includes(o.type)) o.type = STD.type;
      if (!RUNDER.includes(o.runder)) o.runder = STD.runder;
      S.antall = R.klamp(Number(S.antall) || 3, 2, 20);
      const sp = S.spill;
      const ok = sp && Number.isInteger(sp.antall) && sp.antall >= 2 && Array.isArray(sp.poeng) && sp.poeng.length === sp.antall && Array.isArray(sp.logg) && Number.isInteger(sp.tur) && sp.tur < sp.turer && sp.na && ALLE[sp.na.q] && TYPER.includes(sp.type);
      if (sp && !ok) S.spill = null;
      if (!S.spill && !["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
      // The recordings never survive a reload: an unjudged turn starts over with the same word.
      if (S.spill && !S.spill.ferdig && ["gi", "si", "herm", "fasit"].includes(S.skjerm)) {
        S.spill.na.steg = "gi";
        S.skjerm = "gi";
      }
    },

    regler: {
      intro: R.t("Én sier et hemmelig ord inn i mobilen. Mobilen spiller det baklengs – og neste spiller må herme etter lyden. Spilles hermingen baklengs, kommer ordet tilbake. Eller noe helt annet!"),
      steg: [
        [R.t("Si ordet"), R.t("Fortelleren ser ordet, trykker «Ta opp» og sier det tydelig. Mobilen spiller det baklengs.")],
        [R.t("Herm etter lyden"), R.t("Hermeren hører baklengs-lyden så mange ganger hen vil, og hermer den så likt som mulig.")],
        [R.t("Hør fasiten"), R.t("Mobilen spiller hermingen baklengs. Gjett hva det var – så vises ordet.")],
        [R.t("Gjengen dømmer"), R.t("Helt likt gir 2 poeng, nesten gir 1 poeng. Poengene går til begge. Flest poeng til slutt vinner.")],
      ],
      tips: [
        R.t("Hold mobilen nær munnen og si ordet langsomt og tydelig."),
        R.t("«Sakte» gjør baklengs-lyden lettere å herme."),
        R.t("Lyden blir på mobilen. Den sendes ingen steder og slettes etter hver tur."),
        R.t("Trykket dere feil? «Angre» tar poengene tilbake."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Si et ord, hør det baklengs – og herm så godt du kan."))}<br><em>${esc(R.t("Blir det ordet igjen?"))}</em>`,
            knapperHtml:
              (iApp ? `<p class="ka-varsel">${esc(R.t("Mikrofonen virker sjelden inne i apper. Åpne rusj.no i Safari eller Chrome for å spille."))}</p>` : "") +
              R.ui.startKnapper({
                pagar: pagar(S),
                fortsettTekst: pagar(S) ? R.t("Fortsett · {navn} sier ordet", { navn: R.navn(forteller(S.spill)) }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
            merker: [
              ["2–20", R.t("spillere")],
              [String(ALLE.length), R.t("ord og setninger")],
              ["🎙️", R.t("mikrofon")],
            ],
          }),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.spillere({ min: 2, max: 20, hjelp: R.t("To og to spiller sammen: én sier ordet, neste hermer.") })}
            <section class="seksjon">
              <h2>${esc(R.t("Hva skal dere si?"))}</h2>
              ${R.ui.seg("type", [["ord", R.t("Ord")], ["setninger", R.t("Setninger")], ["blandet", R.t("Blandet")]], o.type, { etikett: R.t("Hva skal dere si?") })}
            </section>
            <section class="seksjon"><h2>${esc(R.t("Runder"))}</h2>${R.ui.seg("runder", RUNDER.map((r) => [r, String(r)]), o.runder, { etikett: R.t("Antall runder") })}</section>
            <p class="hjelp ka-personvern">🎙️ ${esc(R.t("Spillet bruker mikrofonen. Lyden blir på mobilen og slettes etter hver tur."))}</p>
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { ikon: "📼" }))}`;
        },
      },

      // Hand the phone to the teller; the others must not see the word.
      gi: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `${R.ui.giTil({ i: forteller(sp), h: "se-ord", tekst: R.t("Gi mobilen til fortelleren"), prikker: [sp.antall, sp.tur % sp.antall] })}
            ${R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt"))}`;
        },
        inn(S) {
          S.spill.na.steg = "gi";
          glem();
        },
      },

      // The teller sees the word and records it.
      si: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const har = !!lyd.a;
          const tekst = ordNa(sp);
          return `
            <div class="ka-hvem">${R.avatar(forteller(sp), "mid")}<span><small>${esc(R.t("Fortelleren"))}</small><b>${esc(R.navn(forteller(sp)))}</b></span></div>
            <div class="ka-ordkort${tekst.length > 14 ? " lang" : ""}">
              <small>${esc(ALLE[sp.na.q].s ? R.t("Si setningen") : R.t("Si ordet"))}</small>
              <h1 id="skjerm-tittel">${esc(tekst)}</h1>
              <button type="button" class="lenke ka-bytt" data-h="bytt-ord">${esc(R.t("Bytt ord"))}</button>
            </div>
            ${varsel()}
            ${har
              ? `<div class="ka-spill">${kassett(true)}<p>${esc(R.t("Slik høres det ut baklengs:"))}</p>
                  ${R.ui.knapp(R.t("Spill baklengs igjen"), "hor-a", { variant: "lampe", ikon: "⏪" })}</div>
                 ${R.ui.dokk(R.ui.knapp(R.t("Gi mobilen til {navn}", { navn: R.navn(hermer(sp)) }), "til-hermer", { ikon: "👉" }), R.ui.lenkerad(R.ui.lenke(R.t("Ta opp på nytt"), "ta-a")))}`
              : `<p class="hjelp">${esc(R.t("Trykk, si det tydelig, og trykk igjen når du er ferdig."))}</p>
                 ${R.ui.dokk(opptakKnapp("ta-a", R.t("Ta opp")), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`}`;
        },
        inn(S) {
          S.spill.na.steg = "si";
        },
        ut: avbryt,
      },

      // The copier hears the backwards sound and copies it.
      herm: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          return `
            <div class="ka-hvem">${R.avatar(hermer(sp), "mid")}<span><small>${esc(R.t("Hermeren"))}</small><h1 id="skjerm-tittel">${esc(R.navn(hermer(sp)))}</h1></span></div>
            <div class="ka-spill">${kassett(true)}
              <p>${esc(R.t("Lytt til baklengs-lyden, og herm den så likt du kan."))}</p>
              <div class="ka-knapper">${R.ui.knapp(R.t("Hør igjen"), "hor-a", { variant: "lampe", ikon: "⏪" })}${R.ui.knapp(R.t("Sakte"), "hor-a-sakte", { variant: "papir", ikon: "🐢" })}</div>
            </div>
            ${varsel()}
            ${R.ui.dokk(opptakKnapp("ta-b", R.t("Ta opp hermingen")), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          S.spill.na.steg = "herm";
          if (!lyd.a) return R.gaTil("gi");
          setTimeout(() => spillLyd("a", true, 1), 250);
        },
        ut: avbryt,
      },

      // The copy backwards: the moment everyone waits for. Then the word is shown.
      fasit: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const vist = sp.na.vist;
          return `
            <div class="ka-spill ka-fasit">${kassett(!vist)}
              ${vist ? `<p class="etikett">${esc(R.t("Det var ordet!"))}</p>` : ""}
              <h1 id="skjerm-tittel">${esc(vist ? ordNa(sp) : R.t("Hva sa {navn}?", { navn: R.navn(hermer(sp)) }))}</h1>
              ${vist ? "" : `<p>${esc(R.t("Hør hermingen baklengs – og gjett!"))}</p>`}
              <div class="ka-knapper">${R.ui.knapp(R.t("Hør fasiten"), "hor-b", { variant: "lampe", ikon: "▶" })}${vist ? R.ui.knapp(R.t("Hør originalen"), "hor-a-rett", { variant: "papir", ikon: "🎙️" }) : ""}</div>
            </div>
            ${
              vist
                ? R.ui.dokk(
                    `<p class="ka-sporsmal">${esc(R.t("Hvor likt ble det?"))}</p><div class="ka-dom">${R.ui.knapp(R.t("Helt likt"), "dom", { v: "likt", variant: "mynte" })}${R.ui.knapp(R.t("Nesten"), "dom", { v: "nesten", variant: "lampe" })}${R.ui.knapp(R.t("Bom"), "dom", { v: "bom", variant: "rod" })}</div>`,
                    "",
                  )
                : R.ui.dokk(R.ui.knapp(R.t("Vis ordet"), "vis-ord", { ikon: "👀" }), R.ui.lenkerad(R.ui.lenke(R.t("Ta opp hermingen på nytt"), "herm-igjen")))
            }`;
        },
        inn(S) {
          S.spill.na.steg = "fasit";
          if (!lyd.b) return R.gaTil("gi");
          if (!S.spill.na.vist) setTimeout(() => spillLyd("b", true, 1), 300);
        },
      },

      // Points for the pair, the standings, and who goes next.
      poeng: {
        tittel,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const l = sp.logg[sp.logg.length - 1];
          const siste = sp.tur + 1 >= sp.turer;
          const par = R.ramsOpp([R.navn(l.a), R.navn(l.b)]);
          const tekst = l.p === 2 ? R.t("Helt likt! {par} får 2 poeng hver.", { par }) : l.p === 1 ? R.t("Nesten! {par} får 1 poeng hver.", { par }) : R.t("Bom! Ingen poeng denne gangen.");
          const neste = (sp.start + sp.tur + 1) % sp.antall;
          return `
            <div class="ka-resultat">${kassett(false)}<h1 id="skjerm-tittel">${esc(tekst)}</h1><p class="ka-var">«${esc(l.ord)}»</p></div>
            <div class="ka-stilling">${stilling(sp, { i: [l.a, l.b], p: l.p || null })}</div>
            ${R.ui.dokk(
              R.ui.knapp(siste ? R.t("Se hvem som vant") : R.t("Neste: {navn} sier ordet", { navn: R.navn(neste) }), "neste-tur", { ikon: siste ? "🏆" : "📼" }),
              R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre"), siste ? "" : R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.na.steg = "poeng";
          glem();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const maks = Math.max(...sp.poeng);
          const vinnere = maks > 0 ? sp.poeng.map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0) : [];
          const alle = rader(sp);
          let figur = R.figur();
          let etikett = R.t("Ingen vinner");
          let overskrift = R.t("Kassetten vant!");
          let ingress = R.t("Ingen ord kom tilbake. Baklengs er vanskelig!");
          if (vinnere.length === 1) {
            figur = `<span class="ka-vinner">${R.avatar(vinnere[0], "gigant")}<span class="ka-krone" aria-hidden="true">📼</span></span>`;
            etikett = R.t("Baklengsmester");
            overskrift = R.t("{navn} vinner!|{navn} vinner!", { navn: R.navn(vinnere[0]), n: 1 });
            ingress = R.t("{n} poeng!|{n} poeng!", { n: maks });
          } else if (vinnere.length > 1) {
            figur = `<span class="ka-delt">${vinnere.slice(0, 4).map((i) => R.avatar(i, "stor")).join("")}</span>`;
            etikett = R.t("Delt seier");
            overskrift = R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((i) => R.navn(i))), n: vinnere.length });
            ingress = R.t("{n} poeng!|{n} poeng!", { n: maks });
          }
          const likt = sp.logg.filter((l) => l.p === 2);
          return `
            <div class="banner aksent">
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(overskrift)}</h1>
              <p class="ingress">${esc(ingress)}</p>
            </div>
            ${maks > 0 ? R.ui.pall(alle) + R.ui.poengliste(alle) : ""}
            ${likt.length ? `<p class="ka-treff">${esc(R.t("Helt likt: {ord}", { ord: R.ramsOpp(likt.map((l) => `«${l.ord}»`)) }))}</p>` : ""}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          const forste = !sp.feiret;
          sp.ferdig = true;
          sp.feiret = true;
          glem();
          R.slippVaken();
          R.lagre();
          if (!forste) return;
          R.statistikk("ferdig", { spillere: sp.antall, turer: sp.logg.length, likt: sp.logg.filter((l) => l.p === 2).length });
          R.kveld.registrer(rader(sp).map((r) => ({ i: r.i, poeng: r.poeng })));
          if (sp.poeng.some((p) => p > 0)) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const iGang = pagar(S);
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang)) || !fortsatt()) return;
        if (iGang) {
          S.spill = null;
          glem();
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        R.holdVaken();
        R.gaTil(S.spill.na.steg === "poeng" ? "poeng" : "gi");
      },
      type(el, e, S) {
        S.oppsett.type = el.dataset.v;
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      async start(el, e, S) {
        const o = S.oppsett;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        const antall = R.klamp(S.antall, 2, 20);
        S.spill = { antall, type: o.type, runder: o.runder, start: R.heltall(0, antall - 1), tur: 0, turer: antall * o.runder, poeng: Array(antall).fill(0), logg: [], na: null, ferdig: false };
        nyTur(S.spill);
        R.statistikk("start", { spillere: antall, type: o.type, runder: o.runder });
        R.holdVaken();
        R.gaTil("gi");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
      "se-ord"(el, e, S) {
        if (!pagar(S)) return;
        feil = "";
        R.gaTil("si");
      },
      "bytt-ord"(el, e, S) {
        if (!pagar(S) || pagarOpptak) return;
        nyttOrd(S.spill);
        lyd.a = null;
        R.vis();
      },
      "ta-a"(el, e, S) {
        if (!pagar(S)) return;
        if (lyd.a && !pagarOpptak) {
          lyd.a = null;
          return R.vis();
        }
        opptak(S, "a", () => {
          R.vis();
          setTimeout(() => spillLyd("a", true, 1), 150);
        });
      },
      "til-hermer"(el, e, S) {
        if (!pagar(S) || !lyd.a) return;
        stoppSpill();
        R.gaTil("herm");
      },
      "hor-a": () => spillLyd("a", true, 1),
      "hor-a-sakte": () => spillLyd("a", true, 0.7),
      "hor-a-rett": () => spillLyd("a", false, 1),
      "hor-b": () => spillLyd("b", true, 1),
      "ta-b"(el, e, S) {
        if (!pagar(S) || !lyd.a) return;
        opptak(S, "b", (sp) => {
          sp.na.vist = false;
          R.gaTil("fasit");
        });
      },
      "herm-igjen"(el, e, S) {
        if (!pagar(S)) return;
        lyd.b = null;
        R.gaTil("herm");
      },
      "vis-ord"(el, e, S) {
        if (!pagar(S)) return;
        S.spill.na.vist = true;
        R.lyd.snu();
        R.vis();
      },
      dom(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !sp.na.vist || sp.na.steg !== "fasit") return;
        const p = POENG[el.dataset.v] || 0;
        const a = forteller(sp);
        const b = hermer(sp);
        sp.poeng[a] += p;
        sp.poeng[b] += p;
        sp.logg.push({ a, b, p, ord: ordNa(sp), tur: sp.tur });
        sp.logg = sp.logg.slice(-200);
        if (p === 2) {
          R.lyd.fanfare();
          R.vibrer([30, 40, 60]);
          R.konfetti();
        } else if (p === 1) R.lyd.pling();
        else R.lyd.snu();
        R.gaTil("poeng");
      },
      // A wrong verdict: the points go back and the verdict can be given again.
      angre(el, e, S) {
        const sp = S.spill;
        const l = sp && sp.logg[sp.logg.length - 1];
        if (!l || l.tur !== sp.tur || sp.na.steg !== "poeng") return;
        sp.logg.pop();
        sp.poeng[l.a] -= l.p;
        sp.poeng[l.b] -= l.p;
        // The sound is gone after the verdict, so the pair records the turn again.
        sp.na.vist = false;
        R.gaTil("gi");
      },
      "neste-tur"(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.na.steg !== "poeng") return;
        if (sp.tur + 1 >= sp.turer) {
          sp.ferdig = true;
          return R.gaTil("slutt");
        }
        sp.tur += 1;
        nyTur(sp);
        R.gaTil("gi");
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const harPoeng = sp.poeng.some((p) => p > 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), harPoeng ? R.t("Den med flest poeng så langt vinner.") : R.t("Ingen har fått poeng ennå."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        glem();
        if (!harPoeng) {
          S.spill = null;
          R.slippVaken();
          return R.gaTil("hjem");
        }
        sp.ferdig = true;
        R.gaTil("slutt");
      },
    }),
  });

  // A phone that is locked or switches app stops a recording and the sound.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    stoppSpill();
    if (pagarOpptak) pagarOpptak.stopp(true);
  });
})();
