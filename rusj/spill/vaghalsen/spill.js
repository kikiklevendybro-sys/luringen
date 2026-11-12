/* Våghalsen — «Sannhet eller konsekvens» (truth or dare).
   A bottle spins in the middle of a ring of players and stops on whoever is next (or the turn
   simply goes round). The player picks Sannhet (+1) or Konsekvens (+2) and gets a card, and can
   always pass («Står over», 0 points) — saying no is fine and is never pointed out.
   The bottle can be spun with the big button, a tap on the table, or a flick with a finger;
   the result is always drawn at random (with a nudge towards players who have had fewer turns).
   A game has a finish line (a number of turns each, first to 10 points, or none) and ends with
   «Kåringen». Dares with a duration get a clock; dares that last until the player's next turn stay
   on the table as «Gjelder nå» chips. */
(function () {
  "use strict";

  const R = window.Rusj;
  const D = window.RUSJ_DATA.kort;
  const esc = R.esc;

  const PAKKER = D.pakker;
  const STANDARD = ["familie", "venner"];
  const pakke = (id) => PAKKER.find((p) => p.id === id);
  // The season's pack («Jul») is listed first from 1 November to 6 January, otherwise last (as in the data).
  const iSesong = (() => {
    const d = new Date();
    const m = d.getMonth() + 1;
    return m >= 11 || (m === 1 && d.getDate() <= 6);
  })();
  const PAKKER_VIST = iSesong ? [...PAKKER.filter((p) => p.sesong), ...PAKKER.filter((p) => !p.sesong)] : PAKKER;

  const TYPER = {
    s: { navn: R.t("Sannhet"), ikon: "😇", poeng: 1, kort: "lilla" },
    k: { navn: R.t("Konsekvens"), ikon: "🔥", poeng: 2, kort: "aksent" },
  };

  // «… i 20 sekunder», «… på ti sekunder», «… i ett minutt»: how long the card's clock runs (0 = no clock).
  // The other editions' words too («for ten seconds», «i tyve sekunder»), so their cards get the clock.
  const TALLORD = { en: 1, ett: 1, et: 1, to: 2, tre: 3, fem: 5, ti: 10, femten: 15, tjue: 20, tretti: 30, førti: 40, femti: 50, seksti: 60 }; // sprak-ok
  Object.assign(TALLORD, { one: 1, two: 2, three: 3, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, tyve: 20, tredive: 30, fyrre: 40, halvtreds: 50, tres: 60 });
  function varighet(tekst) {
    const ord = tekst.toLocaleLowerCase("nb").split(/[^0-9a-zæøå]+/);
    for (let i = 1; i < ord.length; i++) {
      const enhet = /^(sekund(er)?|seconds?)$/.test(ord[i]) ? 1 : /^(minutt(er)?|minut(ter)?|minutes?)$/.test(ord[i]) ? 60 : 0;
      const n = enhet ? (/^\d+$/.test(ord[i - 1]) ? Number(ord[i - 1]) : TALLORD[ord[i - 1]]) : 0;
      if (n) return R.klamp(n * enhet, 5, 180);
    }
    return 0;
  }

  // A card in the data is its text, or { t, varer, ikon, alle } for a dare that lasts until the
  // player's next turn: `varer` is what the chip says after the name («snakker som en sjørøver»),
  // `alle` means it applies to the whole table (then nobody can «forget»).
  const ALLE = { s: [], k: [] };
  const somKort = (p, k) => {
    const kort = typeof k === "string" ? { t: k } : Object.assign({}, k);
    kort.p = p.id;
    kort.tid = varighet(kort.t);
    return kort;
  };
  PAKKER.forEach((p) => {
    p.sannhet.forEach((k) => ALLE.s.push(somKort(p, k)));
    p.konsekvens.forEach((k) => ALLE.k.push(somKort(p, k)));
  });
  const STOKK = { s: R.kortstokk("sannhet", ALLE.s.length), k: R.kortstokk("konsekvens", ALLE.k.length) };
  const ANTALL_KORT = ALLE.s.length + ALLE.k.length;

  let H; // the actions, so one can call another
  let laast = false; // a result stamp is showing; ignore taps until the next screen
  let animasjon = null; // the running bottle animation, if any

  // ---------- Small helpers ----------

  const norm = (a) => ((a % 360) + 360) % 360;
  // Seats around the table, clockwise from the top. With an odd number of players the ring is
  // turned half a seat, so someone always sits at the bottom (closest to the name below).
  const forskyv = (n) => (n % 2 ? 180 / n : 0);
  const vinkelFor = (i, n) => forskyv(n) + (i * 360) / n;
  const pekerPa = (a, n) => (((Math.round((norm(a) - forskyv(n)) / (360 / n)) % n) + n) % n);
  // Truth 1, dare 2 — minus one for each lasting dare the player forgot («Glemte seg!»).
  const poengFor = (st) => Math.max(0, st.s + st.k * 2 - (st.m || 0));
  const tom = () => ({ s: 0, k: 0, f: 0, m: 0, turer: 0 });
  const navneliste = (indekser) => R.ramsOpp(indekser.map((i) => R.navn(i))); // «A, B og C»
  // «én tur» / «3 turer»: `flere` is a key with {n} («{n} turer»), already looked up by the caller.
  const antallOrd = (n, en, flere) => (n === 1 ? en : flere);
  // A game is running until the crowning (then «Spill igjen» / «Endre oppsett» start a new one).
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  function standardAntall() {
    const lagret = R.felles.navn.filter((n) => String(n || "").trim()).length;
    return R.klamp(lagret || 4, 2, 20);
  }

  // ---------- The finish line ----------
  // «Hvor lenge?» on the set-up screen: a number of turns each (default), first to ten points, or
  // no end. Both goals are fair in both modes: the game only ends when everyone has had as many turns.

  const MAL = ["turer", "poeng", "fritt"];
  const MALPOENG = 10;
  // Turns each by the size of the group, so a game lasts 8–28 turns.
  const turerHver = (n) => (n <= 3 ? 4 : n <= 8 ? 3 : n <= 14 ? 2 : 1);
  const malFor = (type, n) => (type === "turer" ? { type, n: turerHver(n) } : type === "poeng" ? { type, n: MALPOENG } : null);
  const harNadd = (sp) => sp.stat.some((st) => poengFor(st) >= sp.mal.n);
  const flestTurer = (sp) => Math.max(...sp.stat.map((st) => st.turer));
  const totaltTurer = (sp) => sp.mal.n * sp.antall - (sp.hoppet || 0);

  // Who may still be picked by the bottle. With a goal: nobody gets more turns than the others.
  function kanFaTur(sp) {
    const m = sp.mal;
    if (!m) return sp.stat.map(() => true);
    if (m.type === "turer") return sp.stat.map((st) => st.turer < m.n);
    if (!harNadd(sp)) return sp.stat.map(() => true);
    const flest = flestTurer(sp);
    return sp.stat.map((st) => st.turer < flest);
  }

  // The last lap (the table says so): the last turns each, or someone has reached the points.
  function sisteRunde(sp) {
    const m = sp.mal;
    if (!m || sp.fase === "mal") return false;
    if (m.type === "poeng") return harNadd(sp);
    if (m.n < 2) return false;
    return sp.modus === "rekke" ? sp.runde >= m.n : sp.stat.every((st) => st.turer >= m.n - 1);
  }

  // How far player i has come towards the goal (0–1), drawn as a ring round the avatar.
  function framgang(sp, i) {
    const m = sp.mal;
    if (!m) return null;
    return R.klamp((m.type === "turer" ? sp.stat[i].turer : poengFor(sp.stat[i])) / m.n, 0, 1);
  }

  function toppTittel(sp) {
    const m = sp.mal;
    if (sp.fase === "mal") return R.t("Målgang");
    if (m && m.type === "poeng") return R.t("Først til {n}", { n: m.n });
    if (m && m.type === "turer") return R.t("Tur {nr} av {alle}", { nr: Math.min(sp.nr + 1, totaltTurer(sp)), alle: totaltTurer(sp) });
    return R.t("Tur {nr}", { nr: sp.nr + 1 });
  }

  // A new turn for player i. Lasting dares («Gjelder nå») of that player are over now.
  function settTur(sp, i) {
    sp.tur = i;
    if (sp.gjelder.some((g) => g.i === i)) {
      sp.gjelder = sp.gjelder.filter((g) => g.i !== i);
      sp.fri = i;
    }
  }

  // After a turn (or a skipped player): set up the next one. At the finish line the phase becomes
  // "mal" — the table then shows «Målgang» with the way to Kåringen (and «Angre» still works).
  function etterTur(sp, forrige) {
    const m = sp.mal;
    if (sp.modus === "rekke") {
      const neste = (forrige + 1) % sp.antall;
      if (neste === sp.start) {
        // A lap is complete: everyone has had as many turns.
        if (m && (m.type === "turer" ? sp.runde >= m.n : harNadd(sp))) {
          sp.fase = "mal";
          return;
        }
        sp.runde += 1;
      }
      settTur(sp, neste);
      sp.fase = "valg";
      sp.animer = true;
      return;
    }
    sp.fase = m && !kanFaTur(sp).some(Boolean) ? "mal" : "snurr";
  }

  // The toast for a player whose lasting dare just ended (set by settTur).
  function meldFri(S) {
    const sp = S.spill;
    if (!sp || sp.fri == null) return;
    const i = sp.fri;
    sp.fri = null;
    R.toast(R.t("{navn} er fri fra konsekvensen sin!", { navn: R.navn(i) }), { topp: true });
  }

  // ---------- Cards ----------

  function trekk(S) {
    const sp = S.spill;
    const valgt = new Set(sp.pakker);
    const liste = ALLE[sp.type];
    sp.kort = STOKK[sp.type].neste((n) => valgt.has(liste[n].p));
    sp.andre = null;
    if (liste[sp.kort] && liste[sp.kort].t.includes("{spiller}")) {
      const andre = [];
      for (let i = 0; i < sp.antall; i++) if (i !== sp.tur) andre.push(i);
      sp.andre = R.velg(andre);
    }
  }

  function kortTekst(sp) {
    const k = ALLE[sp.type][sp.kort];
    const navn = sp.andre != null ? `<em class="vh-andre">${esc(R.navn(sp.andre))}</em>` : esc(R.t("en annen"));
    return esc(k.t).split("{spiller}").join(navn);
  }

  // The clock on a card with a duration: a round button with the kit's ring (R.Timer draws into it).
  const klokkeHtml = (sek) => `
    <button class="vh-klokke" id="vh-klokke" data-h="klokke" aria-label="${esc(R.t("Start klokka: {n} sekunder", { n: sek }))}">
      <span class="timer-ring"><svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><circle class="spor" cx="60" cy="60" r="54"/><circle class="fyll" cx="60" cy="60" r="54"/></svg><span class="vh-klokke-midt"><span class="vh-klokke-start" aria-hidden="true"></span><span class="vh-klokke-tall"><span class="timer-tid">${sek}</span><span class="vh-klokke-s" aria-hidden="true"> s</span></span></span></span>
    </button>`;

  const klokka = () => R.timer("vh-klokke");
  function stoppKlokka() {
    const t = klokka();
    if (t) t.stopp();
  }
  // The button says what a tap does now.
  function merkKlokka() {
    const el = document.getElementById("vh-klokke");
    if (!el) return;
    const t = klokka();
    el.classList.toggle("startet", !!t);
    el.setAttribute("aria-label", !t ? el.getAttribute("aria-label") : t.ferdig ? R.t("Tiden er ute. Start klokka på nytt") : t.kjorer ? R.t("Stopp klokka") : R.t("Start klokka igjen"));
  }

  // ---------- «Gjelder nå»: dares that last until the player's next turn ----------

  function brikkeTekst(g) {
    const k = ALLE[g.type][g.kort];
    const andre = g.andre != null ? R.navn(g.andre) : R.t("en annen");
    return `${R.navn(g.i)} ${k.varer.split("{spiller}").join(andre)}`;
  }

  function brikkerHtml(sp) {
    if (!sp.gjelder.length) return "";
    return `<ul class="vh-brikker" aria-label="${esc(R.t("Gjelder nå"))}">${sp.gjelder
      .map((g, n) => {
        const k = ALLE[g.type][g.kort];
        return `<li><button class="vh-brikke" data-h="gjelder" data-v="${n}" style="--pf: var(--p${(g.i % 20) + 1})"><span aria-hidden="true">${esc(k.ikon || "⏳")}</span><span>${esc(brikkeTekst(g))}</span></button></li>`;
      })
      .join("")}</ul>`;
  }

  // Who the bottle stops on: random, but players with fewer turns are more likely, and (with
  // three or more players) never the one who just played. With a goal, only players who still
  // have turns left.
  function velgMal(sp, rng) {
    const n = sp.antall;
    const turer = sp.stat.map((st) => st.turer);
    const kan = kanFaTur(sp);
    const min = Math.min(...turer.filter((t, i) => kan[i]));
    const vekt = (ikkeForrige) => turer.map((t, i) => (!kan[i] || (ikkeForrige && n >= 3 && i === sp.tur) ? 0 : t === min ? 4 : t === min + 1 ? 1.3 : 0.4));
    let vekter = vekt(true);
    if (!vekter.some((v) => v > 0)) vekter = vekt(false); // only the one who just played has turns left
    if (!vekter.some((v) => v > 0)) vekter = turer.map(() => 1);
    let x = rng() * vekter.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      x -= vekter[i];
      if (x < 0) return i;
    }
    return vekter.findIndex((v) => v > 0);
  }

  // ---------- The table with the bottle ----------

  const BLEKK = "#170e2b";
  const flaske = (silhuett) => {
    const f = (farge) => (silhuett ? "#06020e" : farge);
    const s = silhuett ? "#06020e" : BLEKK;
    return `<svg class="vh-flaske-svg" viewBox="0 0 64 224" aria-hidden="true" focusable="false">
      <path d="M24 26 V62 C24 82 7 90 7 114 V202 Q7 216 21 216 H43 Q57 216 57 202 V114 C57 90 40 82 40 62 V26 Z" fill="${silhuett ? "#06020e" : "url(#vh-glass) #3de3b0"}" stroke="${s}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M7 140 H57 V182 H7 Z" fill="${f("#ffd23f")}" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
      ${silhuett ? "" : `<path d="M32 146 L36 155 L45.5 156 L38.5 162.5 L40.5 172 L32 167 L23.5 172 L25.5 162.5 L18.5 156 L28 155 Z" fill="#ff5a4e" stroke="${BLEKK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M15.5 117 V134 M15.5 189 V198" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>
      <path d="M29.5 32 V60" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round"/>`}
      <rect x="20" y="17" width="24" height="12" rx="4" fill="${f("#3de3b0")}" stroke="${s}" stroke-width="4"/>
      <rect x="22" y="3" width="20" height="17" rx="5.5" fill="${f("#ff5a4e")}" stroke="${s}" stroke-width="4"/>
      ${silhuett ? "" : `<path d="M26 8 H30" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`}
    </svg>`;
  };
  const FLASKE = flaske(false);
  const SKYGGE = flaske(true);
  const MINI_FLASKE = FLASKE.replace('class="vh-flaske-svg"', 'class="vh-mini-flaske"');
  const SNURR_IKON =
    '<svg class="vh-snurrikon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12.5a8 8 0 1 1-2.6-6.4"/><path d="M19.5 3.5v4.4h-4.4"/></svg>';

  // A wedge of the table for player i (viewBox 0 0 200 200, centre 100,100).
  function kile(fra, til, r) {
    const p = (v) => {
      const rad = (v * Math.PI) / 180;
      return `${(100 + r * Math.sin(rad)).toFixed(2)} ${(100 - r * Math.cos(rad)).toFixed(2)}`;
    };
    return `M100 100 L${p(fra)} A${r} ${r} 0 ${til - fra > 180 ? 1 : 0} 1 ${p(til)} Z`;
  }

  function hjulHtml(sp, o) {
    const n = sp.antall;
    const s = 360 / n;
    const as = n <= 4 ? 17 : n <= 6 ? 15.5 : n <= 8 ? 14 : n <= 10 ? 12.5 : n <= 12 ? 11 : n <= 16 ? 9.6 : 8.4;
    const skilt = n <= 4 ? 124 : n <= 6 ? 106 : n <= 8 ? 92 : 80; // max name tag width in px
    const kiler = [];
    const plasser = [];
    for (let i = 0; i < n; i++) {
      const v = vinkelFor(i, n);
      const rad = (v * Math.PI) / 180;
      const x = 50 + 41 * Math.sin(rad);
      const y = 50 - 41 * Math.cos(rad);
      const pf = `var(--p${(i % 20) + 1})`;
      const valgt = i === o.valgt;
      kiler.push(`<path class="vh-kile${valgt ? " valgt" : ""}" data-kile="${i}" d="${kile(v - s / 2, v + s / 2, 54)}" style="--pf: ${pf}"/>`);
      const p = poengFor(sp.stat[i]);
      const side = x < 20 ? " venstre" : x > 80 ? " hoyre" : "";
      const fr = framgang(sp, i);
      plasser.push(
        `<span class="vh-plass${valgt ? " valgt" : ""}${y < 31 ? " topp" : ""}${side}${fr != null ? " med-mal" : ""}${fr === 1 ? " i-mal" : ""}" data-plass="${i}" style="--x: ${x.toFixed(2)}%; --y: ${y.toFixed(2)}%; --pf: ${pf}${fr != null ? `; --fr: ${fr.toFixed(3)}` : ""}">` +
          `${R.avatar(i)}${p ? `<span class="vh-poeng">${p}</span>` : ""}<span class="vh-navn">${esc(R.navn(i))}</span></span>`,
      );
    }
    const linjer = Array.from({ length: n }, (_, i) => {
      const rad = ((vinkelFor(i, n) + s / 2) * Math.PI) / 180;
      return `M100 100 L${(100 + 54 * Math.sin(rad)).toFixed(2)} ${(100 - 54 * Math.cos(rad)).toFixed(2)}`;
    }).join(" ");
    const rot = `transform: rotate(${(o.vinkel || 0).toFixed(2)}deg)`;
    const etikett = o.valgt != null ? R.t("Flaska peker på {navn}", { navn: R.navn(o.valgt) }) : R.t("Bord med flaske og {n} spillere", { n });
    return `
      <div class="vh-hjul${n > 10 ? " mange" : ""}${o.valgt != null ? " har-valgt" : ""}${o.vent ? " vent" : ""}${o.fest ? " fest" : ""}" id="vh-hjul" style="--as: ${as}%; --asn: ${as}; --skilt: ${skilt}px" role="img" aria-label="${esc(etikett)}">
        <svg class="vh-bord" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <defs><radialGradient id="vh-filtfarge" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#42306f"/><stop offset="1" stop-color="#1f1338"/></radialGradient><linearGradient id="vh-glass" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#8af7d6"/><stop offset=".42" stop-color="#3de3b0"/><stop offset="1" stop-color="#159170"/></linearGradient></defs>
          <circle class="vh-kant-skygge" cx="100" cy="104.5" r="63"/>
          <circle class="vh-kant" cx="100" cy="100" r="63"/>
          <circle cx="100" cy="100" r="54" fill="url(#vh-filtfarge)"/>
          <g class="vh-kiler">${kiler.join("")}</g>
          <path class="vh-linjer" d="${linjer}"/>
          <circle class="vh-filt-ring" cx="100" cy="100" r="54"/>
          <circle class="vh-lys-glod" cx="100" cy="100" r="58.5" pathLength="360"/>
          <circle class="vh-lys en" cx="100" cy="100" r="58.5" pathLength="360"/>
          <circle class="vh-lys to" cx="100" cy="100" r="58.5" pathLength="360"/>
        </svg>
        <div class="vh-lag vh-strale" data-roter style="${rot}"></div>
        ${plasser.join("")}
        <div class="vh-skygge"><div class="vh-lag" data-roter style="${rot}">${SKYGGE}</div></div>
        <div class="vh-lag vh-spokelse" data-spokelse></div>
        <div class="vh-lag vh-spokelse" data-spokelse></div>
        <div class="vh-lag vh-spokelse" data-spokelse></div>
        <div class="vh-lag vh-flaske" data-roter style="${rot}">${FLASKE}</div>
      </div>`;
  }

  // ---------- Bottle animation ----------

  const kurver = {
    ut: (p) => (t) => 1 - Math.pow(1 - t, p),
    innUt: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };

  function tikk() {
    R.lyd.tone(1900, 0, 0.022, "square", 0.035);
    R.lyd.stoy(0, 0.025, 0.07, 5200);
  }

  // Turns the bottle from `fra` to `til` (degrees) over `ms`. Highlights the player the neck
  // passes, clicks like a prize wheel and draws a motion trail while it is fast.
  function animer(o) {
    const hjul = document.getElementById("vh-hjul");
    if (!hjul || o.ms <= 0) {
      o.vedSlutt();
      return null;
    }
    const roter = R.$$("[data-roter]", hjul);
    const spokelser = R.$$("[data-spokelse]", hjul);
    const plasser = R.$$("[data-plass]", hjul);
    const kiler = R.$$("[data-kile]", hjul);
    if (!spokelser[0].innerHTML) spokelser.forEach((el) => (el.innerHTML = FLASKE));
    const n = plasser.length;
    let pekt = -1;
    let sisteTikk = 0;
    let forrigeA = o.fra;
    let forrigeT = performance.now();
    const start = forrigeT;
    let id = 0;
    let ferdig = false;
    const marker = (i) => {
      if (pekt >= 0) {
        plasser[pekt].classList.remove("pekt");
        kiler[pekt].classList.remove("pekt");
      }
      pekt = i;
      plasser[i].classList.add("pekt");
      kiler[i].classList.add("pekt");
      if (o.vedPekt) o.vedPekt(i);
    };
    const slutt = () => {
      ferdig = true;
      spokelser.forEach((el) => (el.style.opacity = "0"));
      if (pekt >= 0) {
        plasser[pekt].classList.remove("pekt");
        kiler[pekt].classList.remove("pekt");
      }
      o.vedSlutt();
    };
    function ramme(na) {
      if (ferdig) return;
      if (!hjul.isConnected) return slutt();
      const t = Math.min(1, (na - start) / o.ms);
      const a = o.fra + (o.til - o.fra) * o.kurve(t);
      const rot = `rotate(${a.toFixed(2)}deg)`;
      for (const el of roter) el.style.transform = rot;
      const fart = (a - forrigeA) / Math.max(1, na - forrigeT); // degrees per ms
      const etter = R.klamp(fart * 15, -38, 38);
      const synlig = R.klamp((Math.abs(fart) - 0.25) / 1.1, 0, 1);
      spokelser.forEach((el, k) => {
        el.style.transform = `rotate(${(a - etter * (k + 1)).toFixed(2)}deg)`;
        el.style.opacity = String(synlig * [0.3, 0.17, 0.08][k]);
      });
      forrigeA = a;
      forrigeT = na;
      const i = pekerPa(a, n);
      if (i !== pekt) {
        marker(i);
        if (o.lyd !== false && na - sisteTikk > 38) {
          tikk();
          if (Math.abs(fart) < 0.45) R.vibrer(5);
          sisteTikk = na;
        }
      }
      if (t < 1) id = requestAnimationFrame(ramme);
      else slutt();
    }
    id = requestAnimationFrame(ramme);
    return {
      avbryt() {
        ferdig = true;
        cancelAnimationFrame(id);
      },
    };
  }

  function stoppAnimasjon() {
    if (animasjon) animasjon.avbryt();
    animasjon = null;
  }

  // Start a spin. retning: 1 clockwise, -1 counter-clockwise; fart: flick speed in degrees per
  // second (null = button). The result is drawn and saved right away, so a reload mid-spin
  // simply shows where the bottle stopped.
  function snurr(retning, fart, fra) {
    const S = R.S;
    const sp = S.spill;
    if (!sp || sp.fase !== "snurr" || sp.snurr || animasjon || laast) return;
    const n = sp.antall;
    const rng = R.rng(R.nyttFro());
    const mal = velgMal(sp, rng);
    const s = 360 / n;
    // Land close to the player (so the neck clearly points at them); with many players, now
    // and then only just past the line, for suspense.
    const spenn = Math.min(0.33 * s, 24);
    let forskyvning = (rng() * 2 - 1) * spenn;
    if (n >= 6 && rng() < 0.3) forskyvning = -retning * (0.34 + rng() * 0.08) * s;
    const start = fra == null ? sp.vinkel : fra;
    const avstand = norm((vinkelFor(mal, n) + forskyvning - start) * retning);
    const runder = fart ? R.klamp(Math.round(fart / 330), 2, 8) : 4 + Math.floor(rng() * 2);
    const total = runder * 360 + avstand;
    const P = 3.1;
    let ms = fart ? ((P * total) / fart) * 1000 : 4300 + rng() * 800;
    ms = R.rolig() ? 700 : R.klamp(ms, 2900, 6400);
    const til = start + retning * total;
    sp.snurr = { mal, vinkel: norm(til) };
    sp.angre = null;
    R.lagre();

    const hjul = document.getElementById("vh-hjul");
    if (hjul) {
      hjul.classList.remove("vent");
      hjul.classList.add("snurrer");
    }
    R.$$('#skjerm [data-h="snurr"]').forEach((b) => (b.disabled = true));
    const etikett = R.$("#vh-info .etikett");
    if (etikett) etikett.textContent = R.t("Flaska snurrer …");
    const ingress = R.$("#vh-info .ingress");
    if (ingress) ingress.textContent = R.t("Hvem blir det?");
    const tittel = R.$("#vh-info h1");
    const vedPekt = (i) => {
      if (tittel) tittel.textContent = R.navn(i);
    };
    R.lyd.sveip();
    R.vibrer(15);
    const ferdig = () => {
      animasjon = null;
      fullforSnurr(R.S, true);
    };
    if (fart || R.rolig()) {
      animasjon = animer({ fra: start, til, ms, kurve: kurver.ut(P), vedPekt, vedSlutt: ferdig });
    } else {
      // A little wind-up backwards before the push.
      animasjon = animer({
        fra: start,
        til: start - 16,
        ms: 170,
        kurve: kurver.ut(2),
        lyd: false,
        vedSlutt: () => {
          animasjon = animer({ fra: start - 16, til, ms, kurve: kurver.ut(P), vedPekt, vedSlutt: ferdig });
        },
      });
    }
  }

  function fullforSnurr(S, effekt) {
    const sp = S.spill;
    if (!sp || !sp.snurr) return;
    const r = sp.snurr;
    sp.snurr = null;
    settTur(sp, r.mal);
    sp.vinkel = r.vinkel;
    sp.fase = "valg";
    if (S.skjerm !== "runde") {
      R.lagre();
      return;
    }
    R.vis();
    meldFri(S);
    // The spin button is gone now: move focus to the name, so keyboard users land on the choice.
    const h = R.$("#skjerm h1");
    if (h && (!document.activeElement || document.activeElement === document.body)) {
      h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
    if (effekt) feireValgt(r.mal);
    R.si(R.t("Flaska peker på {navn}. Sannhet eller konsekvens?", { navn: R.navn(r.mal) }));
  }

  function feireValgt(i) {
    const hjul = document.getElementById("vh-hjul");
    if (!hjul) return;
    hjul.classList.add("stoppet", "har-valgt");
    const plass = R.$(`[data-plass="${i}"]`, hjul);
    if (plass) plass.classList.add("valgt", "ny");
    const k = R.$(`[data-kile="${i}"]`, hjul);
    if (k) k.classList.add("valgt");
    const info = R.$("#vh-info");
    if (info) info.classList.add("ny");
    R.lyd.pop();
    R.lyd.pling();
    R.vibrer([30, 50, 90]);
  }

  // In "på rekke og rad" mode the bottle turns to the next player instead of spinning.
  function snuTilNeste(S) {
    const sp = S.spill;
    const n = sp.antall;
    const fra = sp.vinkel;
    const mal = vinkelFor(sp.tur, n);
    let avstand = norm(mal - fra);
    if (avstand > 0 && avstand < 30) avstand += 360;
    sp.vinkel = norm(mal);
    R.lagre();
    if (!avstand || R.rolig()) {
      R.$$("#vh-hjul [data-roter]").forEach((el) => (el.style.transform = `rotate(${sp.vinkel}deg)`));
      feireValgt(sp.tur);
      return;
    }
    animasjon = animer({
      fra,
      til: fra + avstand,
      ms: 450 + avstand * 2.4,
      kurve: kurver.innUt,
      vedSlutt: () => {
        animasjon = null;
        feireValgt(sp.tur);
      },
    });
  }

  // ---------- Dragging the bottle ----------

  let dra = null;
  function draStart(e) {
    const hjul = e.target.closest && e.target.closest("#vh-hjul");
    const S = R.S;
    if (!hjul || !S || !S.spill || S.spill.fase !== "snurr" || S.spill.snurr || animasjon || laast) return;
    if (e.button != null && e.button > 0) return;
    const b = hjul.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const vinkel = (x, y) => (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
    const iMidten = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2 < 20 * 20;
    dra = {
      id: e.pointerId,
      hjul,
      cx,
      cy,
      vinkel,
      // Grabbed right at the centre: no angle yet, start measuring from the first move.
      siste: iMidten ? null : vinkel(e.clientX, e.clientY),
      a: S.spill.vinkel,
      flyttet: 0,
      x0: e.clientX,
      y0: e.clientY,
      piksler: 0,
      spor: [{ t: performance.now(), a: S.spill.vinkel }],
      roter: R.$$("[data-roter]", hjul),
      plasser: R.$$("[data-plass]", hjul),
      pekt: -1,
    };
    try {
      hjul.setPointerCapture(e.pointerId);
    } catch (feil) {
      /* not all pointers can be captured */
    }
    hjul.classList.add("drar");
    e.preventDefault();
  }
  function draFlytt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    dra.piksler = Math.max(dra.piksler, Math.hypot(e.clientX - dra.x0, e.clientY - dra.y0));
    const dx = e.clientX - dra.cx;
    const dy = e.clientY - dra.cy;
    if (dx * dx + dy * dy < 20 * 20) return; // too close to the centre to read an angle
    const v = dra.vinkel(e.clientX, e.clientY);
    if (dra.siste == null) {
      dra.siste = v;
      return;
    }
    const d = ((v - dra.siste + 540) % 360) - 180;
    dra.siste = v;
    dra.a += d;
    dra.flyttet += Math.abs(d);
    const rot = `rotate(${dra.a.toFixed(2)}deg)`;
    dra.roter.forEach((el) => (el.style.transform = rot));
    const i = pekerPa(dra.a, dra.plasser.length);
    if (i !== dra.pekt) {
      if (dra.pekt >= 0) dra.plasser[dra.pekt].classList.remove("pekt");
      dra.pekt = i;
      dra.plasser[i].classList.add("pekt");
      tikk();
    }
    const na = performance.now();
    dra.spor.push({ t: na, a: dra.a });
    while (dra.spor.length > 2 && na - dra.spor[0].t > 140) dra.spor.shift();
  }
  function draSlutt(e) {
    if (!dra || e.pointerId !== dra.id) return;
    const d = dra;
    dra = null;
    d.hjul.classList.remove("drar");
    if (d.pekt >= 0) d.plasser[d.pekt].classList.remove("pekt");
    const S = R.S;
    if (!S.spill || S.spill.fase !== "snurr") return;
    if (e.type === "pointercancel") {
      S.spill.vinkel = norm(d.a);
      R.vis();
      return;
    }
    const na = performance.now();
    const forste = d.spor.find((p) => na - p.t <= 110) || d.spor[d.spor.length - 1];
    const fart = na - forste.t > 8 ? ((d.a - forste.a) / (na - forste.t)) * 1000 : 0;
    if (d.piksler < 12 && d.flyttet < 4) return snurr(1, null, d.a); // a tap spins it like the button
    if (Math.abs(fart) >= 220) return snurr(Math.sign(fart), Math.min(Math.abs(fart), 3600), d.a);
    S.spill.vinkel = norm(d.a);
    R.lagre();
    R.toast(R.t("Gi den mer fart – eller trykk på knappen!"));
  }
  document.addEventListener("pointerdown", draStart);
  document.addEventListener("pointermove", draFlytt);
  document.addEventListener("pointerup", draSlutt);
  document.addEventListener("pointercancel", draSlutt);

  // ---------- Results ----------

  async function utfall(S, ok) {
    const sp = S.spill;
    if (!sp || sp.fase !== "kort" || laast) return;
    laast = true;
    stoppKlokka();
    const i = sp.tur;
    const T = TYPER[sp.type];
    const st = sp.stat[i];
    // «Angre» stays possible until the next action (spin, choice or skip).
    sp.angre = { i, ok, type: sp.type, kort: sp.kort, andre: sp.andre, byttet: sp.byttet, vinkel: sp.vinkel, runde: sp.runde, gjelder: sp.gjelder.map((g) => Object.assign({}, g)) };
    if (ok) st[sp.type] += 1;
    else st.f += 1;
    st.turer += 1;
    sp.nr += 1;
    // A dare that lasts stays on the table until this player's next turn.
    if (ok && ALLE[sp.type][sp.kort].varer) sp.gjelder.push({ i, type: sp.type, kort: sp.kort, andre: sp.andre });

    const kort = R.$("#vh-kort");
    if (kort) {
      kort.insertAdjacentHTML(
        "beforeend",
        `<span class="vh-stempel" aria-hidden="true"><span class="stempel ${ok ? "mynte" : "lampe"}">${esc(ok ? R.t("Fullført!") : R.t("Står over"))}</span>${
          ok ? `<span class="vh-fly">+${T.poeng}</span>` : ""
        }</span>`,
      );
    }
    R.$$("#skjerm .dokk button").forEach((b) => (b.disabled = true));
    if (ok) {
      R.lyd.riktig();
      if (sp.type === "k") setTimeout(() => R.lyd.pling(), 220);
      R.vibrer(30);
    } else {
      R.lyd.sveip();
      R.vibrer(20);
    }
    R.si(ok ? R.t("{navn} får {n} poeng.|{navn} får {n} poeng.", { navn: R.navn(i), n: T.poeng }) : R.t("{navn} står over.", { navn: R.navn(i) }));

    // Set up the next turn now, so a reload during the stamp lands in the right place.
    sp.type = null;
    sp.kort = null;
    sp.andre = null;
    sp.byttet = false;
    etterTur(sp, i);
    R.lagre();
    const fortsatt = R.vakt();
    await R.vent(R.rolig() ? 650 : 1350);
    laast = false;
    if (!fortsatt()) return;
    R.gaTil("runde");
  }

  // ---------- Awards ----------

  function topp(sp, felt) {
    const max = Math.max(0, ...sp.stat.map((st) => (felt === "p" ? poengFor(st) : st[felt])));
    if (!max) return null;
    const hvem = [];
    sp.stat.forEach((st, i) => {
      if ((felt === "p" ? poengFor(st) : st[felt]) === max) hvem.push(i);
    });
    return { verdi: max, hvem };
  }

  function prisHtml(ikon, tittel, vinner, tekst, farge) {
    return `<li class="vh-pris" style="--vf: ${farge}">
      <span class="vh-pris-ikon" aria-hidden="true">${ikon}</span>
      <span class="vh-pris-tekst"><span class="etikett">${esc(tittel)}</span><b>${esc(vinner)}</b><span>${esc(tekst)}</span></span>
    </li>`;
  }

  function poengRader(sp) {
    return sp.stat
      .map((st, i) => ({ i, st, p: poengFor(st) }))
      .sort((a, b) => b.p - a.p || b.st.k - a.st.k || a.i - b.i);
  }

  function tavleHtml(sp) {
    const rader = poengRader(sp);
    const best = rader.length ? rader[0].p : 0;
    return `<ol class="poengliste vh-tavle">${rader
      .map(
        (r, n) => `<li class="${r.p === best && best > 0 ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${R.avatar(r.i)}` +
          `<span class="navn"><span class="vh-tavle-navn">${esc(R.navn(r.i))}</span>` +
          `<span class="vh-stat"><span class="vh">${esc(R.t("{konsekvenser} og {sannheter}", { konsekvenser: antallOrd(r.st.k, R.t("1 konsekvens"), R.t("{n} konsekvenser", { n: r.st.k })), sannheter: antallOrd(r.st.s, R.t("1 sannhet"), R.t("{n} sannheter", { n: r.st.s })) }))}${r.st.m ? esc(`, ${antallOrd(r.st.m, R.t("1 minuspoeng"), R.t("{n} minuspoeng", { n: r.st.m }))}`) : ""}</span><span aria-hidden="true">🔥 ${r.st.k} · 😇 ${r.st.s}${r.st.m ? ` · −${r.st.m}` : ""}</span></span></span>` +
          `<span class="sum">${r.p}</span></li>`,
      )
      .join("")}</ol>`;
  }

  // The game is over: straight to Kåringen. Counted once for the evening's scoreboard.
  function tilKaaring(S) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    stoppAnimasjon();
    stoppKlokka();
    const iMal = sp.fase === "mal";
    Object.assign(sp, { ferdig: true, angre: null, snurr: null, fri: null, animer: false });
    R.statistikk("ferdig", { spillere: sp.antall, turer: sp.nr, modus: sp.modus, mal: sp.mal ? sp.mal.type : "fritt", imal: iMal });
    R.kveld.registrer(sp.stat.map((st, i) => ({ i, poeng: poengFor(st) })));
    R.gaTil("slutt");
  }

  // What «Del kåringen» sends: the winner and the two awards.
  function delTekst(sp) {
    const vinner = topp(sp, "p");
    const vaghals = topp(sp, "k");
    const aerlig = topp(sp, "s");
    const deler = [R.t("{navn} vant sannhet eller konsekvens med {n} poeng.|{navn} vant sannhet eller konsekvens med {n} poeng.", { navn: navneliste(vinner.hvem), n: vinner.verdi })];
    if (vaghals) deler.push(R.t("Største våghals: {navn} ({antall}).", { navn: navneliste(vaghals.hvem), antall: antallOrd(vaghals.verdi, R.t("én konsekvens"), R.t("{n} konsekvenser", { n: vaghals.verdi })) }));
    if (aerlig) deler.push(R.t("Ærligste: {navn} ({antall}).", { navn: navneliste(aerlig.hvem), antall: antallOrd(aerlig.verdi, R.t("ett ærlig svar"), R.t("{n} ærlige svar", { n: aerlig.verdi })) }));
    return R.t("{spill}: {tekst} Tør dere?", { spill: R.app.navn, tekst: deler.join(" ") });
  }

  // ---------- The game ----------

  R.start({
    id: "vaghalsen",
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also those with the game's own buttons in them
    pagar,

    tilstand: () => ({
      antall: standardAntall(),
      oppsett: { pakker: STANDARD.slice(), tur: "flaske", mal: "turer" },
      nesteStart: 0, // who starts in turn order: moves one seat for every game
      spill: null,
    }),

    // No new `versjon` for the finish line, the chips and the final Kåringen: saved games from
    // before get the new fields here (and play on without a goal, as they started).
    lastet(S) {
      S.oppsett = Object.assign({ pakker: STANDARD.slice(), tur: "flaske", mal: "turer" }, S.oppsett || {});
      S.oppsett.pakker = (Array.isArray(S.oppsett.pakker) ? S.oppsett.pakker : []).filter((id) => pakke(id));
      if (!S.oppsett.pakker.length) S.oppsett.pakker = STANDARD.slice();
      if (!["flaske", "rekke"].includes(S.oppsett.tur)) S.oppsett.tur = "flaske";
      if (!MAL.includes(S.oppsett.mal)) S.oppsett.mal = "turer";
      S.antall = R.klamp(Number(S.antall) || standardAntall(), 2, 20);
      S.nesteStart = Number.isInteger(S.nesteStart) && S.nesteStart >= 0 ? S.nesteStart : 0;
      const sp = S.spill;
      if (sp) {
        const ok =
          Number.isInteger(sp.antall) && sp.antall >= 2 && sp.antall <= 20 &&
          Array.isArray(sp.stat) && sp.stat.length === sp.antall && sp.stat.every((st) => st && Number.isInteger(st.turer) && Number.isInteger(st.s) && Number.isInteger(st.k)) &&
          Array.isArray(sp.pakker) && sp.pakker.some((id) => pakke(id)) &&
          ["snurr", "valg", "kort", "mal"].includes(sp.fase) && typeof sp.vinkel === "number";
        if (!ok) S.spill = null;
        else {
          sp.pakker = sp.pakker.filter((id) => pakke(id));
          sp.stat.forEach((st) => (st.m = Number.isInteger(st.m) && st.m > 0 ? st.m : 0));
          sp.ferdig = !!sp.ferdig;
          const m = sp.mal;
          sp.mal = m && (m.type === "turer" || m.type === "poeng") && Number.isInteger(m.n) && m.n >= 1 && m.n <= 99 ? { type: m.type, n: m.n } : null;
          sp.start = Number.isInteger(sp.start) && sp.start >= 0 && sp.start < sp.antall ? sp.start : 0;
          sp.runde = Number.isInteger(sp.runde) && sp.runde >= 1 ? sp.runde : 1;
          sp.hoppet = Number.isInteger(sp.hoppet) && sp.hoppet >= 0 ? sp.hoppet : 0;
          sp.fri = null;
          const gyldig = (g) => g && Number.isInteger(g.i) && g.i >= 0 && g.i < sp.antall && TYPER[g.type] && ALLE[g.type][g.kort] && ALLE[g.type][g.kort].varer && (g.andre == null || (Number.isInteger(g.andre) && g.andre < sp.antall));
          sp.gjelder = (Array.isArray(sp.gjelder) ? sp.gjelder : []).filter(gyldig);
          if (sp.fase === "mal" && !sp.mal) sp.fase = "snurr";
          if (!["snurr", "mal"].includes(sp.fase) && !(Number.isInteger(sp.tur) && sp.tur < sp.antall)) {
            sp.fase = "snurr";
            sp.tur = null;
          }
          if (sp.modus === "rekke" && sp.fase === "snurr") sp.fase = "valg";
          if (sp.modus === "rekke" && !(Number.isInteger(sp.tur) && sp.tur < sp.antall)) sp.tur = sp.start;
          if (sp.fase === "kort" && !(TYPER[sp.type] && ALLE[sp.type][sp.kort])) sp.fase = "valg";
          if (sp.andre != null && !(sp.andre < sp.antall)) sp.andre = null;
          const a = sp.angre;
          if (a && a.slags === "glemte") {
            if (!gyldig(a.g)) sp.angre = null;
          } else if (a && !(Number.isInteger(a.i) && a.i < sp.antall && TYPER[a.type] && ALLE[a.type][a.kort])) sp.angre = null;
          else if (a) {
            a.gjelder = (Array.isArray(a.gjelder) ? a.gjelder : []).filter(gyldig);
            a.runde = Number.isInteger(a.runde) && a.runde >= 1 ? a.runde : sp.runde;
          }
        }
      }
      const spill = S.spill;
      // Never come back to a card screen without a card (e.g. reloaded during the stamp), to the
      // table of a finished game, or to Kåringen of a game that is still running.
      if (S.skjerm === "kort" && !(spill && !spill.ferdig && spill.fase === "kort")) S.skjerm = spill && !spill.ferdig ? "runde" : "hjem";
      if (S.skjerm === "runde" && !(spill && !spill.ferdig)) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && spill && !spill.ferdig) S.skjerm = spill.fase === "kort" ? "kort" : "runde";
    },

    // rusj.no/vaghalsen/#jul: straight to «Gjør klart» with only the Christmas pack chosen
    // (a running game is left alone).
    vedHash(S, hash) {
      const id = String(hash || "").toLowerCase();
      const p = pakke(id);
      if (!p || !p.sesong || pagar(S)) return null;
      S.oppsett.pakker = [id];
      return "oppsett";
    },

    regler: {
      intro: R.t("Flaska bestemmer hvem som står for tur. Velg sannhet eller konsekvens – og gjennomfør!"),
      steg: [
        [R.t("Snurr flaska"), R.t("Trykk på knappen, trykk på bordet eller gi flaska et spinn med fingeren. Den peker ut hvem som står for tur.")],
        [R.t("Sannhet eller konsekvens?"), R.t("Sannhet: svar ærlig på spørsmålet. Konsekvens: gjør utfordringen – med en gang.")],
        [R.t("Fullført – eller stå over"), R.t("Sannhet gir 1 poeng og konsekvens 2. Står du over, får du 0 – og det er helt greit.")],
      ],
      tips: [
        R.t("Alle kan si nei takk. Trykk «Står over» – det er alltid lov."),
        R.t("Passer ikke kortet? Du kan bytte det én gang per tur."),
        R.t("Nevner kortet en annen spiller? Den personen kan også si nei – da bytter dere kort."),
        R.t("Står det en tid på kortet? Trykk på klokka, så tar mobilen tiden."),
        R.t("Noen konsekvenser varer til du står for tur igjen. De står under bordet – trykk på brikken hvis noen glemmer seg."),
        R.t("Dere bestemmer hvor lenge spillet varer: noen turer hver, først til 10 poeng – eller fritt."),
        R.t("«Barn» passer fra 6 år. «Fest» er for voksne (18+)."),
        R.t("Vil dere heller gå på rekke og rad? Velg det når dere gjør klart."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Snurr flaska. Velg sannhet"))}<br>${esc(R.t("eller konsekvens."))} <em>${esc(R.t("Tør du?"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: !pagar(S) ? "" : S.spill.fase === "mal" ? R.t("Fortsett · til kåringen") : R.t("Fortsett · tur {nr}", { nr: S.spill.nr + 1 }),
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["2–20", R.t("spillere")],
              [String(ANTALL_KORT), R.t("kort")],
              ["0", R.t("reklame")],
            ],
          }),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = R.klamp(S.antall, 2, 20);
          const turer = turerHver(n);
          const forklaring = {
            turer: turer === 1 ? R.t("Alle får én tur – så blir det kåring.") : R.t("Alle får {n} turer – så blir det kåring.", { n: turer }),
            poeng: R.t("Første til {n} poeng vinner – når alle har hatt like mange turer.", { n: MALPOENG }),
            fritt: R.t("Spill så lenge dere vil. «Avslutt» tar dere til kåringen."),
          };
          return `
          <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
          <section class="seksjon">
            <h2>${esc(R.t("Hvem står for tur?"))}</h2>
            ${R.ui.fliser(
              "turmodus",
              [
                { v: "flaske", tittel: R.t("Flaska bestemmer"), tekst: R.t("Snurr flaska og se hvem den peker på."), ikon: MINI_FLASKE },
                { v: "rekke", tittel: R.t("På rekke og rad"), tekst: R.t("Alle får tur, én etter én."), ikon: "🔁" },
              ],
              o.tur,
            )}
          </section>
          ${R.ui.spillere({ min: 2, max: 20, hjelp: R.t("Navnene vises rundt bordet. Dyrene viser hvem som er hvem.") })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>${esc(R.t("Hvilke kort?"))}</h2><span class="tall">${esc(R.t("{n} valgt", { n: o.pakker.length }))}</span></div>
            ${R.ui.fliser(
              "pakke",
              PAKKER_VIST.map((p) => ({ v: p.id, tittel: p.navn, tekst: p.tekst, ikon: p.ikon })),
              o.pakker,
            )}
          </section>
          <section class="seksjon">
            <h2>${esc(R.t("Hvor lenge?"))}</h2>
            ${R.ui.seg(
              "mal",
              [
                ["turer", R.t("{turer} hver", { turer: R.flertall(turer, "tur", "turer") })],
                ["poeng", R.t("Til {n} poeng", { n: MALPOENG })],
                ["fritt", R.t("Fritt")],
              ],
              o.mal,
              { etikett: R.t("Hvor lenge spillet varer") },
            )}
            <p class="hjelp" id="vh-mal-hjelp">${esc(forklaring[o.mal])}</p>
          </section>
          ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !o.pakker.length }))}`;
        },
      },

      runde: {
        tittel: (S) => toppTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const mal = sp.fase === "mal";
          const valg = sp.fase === "valg";
          const synlig = valg && !sp.animer ? sp.tur : null;
          const siste = sisteRunde(sp);
          const brikker = brikkerHtml(sp);
          // The chips take the place of the helper line (by then everyone knows how to spin and choose).
          const under = (tekst) => brikker || `<p class="ingress">${esc(tekst)}</p>`;
          let info;
          if (mal) {
            info = `<p class="etikett">${esc(sp.mal.type === "poeng" ? R.t("{n} poeng er nådd", { n: sp.mal.n }) : R.t("Alle har hatt turene sine"))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Det var siste tur!"))}</h1>
              ${under(R.t("Hvem vant? Det viser kåringen."))}`;
          } else if (valg) {
            info = `<p class="etikett">${esc(siste && sp.modus === "rekke" ? R.t("Siste runde") : sp.modus === "rekke" ? R.t("Din tur") : R.t("Flaska har talt"))}</p>
              <h1 id="skjerm-tittel">${esc(R.navn(sp.tur))}</h1>
              ${under(R.t("Sannhet eller konsekvens?"))}`;
          } else if (sp.tur == null) {
            info = `<p class="etikett">${esc(R.t("Første tur"))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("Hvem begynner?"))}</h1>
              ${under(R.t("Trykk på knappen – eller gi flaska et spinn med fingeren."))}`;
          } else {
            info = `<p class="etikett">${esc(siste ? R.t("Siste runde") : R.t("Neste tur"))}</p>
              <h1 id="skjerm-tittel">${esc(R.t("{navn} snurrer", { navn: R.navn(sp.tur) }))}</h1>
              ${under(R.t("Trykk på knappen – eller gi flaska et spinn med fingeren."))}`;
          }
          const angre = sp.angre ? R.ui.lenke(R.t("Angre"), "angre") : "";
          const dokk = mal
            ? R.ui.dokk(R.ui.knapp(R.t("Til kåringen"), "til-kaaring"), R.ui.lenkerad(angre, R.ui.lenke(R.t("Poeng"), "poeng")))
            : valg
              ? R.ui.dokk(
                  `<div class="vh-valg">
                  <button class="knapp lilla" data-h="velg" data-v="s"><span class="vh-valg-ikon" aria-hidden="true">😇</span>${esc(R.t("Sannhet"))} <small>${esc(R.t("+1 poeng"))}</small></button>
                  <button class="knapp" data-h="velg" data-v="k"><span class="vh-valg-ikon" aria-hidden="true">🔥</span>${esc(R.t("Konsekvens"))} <small>${esc(R.t("+2 poeng"))}</small></button>
                </div>`,
                  R.ui.lenkerad(
                    angre,
                    sp.modus === "rekke" ? R.ui.lenke(R.t("Hopp over"), "hopp") : R.ui.lenke(R.t("Snurr på nytt"), "snurr-igjen"),
                    R.ui.lenke(R.t("Poeng"), "poeng"),
                    R.ui.lenke(R.t("Avslutt"), "kaaring"),
                  ),
                )
              : R.ui.dokk(
                  R.ui.knapp(R.t("Snurr flaska!"), "snurr", { variant: "stor", ikon: SNURR_IKON, id: "vh-snurrknapp" }),
                  R.ui.lenkerad(angre, R.ui.lenke(R.t("Poeng"), "poeng"), R.ui.lenke(R.t("Avslutt"), "kaaring")),
                );
          return `
            <div class="vh-scene${brikker ? " med-brikker" : ""}">${hjulHtml(sp, { vinkel: sp.vinkel, valgt: synlig, vent: sp.fase === "snurr" && !sp.snurr, fest: mal })}</div>
            <div class="vh-info${mal ? " mal" : ""}" id="vh-info">${info}</div>
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.snurr) fullforSnurr(S, false);
          else if (sp.animer) {
            sp.animer = false;
            snuTilNeste(S);
          }
          if (sp.fase === "mal") {
            R.lyd.trommevirvel(R.rolig() ? 0.4 : 1.1);
            R.si(R.t("Det var siste tur. Trykk på «Til kåringen»."));
          }
          meldFri(S);
          R.vedForlat(stoppAnimasjon);
        },
      },

      kort: {
        tittel: (S) => toppTittel(S.spill),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const T = TYPER[sp.type];
          const k = ALLE[sp.type][sp.kort];
          const p = pakke(k.p);
          return `
            <div class="vh-hvem">
              ${R.avatar(sp.tur, "mid")}
              <div><p class="etikett">${esc(sp.type === "s" ? R.t("Svar ærlig") : R.t("Gjør det nå"))}</p><h1 id="skjerm-tittel">${esc(R.navn(sp.tur))}</h1></div>
              ${k.tid ? klokkeHtml(k.tid) : ""}
            </div>
            <div class="vh-bunke ${sp.type}">${R.ui.storkort({
              etikett: `${T.ikon} ${T.navn}`,
              nr: `${p.ikon} ${p.navn}`,
              tekstHtml: kortTekst(sp),
              klasse: `vh-kort ${T.kort}`,
              id: "vh-kort",
            })}</div>
            ${R.ui.dokk(
              `<div class="knapprad vh-utfall">
                ${R.ui.knapp2(R.t("Står over"), "staover")}
                ${R.ui.knapp("", "fullfort", { variant: "mynte", tekstHtml: `${esc(R.t("Fullført!"))} <span class="vh-pluss">+${T.poeng}</span>` })}
              </div>`,
              R.ui.lenkerad(sp.byttet ? `<span class="vh-byttet">${esc(R.t("Kortet er byttet"))}</span>` : R.ui.lenke(R.t("Bytt kort (én gang)"), "bytt"), R.ui.lenke(R.t("Avslutt"), "kaaring")),
            )}`;
        },
      },

      // Final: back leads home, and the game is no longer «in progress».
      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const vinner = topp(sp, "p");
          const vaghals = topp(sp, "k");
          const aerlig = topp(sp, "s");
          const priser = [
            vaghals
              ? prisHtml("🔥", R.t("Største våghals"), navneliste(vaghals.hvem), antallOrd(vaghals.verdi, R.t("Én konsekvens fullført. Godt jobba!"), R.t("{n} konsekvenser fullført. Godt jobba!", { n: vaghals.verdi })), "var(--aksent)")
              : prisHtml("🔥", R.t("Største våghals"), R.t("Ingen denne gangen"), R.t("Ingen tok en eneste konsekvens. Neste gang!"), "var(--aksent)"),
            aerlig
              ? prisHtml("😇", R.t("Ærligste"), navneliste(aerlig.hvem), antallOrd(aerlig.verdi, R.t("Ett ærlig svar. Ærlig talt imponerende."), R.t("{n} ærlige svar. Ærlig talt imponerende.", { n: aerlig.verdi })), "var(--lilla)")
              : prisHtml("😇", R.t("Ærligste"), R.t("Ingen denne gangen"), R.t("Ingen valgte sannhet. Hva skjuler dere?"), "var(--lilla)"),
          ];
          const rader = sp.stat.map((st, i) => ({ i, poeng: poengFor(st) }));
          return `
            ${R.ui.banner({
              klasse: "aksent",
              stemning: vinner ? "jubel" : "",
              tittel: vinner ? R.t("{navn} vinner!|{navn} vinner!", { navn: navneliste(vinner.hvem), n: vinner.hvem.length }) : R.t("Ingen vinner denne gangen"),
              tekst: vinner ? (sp.nr === 1 ? R.t("{n} poeng etter én tur|{n} poeng etter én tur", { n: vinner.verdi }) : R.t("{n} poeng etter {turer} turer|{n} poeng etter {turer} turer", { n: vinner.verdi, turer: sp.nr })) : R.t("Ingen fikk poeng. Neste gang: velg et kort – og våg!"),
            })}
            ${R.ui.pall(rader)}
            <ul class="vh-priser">${priser.join("")}</ul>
            <section class="seksjon">
              <h2>${esc(R.t("Poengtavla"))}</h2>
              ${tavleHtml(sp)}
              ${vinner ? `<div class="vh-del">${R.ui.knapp2(R.t("Del kåringen"), "del")}</div>` : ""}
            </section>
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          if (topp(S.spill, "p")) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      // A running game is never thrown away without asking.
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        if (pagar(S)) S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      hjem: () => R.gaTil("hjem"),
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil(S.spill.fase === "kort" ? "kort" : "runde");
      },
      pakke(el, e, S) {
        const id = el.dataset.v;
        const liste = S.oppsett.pakker;
        S.oppsett.pakker = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
        R.vis();
      },
      turmodus(el, e, S) {
        S.oppsett.tur = el.dataset.v === "rekke" ? "rekke" : "flaske";
        R.vis();
      },
      mal(el, e, S) {
        if (MAL.includes(el.dataset.v)) S.oppsett.mal = el.dataset.v;
        R.vis();
      },
      start(el, e, S) {
        if (!S.oppsett.pakker.length) return;
        const n = R.klamp(S.antall, 2, 20);
        const rekke = S.oppsett.tur === "rekke";
        // In turn order the first player moves one seat for every game (the first game: player 1).
        const start = rekke ? S.nesteStart % n : 0;
        if (rekke) S.nesteStart = start + 1;
        S.spill = {
          antall: n,
          pakker: S.oppsett.pakker.slice(),
          modus: rekke ? "rekke" : "flaske",
          mal: malFor(S.oppsett.mal, n),
          fase: rekke ? "valg" : "snurr",
          tur: rekke ? start : null,
          start,
          runde: 1,
          hoppet: 0,
          vinkel: Math.floor(Math.random() * 360),
          animer: rekke,
          snurr: null,
          angre: null,
          type: null,
          kort: null,
          andre: null,
          byttet: false,
          nr: 0,
          stat: Array.from({ length: n }, tom),
          gjelder: [],
          fri: null,
          ferdig: false,
        };
        R.statistikk("start", { spillere: n, modus: S.spill.modus, mal: S.oppsett.mal, pakker: S.spill.pakker.length, jul: S.spill.pakker.includes("jul") });
        R.gaTil("runde");
      },
      snurr: (el, e, S) => snurr(1, null, S.spill.vinkel),
      "snurr-igjen"(el, e, S) {
        const sp = S.spill;
        if (animasjon || sp.fase !== "valg" || sp.modus === "rekke") return;
        sp.fase = "snurr";
        R.vis();
        snurr(1, null, sp.vinkel);
      },
      // In turn order: this player is not here just now. No turn is counted.
      hopp(el, e, S) {
        const sp = S.spill;
        if (animasjon || sp.fase !== "valg" || sp.modus !== "rekke") return;
        sp.angre = null;
        sp.hoppet += 1;
        etterTur(sp, sp.tur);
        R.vis();
        if (sp.fase === "mal") {
          R.lyd.trommevirvel(R.rolig() ? 0.4 : 1.1);
          R.si(R.t("Det var siste tur. Trykk på «Til kåringen»."));
          return;
        }
        sp.animer = false;
        snuTilNeste(S);
        meldFri(S);
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (sp.fase !== "valg") return;
        sp.angre = null;
        sp.type = el.dataset.v === "k" ? "k" : "s";
        sp.byttet = false;
        trekk(S);
        sp.fase = "kort";
        R.lyd.snu();
        R.gaTil("kort");
      },
      async bytt(el, e, S) {
        const sp = S.spill;
        if (sp.byttet || laast) return;
        sp.byttet = true;
        stoppKlokka();
        trekk(S);
        R.lagre();
        const fortsatt = R.vakt();
        await R.kastKort(-1);
        if (fortsatt()) R.vis();
      },
      // The clock on a card with a duration: start, stop/go on, and start again when time is up.
      klokke(el, e, S) {
        const sp = S.spill;
        const sek = sp && sp.fase === "kort" && ALLE[sp.type][sp.kort] ? ALLE[sp.type][sp.kort].tid : 0;
        if (!sek || laast) return;
        let t = klokka();
        if (t && t.ferdig) {
          t.stopp();
          t = null;
        }
        if (t) t.veksle();
        else
          new R.Timer({
            id: "vh-klokke",
            sekunder: sek,
            visning: "sek",
            vedSlutt() {
              merkKlokka();
              R.si(R.t("Tiden er ute."));
            },
          }).start();
        merkKlokka();
      },
      fullfort: (el, e, S) => utfall(S, true),
      // Take back the last thing that gave or took points: «Fullført»/«Står over» (the card comes
      // back) or «Glemte seg!» (the point and the chip come back).
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || animasjon || sp.snurr || laast) return;
        if (a.slags === "glemte") {
          const st = sp.stat[a.g.i];
          st.m = Math.max(0, (st.m || 0) - 1);
          sp.gjelder.splice(Math.min(a.n, sp.gjelder.length), 0, a.g);
          sp.angre = null;
          R.toast(R.t("Angret – poenget er tilbake"), { topp: true });
          R.vis();
          return;
        }
        const st = sp.stat[a.i];
        if (a.ok) st[a.type] = Math.max(0, st[a.type] - 1);
        else st.f = Math.max(0, st.f - 1);
        st.turer = Math.max(0, st.turer - 1);
        sp.nr = Math.max(0, sp.nr - 1);
        Object.assign(sp, { tur: a.i, type: a.type, kort: a.kort, andre: a.andre, byttet: a.byttet, vinkel: a.vinkel, runde: a.runde || sp.runde, gjelder: a.gjelder || [], fri: null, fase: "kort", animer: false, angre: null });
        R.toast(a.ok ? (a.type === "k" ? R.t("Angret – poengene er tatt bort") : R.t("Angret – poenget er tatt bort")) : R.t("Angret – kortet er tilbake"));
        R.gaTil("kort");
      },
      staover: (el, e, S) => utfall(S, false),
      poeng(el, e, S) {
        const sp = S.spill;
        const mal = !sp.mal ? "" : sp.mal.type === "poeng" ? R.t("Først til {n} poeng – når alle har hatt like mange turer.", { n: sp.mal.n }) : sp.mal.n === 1 ? R.t("Alle får én tur. Så blir det kåring.") : R.t("Alle får {n} turer. Så blir det kåring.", { n: sp.mal.n });
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Poengtavla"))}</h2>
          ${mal ? `<p class="ingress">${esc(mal)}</p>` : ""}
          ${tavleHtml(sp)}
          <p class="hjelp vh-forklaring"><span>${esc(R.t("🔥 Konsekvens 2 p"))}</span><span>${esc(R.t("😇 Sannhet 1 p"))}</span><span>${esc(R.t("Står over 0 p"))}</span></p>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Spill videre"))}</button>`);
      },
      // A «Gjelder nå» chip: did the player forget (−1 point, undoable), or is it simply over?
      gjelder(el, e, S) {
        const sp = S.spill;
        const n = Number(el.dataset.v);
        const g = sp && sp.gjelder[n];
        if (!g || laast) return;
        const k = ALLE[g.type][g.kort];
        R.ark(`
          <h2 id="ark-tittel"><span aria-hidden="true">${esc(k.ikon || "⏳")}</span> ${esc(brikkeTekst(g))}</h2>
          <p class="ingress">${esc(R.t("Gjelder til {navn} står for tur igjen.", { navn: R.navn(g.i) }))}</p>
          <div class="stabel">
            ${k.alle ? "" : `<button class="knapp-2" data-h="gjelder-glemte" data-v="${n}">${esc(R.t("Glemte seg! −1 poeng"))}</button>`}
            <button class="knapp-2" data-h="gjelder-ferdig" data-v="${n}">${esc(R.t("Ferdig – ta bort brikken"))}</button>
          </div>
          <button class="lenke" data-h="lukk-ark">${esc(R.t("Spill videre"))}</button>`);
      },
      "gjelder-glemte"(el, e, S) {
        const sp = S.spill;
        const n = Number(el.dataset.v);
        const g = sp && sp.gjelder[n];
        R.lukkArk();
        if (!g || animasjon || sp.snurr || laast) return;
        sp.gjelder.splice(n, 1);
        sp.stat[g.i].m = (sp.stat[g.i].m || 0) + 1;
        sp.angre = { slags: "glemte", g, n };
        R.lyd.latter();
        R.toast(R.t("{navn} glemte seg: −1 poeng", { navn: R.navn(g.i) }), { topp: true });
        R.vis();
      },
      "gjelder-ferdig"(el, e, S) {
        const sp = S.spill;
        const n = Number(el.dataset.v);
        R.lukkArk();
        if (!sp || !sp.gjelder[n] || animasjon || sp.snurr || laast) return;
        sp.gjelder.splice(n, 1);
        R.vis();
      },
      // «Avslutt»: with turns played, straight to Kåringen (the sheet says so) — it is final.
      async kaaring(el, e, S) {
        const fortsatt = R.vakt();
        const spilt = !!(S.spill && S.spill.nr > 0);
        const ja = await R.bekreft(R.t("Avslutte spillet?"), spilt ? R.t("Dere går rett til kåringen. Den med flest poeng vinner.") : R.t("Dere kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !pagar(S)) return;
        if (S.spill.nr > 0) return tilKaaring(S);
        stoppAnimasjon();
        S.spill = null;
        R.gaTil("hjem");
      },
      "til-kaaring": (el, e, S) => tilKaaring(S),
      del(el, e, S) {
        if (S.spill && topp(S.spill, "p")) R.del(R.app.navn, delTekst(S.spill), location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "vaghalsen") + "/");
      },
      igjen(el, e, S) {
        S.spill = null;
        S.antall = R.klamp(S.antall, 2, 20);
        H.start(el, e, S);
      },
    }),
  });
})();
