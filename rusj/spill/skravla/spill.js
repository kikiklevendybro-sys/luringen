/* Skravla — «Forklar ordet» (explain the word), team against team.
   One explainer per turn describes as many words as possible before the time runs out while the
   rest of the team guesses. Every correct word moves the team's token one field along the race
   track. When a team reaches the goal, the round is played out so all teams get the same number
   of turns; most points wins (a tie at the top means one more round).
   Words come from the shared word bank (window.RUSJ_ORD). In «Forbudte ord» every word also has
   three or four words the explainer may not say (data/forbudt.json); only words with such a list
   are drawn then, and the opponents have a button for the slip (−1, next word). */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const TEKST = window.RUSJ_DATA.tekster;
  const KAT = window.RUSJ_ORD.kategorier;
  const katMedId = (id) => KAT.find((k) => k.id === id);

  // The forbidden words, by word (lower case): { kategori: { "Tannlege": ["tenner", "hull", …] } }.
  // They are the words everybody would say first — not the word bank's oblique hints.
  const ordNokkel = (o) => String(o).trim().toLocaleLowerCase("nb");
  const FORBUDT = new Map();
  const forbudtData = window.RUSJ_DATA.forbudt || {};
  Object.keys(forbudtData).forEach((gruppe) =>
    Object.keys(forbudtData[gruppe] || {}).forEach((o) => {
      const liste = forbudtData[gruppe][o];
      if (Array.isArray(liste) && liste.length >= 3) FORBUDT.set(ordNokkel(o), liste.slice(0, 4).map(String));
    }),
  );
  const forbudtFor = (o) => FORBUDT.get(ordNokkel(o)) || null;
  // «Forbudte ord» needs this many words in the chosen categories and level (a game uses about 70).
  const MIN_FORBUDT = 30;

  // A theme is a hand-picked list of words from all over the bank (data/tema.json). While one is
  // chosen, it takes the place of the categories. So far: «Jul» (Christmas and winter).
  const temaData = window.RUSJ_DATA.tema || {};
  const TEMA = {};
  Object.keys(temaData).forEach((id) => {
    const t = temaData[id];
    if (t && Array.isArray(t.ord)) TEMA[id] = { id, navn: String(t.navn || id), ikon: String(t.ikon || ""), tekst: String(t.tekst || ""), ord: new Set(t.ord.map(ordNokkel)) };
  });
  const temaFor = (id) => (id && Object.prototype.hasOwnProperty.call(TEMA, id) ? TEMA[id] : null);

  // Every word in one list, so the deck remembers what this device has already shown.
  const ALLE = [];
  KAT.forEach((k) => k.ord.forEach((o) => ALLE.push({ k: k.id, o: o[0], n: o[1], f: FORBUDT.has(ordNokkel(o[0])), nk: ordNokkel(o[0]) })));
  const stokk = R.kortstokk("ord", ALLE.length);

  // The three choices and which word-bank levels (n = 1–3) each one draws from.
  const NIVAER = [
    { v: 1, navn: R.t("Lett"), n: [1], tekst: R.t("Lette ord – fint når barna er med.") },
    { v: 2, navn: R.t("Middels"), n: [1, 2], tekst: R.t("Lette og middels ord – passer for de fleste.") },
    { v: 3, navn: R.t("Vanskelig"), n: [2, 3], tekst: R.t("Middels og vanskelige ord – for dere som elsker ord.") },
  ];
  const niva = (v) => NIVAER.find((x) => x.v === v) || NIVAER[1];
  const TIDER = [45, 60, 90];
  const MAL = [20, 30, 40, 50];
  const DYP = ["var(--rosa-dyp)", "var(--lampe-dyp)", "var(--himmel-dyp)", "var(--mynte-dyp)"];
  const KORTFARGE = ["rosa", "lampe", "himmel", "mynte"];
  const lagNavn = (i) => R.lagNavn(i); // «Lag Rosa» (English «Team Pink», Danish «Hold Rosa»)
  const rundeNr = (sp) => Math.floor(sp.tur / sp.lag) + 1;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  // «A», «A og B», «A, B og C» (English «A, B and C»)
  const liste = (navn) => R.ramsOpp(navn);

  let H; // the actions, so one action can reuse another
  let startetNa = false; // the round screen was entered from the countdown: start the clock
  let opptatt = false; // a card is flying out or the countdown runs: ignore extra taps
  let poppTeller = false; // the next draw of the round screen makes the counter pop
  let feireNa = false; // the end screen was entered from the action that ended the game: fanfare

  // ---------- Words ----------

  // o: the setup or a running game (both have niva, kat, tema and tabu). A theme takes the place
  // of the categories. In «Forbudte ord» only words with a list of forbidden words count.
  function filter(o) {
    const lov = new Set(niva(o.niva).n);
    const t = temaFor(o.tema);
    const kat = !t && o.kat ? new Set(o.kat) : null;
    return (i) => lov.has(ALLE[i].n) && (t ? t.ord.has(ALLE[i].nk) : !kat || kat.has(ALLE[i].k)) && (!o.tabu || ALLE[i].f);
  }
  function tellOrd(o) {
    const f = filter(o);
    let n = 0;
    for (let i = 0; i < ALLE.length; i++) if (f(i)) n++;
    return n;
  }
  function tellKat(id, nivaV, tabu) {
    const lov = niva(nivaV).n;
    const k = katMedId(id);
    return k ? k.ord.filter((o) => lov.includes(o[1]) && (!tabu || FORBUDT.has(ordNokkel(o[0])))).length : 0;
  }
  // How many words «Forbudte ord» would have with these categories (or this theme) and this level.
  const tellForbudt = (o) => tellOrd({ niva: o.niva, kat: o.kat, tema: o.tema, tabu: true });
  function nyttOrd(sp) {
    let i = stokk.neste(filter(sp));
    // (A game saved before the lists existed may have categories without any: take any word with a list.)
    if (i < 0 && sp.tabu) i = stokk.neste((n) => ALLE[n].f);
    const w = ALLE[i >= 0 ? i : 0];
    sp.runde.ord.push({ o: w.o, k: w.k, s: null });
  }
  // The word on screen (not answered yet), if any.
  const ubesvart = (r) => {
    const w = r.ord[r.ord.length - 1];
    return w && w.s === null ? w : null;
  };
  // A word's state: null = on screen, 1 = correct, 0 = skipped, −1 = a forbidden word was said.
  // Points for the team that explained: +1 per correct word, −1 per forbidden word that slipped
  // out, −1 per skip if that rule is on, +1 if the team itself took the last word.
  function rundePoeng(sp, r) {
    let p = 0;
    r.ord.forEach((w) => {
      if (w.s === 1) p++;
      else if (w.s === -1) p--;
      else if (w.s === 0 && sp.straff) p--;
    });
    if (ubesvart(r) && r.siste === r.lag) p++;
    return p;
  }
  // Words the team got in the round (the record counts these, not the points).
  const rundeRiktige = (r) => r.ord.filter((w) => w.s === 1).length + (ubesvart(r) && r.siste === r.lag ? 1 : 0);

  // ---------- Record: the most words in one round, per time setting, kept on this phone ----------
  // Classic and «Forbudte ord» have their own records ("k60", "f60"): the second one is much harder.

  const REKORD = "skravla.rekord";
  const rekorder = () => {
    const r = R.les(REKORD, {});
    return r && typeof r === "object" && !Array.isArray(r) ? r : {};
  };
  const rekordNokkel = (tabu, tid) => (tabu ? "f" : "k") + tid;
  const somRekord = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.min(999, Math.floor(Number(n))) : 0);
  const rekord = (tabu, tid) => {
    const alle = rekorder();
    const k = rekordNokkel(tabu, tid);
    return Object.prototype.hasOwnProperty.call(alle, k) ? somRekord(alle[k]) : 0;
  };
  function settRekord(tabu, tid, n) {
    const alle = rekorder();
    const k = rekordNokkel(tabu, tid);
    if (n > 0) alle[k] = n;
    else delete alle[k];
    R.skriv(REKORD, alle);
  }
  // For the home screen: the record for the way the next game is set up, else the best of them all.
  function hjemRekord(S) {
    const o = S.oppsett;
    const her = rekord(o.tabu, o.tid);
    if (her) return her;
    const alle = rekorder();
    return Math.max(0, ...Object.keys(alle).map((k) => (/^[kf](45|60|90)$/.test(k) ? somRekord(alle[k]) : 0)));
  }
  const rekordTekst = (sp, n) => R.t("{n} ord på {tid} s", { n, tid: sp.tid });
  function domTekst(p, t) {
    const gruppe = TEKST.dommer.find((d) => p <= d.til) || TEKST.dommer[TEKST.dommer.length - 1];
    return gruppe.tekster[Math.floor((t || 0) * gruppe.tekster.length) % gruppe.tekster.length];
  }
  // Big word: the font shrinks with the longest word so it always fits on one line per word.
  // Several words get «flere»: on short phones they are set smaller next to the forbidden words.
  function ordHtml(o) {
    const deler = String(o).split(/\s+/);
    const lengste = Math.max(6, ...deler.map((d) => d.length));
    return `<span class="sk-ordet${deler.length > 1 ? " flere" : ""}" style="--tegn: ${lengste}">${esc(o)}</span>`;
  }

  // ---------- Team tokens: round blobs with eyes, one hairdo per team ----------

  const B = "#170e2b";
  const P = "#fff1dd";
  const PYNT = [
    `<path class="sk-pynt" d="M50 15 L32 4 Q27 15 32 26 Z M50 15 L68 4 Q73 15 68 26 Z"/><circle class="sk-pynt" cx="50" cy="15" r="6.5"/>`,
    `<path class="sk-pynt" d="M28 27 L33 4 L43 19 L50 -2 L57 19 L67 4 L72 27 Z"/>`,
    `<path d="M57 24 Q58 11 67 4" fill="none" stroke="${B}" stroke-width="4.5" stroke-linecap="round"/><circle class="sk-pynt" cx="68" cy="2" r="7.5"/>`,
    `<path d="M50 24 V9" fill="none" stroke="${B}" stroke-width="4.5" stroke-linecap="round"/><path class="sk-pynt" d="M50 12 Q37 -3 26 7 Q37 19 50 12Z M50 10 Q61 -7 75 1 Q64 16 50 10Z"/>`,
  ];
  function klump(lag, klasse) {
    const i = lag % 4;
    return `<span class="sk-klump ${klasse || ""}" style="--lf: ${R.LAG[i].farge}; --vent: ${(i * -1.37).toFixed(2)}s" aria-hidden="true"><svg viewBox="-4 -12 108 116" focusable="false">${PYNT[i]}<ellipse class="sk-kropp" cx="50" cy="58" rx="42" ry="38"/><path d="M21 46 Q26 32 40 27" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="6" stroke-linecap="round"/><g class="sk-oyne"><circle cx="35" cy="54" r="11.5" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="65" cy="54" r="11.5" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="37" cy="56" r="5.5" fill="${B}"/><circle cx="67" cy="56" r="5.5" fill="${B}"/></g><path d="M40 72 Q50 87 60 72 Z" fill="${B}" stroke="${B}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="20" cy="70" rx="6" ry="4" fill="rgba(255,79,139,.45)"/><ellipse cx="80" cy="70" rx="6" ry="4" fill="rgba(255,79,139,.45)"/></svg></span>`;
  }

  // ---------- The race track ----------
  // A winding road (straight rows joined by half circles) with one stepping stone per point.

  function geo(mal) {
    const rader = mal <= 20 ? 3 : mal <= 30 ? 4 : mal <= 40 ? 5 : 6;
    const x0 = 56;
    const x1 = 304;
    const r = rader <= 4 ? 34 : rader === 5 ? 31 : 28; // long tracks get tighter rows
    const topp = 40;
    const rad = x1 - x0;
    const bue = Math.PI * r;
    const lengde = rader * rad + (rader - 1) * bue;
    const H = topp * 2 + (rader - 1) * 2 * r + 12;
    function punkt(s) {
      for (let i = 0; i < rader; i++) {
        const y = topp + i * 2 * r;
        const mot = i % 2 === 0; // this row runs left to right
        if (s <= rad || i === rader - 1) {
          const d = Math.min(s, rad);
          return { x: mot ? x0 + d : x1 - d, y };
        }
        s -= rad;
        if (s <= bue) {
          const a = s / r;
          return { x: (mot ? x1 : x0) + (mot ? 1 : -1) * r * Math.sin(a), y: y + r - r * Math.cos(a) };
        }
        s -= bue;
      }
      return { x: x0, y: topp };
    }
    const felt = Array.from({ length: mal + 1 }, (_, k) => punkt((k / mal) * lengde));
    let d = `M${x0} ${topp}`;
    for (let i = 0; i < rader; i++) {
      const y = topp + i * 2 * r;
      const mot = i % 2 === 0;
      d += ` H${mot ? x1 : x0}`;
      if (i < rader - 1) d += ` A${r} ${r} 0 0 ${mot ? 1 : 0} ${mot ? x1 : x0} ${y + 2 * r}`;
    }
    return { H, felt, d };
  }

  const plass = (p, g) => `left: ${((p.x / 360) * 100).toFixed(3)}%; top: ${((p.y / g.H) * 100).toFixed(3)}%`;

  // fra: { lag: field } draws those tokens where they were before this turn (they hop forward after).
  function bane(sp, fra) {
    const g = geo(sp.mal);
    const ting = g.felt.map((p, k) => {
      if (k === 0) return `<circle class="sk-start" cx="${p.x}" cy="${p.y}" r="15"/><text class="sk-baneord" x="${p.x}" y="${p.y + 33}">${esc(R.t("START"))}</text>`;
      if (k === sp.mal)
        return `<circle class="sk-mal" cx="${p.x}" cy="${p.y}" r="19"/><text class="sk-pokal" x="${p.x}" y="${p.y + 6.5}">🏆</text><text class="sk-baneord" x="${p.x}" y="${p.y + 36}">${esc(R.t("MÅL"))}</text>`;
      const mile = k % 5 === 0;
      return `<circle class="sk-stein${mile ? " mile" : ""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${mile ? 12.5 : 9}"/>${
        mile ? `<text class="sk-steintall" x="${p.x.toFixed(1)}" y="${(p.y + 4.4).toFixed(1)}">${k}</text>` : ""
      }`;
    });
    const pos = sp.poeng.map((p, lag) => R.klamp(fra && fra[lag] != null ? fra[lag] : p, 0, sp.mal));
    // Tokens on the same field stand side by side (--side: steps left/right, in token widths).
    const brikker = pos.map((k, lag) => {
      const samme = pos.map((x, j) => (x === k ? j : -1)).filter((j) => j >= 0);
      const side = samme.indexOf(lag) - (samme.length - 1) / 2;
      return `<span class="sk-brikke" data-lag="${lag}" style="${plass(g.felt[k], g)}; --side: ${side}">${klump(lag)}</span>`;
    });
    const tekst = R.t("Løypa: {stilling}", { stilling: sp.poeng.map((p, i) => R.t("{lag} har {p} av {mal} poeng", { lag: lagNavn(i), p, mal: sp.mal })).join(", ") });
    return `<div class="sk-bane" style="aspect-ratio: 360 / ${g.H}; --bh: ${g.H}" role="img" aria-label="${esc(tekst)}">
      <svg viewBox="0 0 360 ${g.H}" aria-hidden="true" focusable="false"><path class="sk-vei-kant" d="${g.d}"/><path class="sk-vei" d="${g.d}"/><path class="sk-vei-linje" d="${g.d}"/>${ting.join("")}</svg>
      ${brikker.join("")}
    </div>`;
  }

  function stilling(sp) {
    const pluss = {};
    if (sp.sist) sp.sist.forEach((x) => (pluss[x.lag] = (pluss[x.lag] || 0) + x.poeng));
    return `<ul class="sk-stilling${sp.lag === 4 ? " fire" : ""}" style="--n: ${sp.lag}">${sp.poeng
      .map((p, i) => {
        const x = pluss[i];
        return `<li style="--lf: ${R.LAG[i].farge}">${klump(i)}<b>${p}</b><small>${esc(R.LAG[i].navn)}</small>${
          x ? `<span class="sk-pluss${x < 0 ? " minus" : ""}">${x > 0 ? "+" : "−"}${Math.abs(x)}</span>` : ""
        }</li>`;
      })
      .join("")}</ul>`;
  }

  // Hop the tokens that scored, field by field, with a rising little tune.
  const SKALA = [0, 2, 4, 7, 9];
  async function animer(S) {
    const sp = S.spill;
    const liste = sp && sp.flytt;
    if (!liste || !liste.length) return;
    sp.flytt = null;
    R.lagre();
    const g = geo(sp.mal);
    const fortsatt = R.vakt(); // stop if the players leave the track while it hops
    await R.vent(450);
    for (const f of liste) {
      if (!fortsatt()) return;
      const el = R.$(`.sk-brikke[data-lag="${f.lag}"]`);
      if (!el) return;
      const fra = R.klamp(f.fra, 0, sp.mal);
      const til = R.klamp(f.til, 0, sp.mal);
      el.classList.add("aktiv");
      el.style.setProperty("--side", "0");
      if (fra !== til && !R.rolig()) {
        const steg = til > fra ? 1 : -1;
        for (let k = fra + steg, n = 0; ; k += steg, n++) {
          if (!fortsatt() || !el.isConnected) return;
          el.setAttribute("style", `${plass(g.felt[k], g)}; --side: 0`);
          el.classList.remove("hopp");
          void el.offsetWidth;
          el.classList.add("hopp");
          const halvtoner = 12 * Math.floor(n / 5) + SKALA[n % 5];
          R.lyd.tone(330 * Math.pow(2, Math.min(halvtoner, 30) / 12), 0, 0.1, "triangle", 0.11);
          await R.vent(170);
          if (k === til) break;
        }
      }
      if (til >= sp.mal && sp.vinner === f.lag) {
        R.lyd.fanfare();
        R.konfetti(["--rosa", "--lampe", "--himmel", "--mynte"]);
      } else if (til >= sp.mal) R.lyd.riktig();
      else R.lyd.pop();
      R.vibrer(25);
      await R.vent(300);
    }
    if (fortsatt()) R.vis();
  }
  // A round that beat the phone's record is celebrated once, when the tokens have landed.
  function feirRekord(S) {
    const sp = S.spill;
    if (!sp || !sp.nyRekord || sp.nyRekord.feiret || S.skjerm !== "tavla") return;
    sp.nyRekord.feiret = true;
    R.lagre();
    R.si(R.t("Ny rekord! {rekord}.", { rekord: rekordTekst(sp, sp.nyRekord.ord) }));
    if (sp.vinner != null) return; // the winner's fanfare and confetti are already playing
    R.lyd.fanfare();
    R.konfetti(["--lampe", "--rosa", "--himmel", "--mynte"]);
  }
  // The record on the track screen: a line under the heading on tall phones, and a few words in
  // the small label on short ones (there is no room for another line there).
  function rekordLinjer(sp) {
    const ny = sp.nyRekord;
    const n = rekord(sp.tabu, sp.tid);
    if (ny) {
      return {
        kort: `<span class="sk-rekord-kort ny"> · ${esc(R.t("ny rekord: {n}!", { n: ny.ord }))}</span>`,
        linje: `<p class="sk-rekord ny"><span aria-hidden="true">★</span> ${esc(R.t("Ny rekord! {lag}: {rekord}", { lag: lagNavn(ny.lag), rekord: rekordTekst(sp, ny.ord) }))}</p>`,
      };
    }
    if (!n) return { kort: "", linje: "" };
    return {
      kort: `<span class="sk-rekord-kort"> · ${esc(R.t("rekord {n}", { n }))}</span>`,
      linje: `<p class="sk-rekord"><span aria-hidden="true">★</span> ${esc(R.t("Rekord: {rekord}", { rekord: rekordTekst(sp, n) }))}</p>`,
    };
  }

  // ---------- The clock ----------

  const klokke = () => R.timer("sk-tid");
  function lagKlokke(S) {
    const sp = S.spill;
    const r = sp.runde;
    const t = new R.Timer({
      id: "sk-tid",
      sekunder: Math.max(1, r.igjen),
      vedTikk: (sek) => {
        if (S.spill && S.spill.runde === r && !r.ute) {
          r.igjen = sek;
          R.lagre();
        }
      },
      vedSlutt: () => tidUte(S, r),
    });
    t.total = sp.tid; // the ring shows the whole round, also after a pause or reload
    return t;
  }
  function tidUte(S, r) {
    if (!S.spill || S.spill.runde !== r || r.ute) return;
    r.ute = true;
    r.igjen = 0;
    r.pause = false;
    R.si(R.t("Tiden er ute! Siste ord: alle lag kan gjette."));
    if (S.skjerm === "runde") R.vis();
    else R.lagre();
  }
  function pause(S) {
    const r = S.spill && S.spill.runde;
    if (!r || r.ute || r.pause) return;
    const t = klokke();
    if (t) {
      t.pause();
      r.igjen = Math.max(1, t.igjen);
    }
    r.pause = true;
    if (S.skjerm === "runde") R.vis();
  }
  function fortsettRunde(S) {
    const r = S.spill && S.spill.runde;
    if (!r || r.ute) return;
    r.pause = false;
    const t = klokke() || lagKlokke(S);
    R.vis();
    t.start();
    R.holdVaken();
  }
  // A phone that is locked or switches app in the middle of a round pauses it.
  document.addEventListener("visibilitychange", () => {
    const S = R.S;
    if (document.hidden && S && S.skjerm === "runde") pause(S);
  });

  // The opponents' horn: two short, low blasts.
  function tut() {
    [0, 0.2].forEach((t) => {
      R.lyd.tone(196, t, 0.16, "sawtooth", 0.15);
      R.lyd.tone(247, t, 0.16, "sawtooth", 0.12);
    });
  }
  // A red stamp across the word card while the horn sounds, then the card flies away.
  async function forbudtStempel() {
    const kort = R.$("#skjerm .storkort.sk-kort");
    if (!kort) return;
    kort.classList.add("sk-brudd");
    kort.insertAdjacentHTML("beforeend", `<span class="sk-brudd-stempel" aria-hidden="true">${esc(R.t("Forbudt!"))} <b>−1</b></span>`);
    await R.vent(R.rolig() ? 380 : 520);
  }

  // utfall: 1 = correct, 0 = skipped, −1 = the explainer said a forbidden word.
  async function svar(S, utfall, fraSveip) {
    const sp = S.spill;
    const r = sp && sp.runde;
    if (opptatt || !r || r.ute || r.pause) return;
    const w = ubesvart(r);
    if (!w) return;
    opptatt = true;
    w.s = utfall;
    if (utfall === 1) {
      R.lyd.riktig();
      R.vibrer(25);
      poppTeller = true;
    } else if (utfall === -1) {
      tut();
      R.vibrer([60, 40, 120]);
      R.si(R.t("Forbudt ord! Minus ett poeng."));
    } else R.vibrer(10);
    const fortsatt = R.vakt();
    try {
      if (utfall === -1) await forbudtStempel();
      // (Time may have run out during the stamp, or someone paused: then there is no word card to fly.)
      if (!fraSveip && !r.ute && !r.pause && fortsatt()) await R.kastKort(utfall === 1 ? 1 : -1);
      // The next word goes into the round even if the players left meanwhile (it resumes paused).
      if (!r.ute) nyttOrd(sp);
    } finally {
      opptatt = false;
    }
    if (fortsatt()) R.vis();
    else R.lagre();
  }

  // ---------- Pieces of the round screen ----------

  function status(sp, r) {
    const riktige = r.ord.filter((w) => w.s === 1).length;
    // Past the phone's record in the middle of the round: the counter turns gold.
    const rek = rekord(sp.tabu, sp.tid);
    const over = rek > 0 && riktige > rek;
    return `<div class="sk-status">
      ${R.ui.timer({ id: "sk-tid", sekunder: r.igjen })}
      <div class="sk-status-lag">${klump(r.lag)}<span><b>${esc(lagNavn(r.lag))}</b><small>${esc(R.t("gjetter"))}</small></span></div>
      <div class="sk-teller${poppTeller ? " popp" : ""}${over ? " rekord" : ""}" role="img" aria-label="${esc(over ? R.t("{n} riktige, over rekorden", { n: riktige }) : R.t("{n} riktige", { n: riktige }))}"><b>${riktige}</b><small>${over ? "★ " + esc(R.t("rekord")) : esc(R.t("riktige"))}</small></div>
    </div>`;
  }

  // The words the explainer may not say, as chips under the word («» when the word has no list).
  const storForbokstav = (t) => t.charAt(0).toLocaleUpperCase("nb") + t.slice(1);
  function forbudtHtml(w, klasse) {
    const liste = forbudtFor(w.o);
    if (!liste) return "";
    // Four words stand two and two (never three and one alone); a wide card puts them on one line.
    const rader = liste.length === 4 ? [liste.slice(0, 2), liste.slice(2)] : [liste];
    return `<span class="sk-tabu ${klasse || ""}"><span class="sk-tabu-tittel">${esc(R.t("Forbudt å si"))}</span><span class="sk-tabu-ord">${rader
      .map((rad) => `<span class="sk-tabu-rad">${rad.map((f) => `<b>${esc(storForbokstav(f))}</b>`).join("")}</span>`)
      .join("")}</span></span>`;
  }

  function uteVis(sp, r) {
    const w = ubesvart(r);
    // The last word is still explained, so its forbidden words stay in sight.
    const forbudte = w && sp.tabu ? forbudtHtml(w, "liten") : "";
    const topp = w
      ? `<div class="sk-ute">
          <h1 id="skjerm-tittel" class="stempel sk-stempel">${esc(R.t("Tiden er ute!"))}</h1>
          <div class="bunke"><article class="storkort sk-siste${forbudte ? " sk-med-forbudt" : ""}">
            <p class="etikett">${esc(R.t("Siste ord"))}</p>
            <p class="storkort-tekst">${ordHtml(w.o)}</p>
            ${forbudte}
            <p class="sk-siste-tekst">${esc(R.t("Nå kan alle lag gjette! Hvem tok det?"))}</p>
          </article></div>
        </div>`
      : `<div class="sk-ute"><h1 id="skjerm-tittel" class="stempel sk-stempel">${esc(R.t("Tiden er ute!"))}</h1><p class="ingress">${esc(R.t("Godt jobba! Nå sjekker vi ordene."))}</p></div>`;
    const knapper = w
      ? `<div class="sk-lagknapper k${sp.lag}">${sp.poeng
          .map(
            (_, i) =>
              `<button class="knapp sk-lagknapp" style="--f: ${R.LAG[i].farge}; --f-dyp: ${DYP[i]}" data-h="siste" data-v="${i}">${esc(lagNavn(i))}</button>`,
          )
          .join("")}<button class="knapp-2 sk-ingen" data-h="siste" data-v="-1">${esc(R.t("Ingen tok det"))}</button></div>`
      : R.ui.knapp(R.t("Se ordene"), "siste", { v: -1 });
    return topp + R.ui.dokk(knapper);
  }

  function pauseVis(r) {
    return `<div class="bunke"><article class="storkort sk-kort sk-pausekort">
        ${R.figur()}
        <h1 id="skjerm-tittel">${esc(R.t("Pause"))}</h1>
        <p class="sk-pause-tekst">${esc(R.t("Ordet er skjult. Fortsett når {lag} er klare.", { lag: lagNavn(r.lag) }))}</p>
      </article></div>
      ${R.ui.dokk(R.ui.knapp(R.t("Fortsett"), "fortsett-runde"), R.ui.lenkerad(R.ui.lenke(R.t("Avbryt runden"), "avbryt-runde"), R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
  }

  // ---------- Setup pieces ----------

  function katTekst(o) {
    if (!o.kat) return R.t("Alle {n} kategorier", { n: KAT.length });
    if (!o.kat.length) return R.t("Ingen valgt");
    if (o.kat.length <= 2) return o.kat.map((id) => katMedId(id).navn).join(" · ");
    return R.t("{n} av {alle} kategorier", { n: o.kat.length, alle: KAT.length });
  }
  // Why «Forbudte ord» can't be played with these categories and this level («» when it can).
  function forFaForbudt(o) {
    const n = tellForbudt(o);
    if (n >= MIN_FORBUDT) return "";
    const hva = temaFor(o.tema) ? R.t("Velg et annet nivå eller «Alle ord»") : o.kat ? R.t("Velg flere kategorier") : R.t("Velg et annet nivå");
    return R.t("«Forbudte ord» har bare {antall} her, og trenger minst {min}. {hva}.", { antall: R.flertall(n, "ord", "ord"), min: MIN_FORBUDT, hva });
  }
  function katInfo(o) {
    if (o.kat && !o.kat.length) return R.t("Velg minst én kategori.");
    if (o.tabu && forFaForbudt(o)) return forFaForbudt(o);
    const n = tellOrd(o);
    if (!n) return R.t("Velg minst én kategori.");
    const v = { n: R.tall(n), niva: niva(o.niva).navn.toLocaleLowerCase(R.lokale) };
    return o.tabu ? R.t("{n} ord med forbudte ord på nivå {niva}.", v) : R.t("{n} ord på nivå {niva}.", v);
  }
  function katArk(S) {
    const o = S.oppsett;
    const valgt = o.kat || KAT.map((k) => k.id);
    return `<h2 id="ark-tittel">${esc(R.t("Velg kategorier"))}</h2>
      <p class="ingress" id="sk-katinfo">${esc(katInfo(o))}</p>
      ${R.ui.brikker(
        "kat",
        KAT.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: tellKat(k.id, o.niva, o.tabu) })),
        valgt,
        { alle: true, etikett: R.t("Kategorier") },
      )}
      <button class="knapp" data-h="kat-ferdig"${valgt.length ? "" : " disabled"}>${esc(R.t("Ferdig"))}</button>`;
  }

  // ---------- Podium with team blobs (the kit's pall shows plain dots for teams) ----------

  // Same rules as R.ui.pall (teams without points stay off, equal points share a place),
  // but with the team blobs instead of plain dots.
  function pall(sp) {
    const alle = sp.poeng.map((poeng, lag) => ({ lag, poeng })).filter((x) => x.poeng > 0).sort((a, b) => b.poeng - a.poeng);
    if (alle.length < 2) return "";
    const rang = (x) => 1 + alle.filter((y) => y.poeng > x.poeng).length;
    const plass = (x) => {
      if (!x) return "<div></div>";
      const n = rang(x);
      return `<div class="pall-plass p${Math.min(n, 3)}">${klump(x.lag, "stor")}<span class="navn">${esc(lagNavn(x.lag))}</span><span class="poeng">${x.poeng} ${esc(R.t("p"))}</span><span class="blokk">${n}</span></div>`;
    };
    return `<div class="pall sk-pall" aria-label="${esc(R.t("Pallen"))}">${plass(alle[1])}${plass(alle[0])}${plass(alle[2])}</div>`;
  }
  // The kit's score list (same markup and classes), with the team blobs instead of plain dots.
  function lagListe(sp) {
    const rader = sp.poeng.map((poeng, lag) => ({ lag, poeng })).sort((a, b) => b.poeng - a.poeng);
    const topp = rader[0].poeng;
    return `<ol class="poengliste sk-liste">${rader
      .map(
        (x, n) =>
          `<li class="${x.poeng === topp && topp > 0 ? "leder" : ""}"><span class="plass-nr">${n + 1}</span>${klump(x.lag)}<span class="navn">${esc(lagNavn(x.lag))}</span><span class="sum">${x.poeng}</span></li>`,
      )
      .join("")}</ol>`;
  }
  // Everyone sharing the top (empty when nobody has points).
  function ledere(sp) {
    const maks = Math.max(...sp.poeng);
    return maks > 0 ? sp.poeng.map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0) : [];
  }
  // The single leader, or null when the top is shared.
  function leder(sp) {
    const maks = Math.max(...sp.poeng);
    return sp.poeng.filter((p) => p === maks).length === 1 ? sp.poeng.indexOf(maks) : null;
  }

  // ---------- Counting a round, and ending the game ----------

  // The round is over and checked: add the points, remember what to animate, advance the turn and
  // look for a winner. Everything it changes is kept in sp.angre, so «Angre» can put it back.
  function brukRunde(sp) {
    const r = sp.runde;
    sp.angre = JSON.parse(JSON.stringify({ runde: r, poeng: sp.poeng, stat: sp.stat, tur: sp.tur, malgang: sp.malgang, uavgjort: sp.uavgjort, vinner: sp.vinner, sist: sp.sist, nyRekord: null }));
    sp.angreRekord = null;
    const p = rundePoeng(sp, r);
    const sist = ubesvart(r);
    const fra = sp.poeng.slice();
    sp.poeng[r.lag] = Math.max(0, sp.poeng[r.lag] + p);
    const flytt = [{ lag: r.lag, fra: fra[r.lag], til: sp.poeng[r.lag] }];
    sp.sist = [{ lag: r.lag, poeng: sp.poeng[r.lag] - fra[r.lag] }];
    if (sist && r.siste >= 0 && r.siste !== r.lag) {
      sp.poeng[r.siste] += 1;
      flytt.push({ lag: r.siste, fra: fra[r.siste], til: sp.poeng[r.siste] });
      sp.sist.push({ lag: r.siste, poeng: 1 });
    }
    sp.sist = sp.sist.filter((x) => x.poeng !== 0);
    const riktige = rundeRiktige(r);
    sp.stat.riktig[r.lag] += riktige;
    sp.stat.hopp[r.lag] += r.ord.filter((w) => w.s === 0).length;
    sp.stat.forbudt = (sp.stat.forbudt || 0) + r.ord.filter((w) => w.s === -1).length;
    if (!sp.stat.beste || riktige > sp.stat.beste.ord) sp.stat.beste = { lag: r.lag, ord: riktige };
    r.ord.forEach((w) => {
      if (w.s === 0) sp.stat.hoppet.push(w.o);
    });
    sp.stat.hoppet = sp.stat.hoppet.slice(-40);
    // The phone's record for this time setting. The very first round only sets it; from then on
    // a better round is «Ny rekord!». (sp.angreRekord lets «Angre» put the old record back.)
    const gml = rekord(sp.tabu, sp.tid);
    sp.nyRekord = null;
    if (riktige > gml) {
      settRekord(sp.tabu, sp.tid, riktige);
      sp.angreRekord = { gml };
      if (gml > 0) {
        sp.nyRekord = { lag: r.lag, ord: riktige };
        sp.stat.rekord = true;
      }
    }
    sp.flytt = flytt.filter((f) => f.fra !== f.til);
    sp.runde = null;
    sp.tur += 1;
    sp.uavgjort = false;
    if (sp.poeng.some((x) => x >= sp.mal)) sp.malgang = true;
    if (sp.malgang && sp.tur % sp.lag === 0) {
      const v = leder(sp);
      if (v != null) sp.vinner = v;
      else sp.uavgjort = true;
    }
  }

  // The game is over (exactly once per game): the evening's scoreboard and the statistics get it.
  function avsluttSpill(S, tidlig) {
    const sp = S.spill;
    if (!sp || sp.ferdig) return;
    sp.ferdig = true;
    sp.angre = null;
    sp.angreRekord = null;
    sp.flytt = null;
    feireNa = true;
    R.statistikk("ferdig", {
      lag: sp.lag,
      runder: Math.ceil(sp.tur / sp.lag),
      riktige: sp.stat.riktig.reduce((a, b) => a + b, 0),
      forbudt: !!sp.tabu,
      tidlig: !!tidlig,
      rekord: !!sp.stat.rekord,
    });
    R.kveld.registrer(sp.poeng.map((poeng, lag) => ({ lag, poeng })));
  }

  // What «Del kåringen» sends: who won, the score and the best round. No link in the text.
  function delTekst(sp) {
    const topp = ledere(sp);
    const andre = sp.poeng.map((p, i) => ({ p, i })).filter((x) => !topp.includes(x.i)).sort((a, b) => b.p - a.p);
    let tekst;
    if (topp.length === 1) {
      tekst =
        sp.lag === 2
          ? R.t("{lag} vant {a}–{b} over {andre}", { lag: lagNavn(topp[0]), a: sp.poeng[topp[0]], b: andre[0].p, andre: lagNavn(andre[0].i) })
          : R.t("{lag} vant med {p} poeng, foran {andre}", { lag: lagNavn(topp[0]), p: sp.poeng[topp[0]], n: sp.poeng[topp[0]], andre: liste(andre.map((x) => `${lagNavn(x.i)} (${x.p})`)) });
    } else tekst = R.t("{lag} delte seieren med {p} poeng", { lag: liste(topp.map(lagNavn)), p: sp.poeng[topp[0]], n: sp.poeng[topp[0]] });
    const spill = (window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Skravla";
    tekst = sp.tabu ? R.t("{spill} med forbudte ord: {tekst}.", { spill, tekst }) : R.t("{spill}: {tekst}.", { spill, tekst });
    const beste = sp.stat.beste;
    if (beste && beste.ord > 0) {
      const v = { rekord: rekordTekst(sp, beste.ord) };
      tekst += " " + (sp.stat.rekord ? R.t("Beste runde: {rekord} – ny rekord! Klarer dere flere?", v) : R.t("Beste runde: {rekord}. Klarer dere flere?", v));
    }
    return tekst;
  }

  // ---------- The game ----------

  R.start({
    id: "skravla",
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also those with the game's own buttons in them
    pagar, // a game is running until the end screen (front-page badge, wake lock)

    tilstand: () => ({
      oppsett: { lag: 2, tid: 60, mal: 30, niva: 2, kat: null, tema: "", tabu: false, straff: false },
      spill: null,
    }),

    // Repair saved settings and drop a saved game that doesn't fit this version.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ lag: 2, tid: 60, mal: 30, niva: 2, kat: null, tema: "", tabu: false, straff: false }, S.oppsett));
      if (![2, 3, 4].includes(o.lag)) o.lag = 2;
      if (!TIDER.includes(o.tid)) o.tid = 60;
      if (!MAL.includes(o.mal)) o.mal = 30;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (o.kat != null) {
        o.kat = Array.isArray(o.kat) ? o.kat.filter((id) => katMedId(id)) : null;
        if (o.kat && (!o.kat.length || o.kat.length === KAT.length)) o.kat = null;
      }
      o.tema = temaFor(o.tema) ? o.tema : "";
      o.tabu = !!o.tabu;
      o.straff = !!o.straff;
      const sp = S.spill;
      if (!sp) return;
      const ok =
        [2, 3, 4].includes(sp.lag) &&
        Array.isArray(sp.poeng) &&
        sp.poeng.length === sp.lag &&
        sp.stat &&
        Array.isArray(sp.stat.riktig) &&
        MAL.includes(sp.mal) &&
        TIDER.includes(sp.tid);
      if (!ok) {
        S.spill = null;
        return;
      }
      // Fields that came later (a game saved by an older version of Skravla keeps working).
      sp.tabu = !!sp.tabu;
      sp.tema = temaFor(sp.tema) ? sp.tema : "";
      sp.stat.forbudt = Number(sp.stat.forbudt) || 0;
      if (!Array.isArray(sp.stat.hopp)) sp.stat.hopp = Array(sp.lag).fill(0);
      if (!Array.isArray(sp.stat.hoppet)) sp.stat.hoppet = [];
      if (!(sp.nyRekord && typeof sp.nyRekord === "object" && sp.nyRekord.ord > 0 && sp.nyRekord.lag < sp.lag)) sp.nyRekord = null;
      if (!(sp.angre && sp.angreRekord && typeof sp.angreRekord === "object")) sp.angreRekord = null;
      if (sp.runde && !(Array.isArray(sp.runde.ord) && sp.runde.ord.length && sp.runde.lag < sp.lag)) sp.runde = null;
      if (sp.runde) sp.runde.ord.forEach((w) => (w.s = [1, 0, -1].includes(w.s) ? w.s : null));
      if (!sp.runde && (sp.skjerm === "runde" || sp.skjerm === "sjekk")) sp.skjerm = "tavla";
    },

    // rusj.no/skravla/#jul opens «Gjør klart» with the Christmas words chosen (not in the middle of a game).
    vedHash(S, hash) {
      const id = String(hash || "").trim().toLowerCase();
      if (!temaFor(id) || pagar(S)) return null;
      S.oppsett.tema = id;
      return "oppsett";
    },

    regler: {
      intro: R.t("Lag mot lag: én forklarer, resten av laget gjetter. Hvert riktige ord flytter brikken ett felt nærmere mål."),
      steg: [
        [R.t("Forklar"), R.t("Få laget ditt til å si ordet på skjermen – uten å si selve ordet eller deler av det.")],
        [R.t("Riktig eller hopp over"), R.t("Trykk «Riktig ✓» når laget gjetter ordet, eller «Hopp over». Du kan også sveipe kortet: høyre er riktig, venstre er hopp.")],
        [R.t("Flytt brikken"), R.t("Når tiden er ute, retter dere feil og flytter brikken. Først i mål vinner – men alle lag får like mange runder.")],
      ],
      tips: [
        R.t("Siste ord når tiden er ute: alle lag kan gjette. Laget som tar det, får poenget."),
        R.t("Ikke lov: peke på ting, rime, si ordet på engelsk eller «det begynner på …»."),
        R.t("Forbudte ord: under ordet står ordene alle ville sagt først. De er forbudt, i alle former. En motstander følger med over skulderen og trykker «Forbudt ord!» når det glipper – da ryker ordet og ett poeng."),
        R.t("Trykket noen feil? Rett det i lista etter runden."),
        R.t("Bytt forklarer hver runde, så alle får prøve seg."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const best = hjemRekord(S);
          return R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Forklar ordet – uten å si det."))}<br><em>${esc(R.t("Første lag i mål vinner."))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n}", { n: rundeNr(S.spill) }) : "",
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            // The record (most words in one round) takes the place of «0 reklame» once there is one.
            merker: [["2–4", R.t("lag")], [R.tall(ALLE.length), R.t("ord")], best ? [String(best), R.t("rekord")] : ["0", R.t("reklame")]],
          });
        },
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const antall = tellOrd(o);
          // «Forbudte ord» only draws words that have a list of forbidden words. With too few of
          // them in the chosen categories the tile is greyed — or, if the mode is already on,
          // «Start» waits — and a line says why.
          const forFa = forFaForbudt(o);
          const temaer = Object.keys(TEMA).map((id) => TEMA[id]);
          const valgtTema = temaFor(o.tema);
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
            <h2>${esc(R.t("Hvordan spiller dere?"))}</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "klassisk", tittel: R.t("Klassisk"), tekst: R.t("Forklar ordet med egne ord"), ikon: "💬" },
                { v: "tabu", tittel: R.t("Forbudte ord"), tekst: R.t("De opplagte ordene er forbudt"), ikon: "🚫", av: !!forFa && !o.tabu },
              ],
              o.tabu ? "tabu" : "klassisk",
            )}
            ${forFa ? `<p class="hjelp${o.tabu ? " sk-advarsel" : ""}" id="sk-forfa">${esc(forFa)}</p>` : ""}
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Hvor mange lag?"))}</h2>
              ${R.ui.seg("lag", [2, 3, 4].map((n) => [n, R.t("{n} lag", { n })]), o.lag, { etikett: R.t("Antall lag") })}
              <ul class="sk-lagrad" aria-label="${esc(R.t("Lagene"))}">${Array.from({ length: o.lag }, (_, i) => `<li>${klump(i)}<span>${esc(R.LAG[i].navn)}</span></li>`).join("")}</ul>
              <p class="hjelp">${esc(R.t("Del dere i lag som sitter sammen. Én forklarer, resten av laget gjetter."))}</p>
            </section>
            <div class="sk-to">
              <section class="seksjon"><h2>${esc(R.t("Tid per runde"))}</h2>${R.ui.seg("tid", TIDER.map((t) => [t, `${t} s`]), o.tid, { etikett: R.t("Tid per runde") })}</section>
              <section class="seksjon"><h2>${esc(R.t("Først til"))}</h2>${R.ui.seg("mal", MAL.map((m) => [m, String(m)]), o.mal, { etikett: R.t("Poeng for å vinne") })}</section>
            </div>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>${esc(R.t("Ordene"))}</h2><span class="tall">${esc(R.flertall(antall, "ord", "ord"))}</span></div>
              ${temaer.length ? R.ui.seg("tema", [["", R.t("Alle ord")], ...temaer.map((x) => [x.id, `${x.ikon} ${x.navn}`.trim()])], o.tema || "", { etikett: R.t("Tema") }) : ""}
              ${R.ui.seg("niva", NIVAER.map((n) => [n.v, n.navn]), o.niva, { etikett: R.t("Vanskelighet") })}
              <p class="hjelp">${esc(niva(o.niva).tekst)}</p>
              ${
                valgtTema
                  ? `<div class="sk-katknapp sk-temaboks"><span class="sk-katikon" aria-hidden="true">${esc(valgtTema.ikon)}</span><span><b>${esc(valgtTema.tekst || valgtTema.navn)}</b><small>${esc(R.t("Bare ord fra temaet. Kategoriene hviler."))}</small></span></div>`
                  : `<button class="sk-katknapp" data-h="kategorier"><span class="sk-katikon" aria-hidden="true">🗂️</span><span><b>${esc(R.t("Kategorier"))}</b><small>${esc(katTekst(o))}</small></span><i>${esc(R.t("Endre"))}</i></button>`
              }
            </section>
            ${R.ui.bryter("straff", o.straff, R.t("Hopp over koster ett poeng"), R.t("For dem som liker det tøft."))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { av: !antall || (o.tabu && !!forFa) }))}`;
        },
      },

      // The race track, and who explains next (this is also the pass-the-phone screen).
      tavla: {
        tittel: (S) => (S.spill.vinner != null ? R.t("I mål!") : R.t("Runde {n}", { n: rundeNr(S.spill) })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const fra = {};
          (sp.flytt || []).forEach((f) => {
            if (fra[f.lag] == null) fra[f.lag] = f.fra;
          });
          const topp = bane(sp, fra) + stilling(sp);
          const rek = rekordLinjer(sp);
          if (sp.vinner != null) {
            return `${topp}
              <div class="sk-neste vunnet" style="--lf: ${R.LAG[sp.vinner].farge}">
                <p class="etikett">${esc(R.t("Først i mål"))}${sp.nyRekord ? rek.kort : ""}</p>
                <h1 id="skjerm-tittel">${R.t("{lag} vinner!", { lag: `<span>${esc(lagNavn(sp.vinner))}</span>`, n: 1 })}</h1>
                ${sp.nyRekord ? rek.linje : ""}
                <p class="sk-neste-tekst">${esc(R.t("{p} poeng. Klare for kåringen?", { p: sp.poeng[sp.vinner], n: sp.poeng[sp.vinner] }))}</p>
              </div>
              ${R.ui.dokk(R.ui.knapp(R.t("Til kåringen"), "kar"), sp.angre ? R.ui.lenkerad(R.ui.lenke(R.t("Angre"), "angre-flytt")) : "")}`;
          }
          const neste = sp.tur % sp.lag;
          const imal = sp.poeng.map((p, i) => (p >= sp.mal ? lagNavn(i) : null)).filter(Boolean);
          // The explanation after «… er i mål!» is left out on short phones (the rules have it too).
          let melding = "";
          if (sp.uavgjort) melding = esc(R.t("Likt på toppen! Én runde til."));
          else if (imal.length) melding = `🏁 ${esc(R.t("{lag} er i mål!", { lag: liste(imal), n: imal.length }))}<span class="sk-melding-mer"> ${esc(R.t("Alle lag får like mange forsøk."))}</span>`;
          const etikett = sp.tur === 0 ? R.t("Først ut") : imal.length && !sp.uavgjort ? R.t("Siste runde") : R.t("Neste lag");
          return `${topp}
            <div class="sk-neste" style="--lf: ${R.LAG[neste].farge}">
              ${melding ? `<p class="sk-melding">${melding}</p>` : ""}
              <p class="etikett">${esc(etikett)}${rek.kort}</p>
              <h1 id="skjerm-tittel">${R.t("<span>{lag}:</span> hvem forklarer?", { lag: esc(lagNavn(neste)) })}</h1>
              ${rek.linje}
              <p class="sk-neste-tekst">${esc(
                sp.tabu ? R.t("Den som forklarer, tar mobilen. En motstander følger med på de forbudte ordene.") : R.t("Den som forklarer, tar mobilen. Resten av laget gjetter."),
              )}</p>
            </div>
            ${R.ui.dokk(
              R.ui.knapp(R.t("Start runden – {lag}", { lag: lagNavn(neste) }), "start-runde"),
              R.ui.lenkerad(sp.angre ? R.ui.lenke(R.t("Angre"), "angre-flytt") : "", R.ui.lenke(R.t("Avslutt"), "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "tavla";
          const fortsatt = R.vakt();
          animer(S).then(() => fortsatt() && feirRekord(S));
        },
      },

      runde: {
        tittel: (S) => R.t("Runde {n}", { n: rundeNr(S.spill) }),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          if (r.ute) return uteVis(sp, r);
          if (r.pause || (!startetNa && !klokke())) return status(sp, r) + pauseVis(r);
          const w = ubesvart(r);
          const k = katMedId(w.k);
          const forbudte = sp.tabu ? forbudtHtml(w) : "";
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(R.t("{lag} gjetter", { lag: lagNavn(r.lag) }))}</h1>
            ${status(sp, r)}
            <div style="--bunke: ${R.LAG[r.lag].farge}">${R.ui.storkort({
              etikett: k ? `${k.ikon} ${k.navn}` : R.t("Forklar"),
              nr: `#${r.ord.length}`,
              tekstHtml: ordHtml(w.o),
              fotHtml: forbudte || (r.ord.length === 1 ? `<span class="sk-hint">${esc(R.t("Forklar – uten å si ordet!"))}</span>` : ""),
              klasse: "sk-kort " + KORTFARGE[r.lag] + (forbudte ? " sk-med-forbudt" : ""),
              sveip: "sveip",
            })}</div>
            <p class="sveip-hint" aria-hidden="true">← ${esc(R.t("Hopp over"))} · ${esc(R.t("Riktig"))} →</p>
            ${R.ui.dokk(
              `<div class="sk-svarknapper">${R.ui.knapp(R.t("Hopp over"), "hopp", { variant: "papir", stille: true })}${R.ui.knapp(R.t("Riktig") + " ✓", "riktig", { variant: "mynte", stille: true })}</div>`,
              // The opponents' button sits between the two links: a red pill, out of the explainer's way.
              R.ui.lenkerad(
                r.ord.length > 1 ? R.ui.lenke(R.t("Angre"), "angre-ord") : "",
                sp.tabu ? `<button class="sk-buzz" data-h="forbudt" data-stille aria-label="${esc(R.t("Forbudt ord sagt: minus ett poeng"))}">${esc(R.t("Forbudt ord!"))} <b aria-hidden="true">−1</b></button>` : "",
                R.ui.lenke(R.t("Pause"), "pause"),
              ),
            )}`;
        },
        etter() {
          poppTeller = false;
          const t = klokke();
          if (t) t.tegn();
        },
        inn(S) {
          const sp = S.spill;
          const r = sp.runde;
          sp.skjerm = "runde";
          const fersk = startetNa;
          startetNa = false;
          if (r.ute) return;
          const t = lagKlokke(S);
          if (fersk && !r.pause) {
            t.start();
            R.holdVaken();
          } else {
            r.pause = true;
            R.vis();
          }
        },
        ut(S) {
          const r = S.spill && S.spill.runde;
          const t = klokke();
          if (r && t && !r.ute) {
            r.igjen = Math.max(1, t.igjen);
            r.pause = true;
          }
        },
      },

      // After the round: fix mistakes, then move the token.
      sjekk: {
        tittel: R.t("Sjekk ordene"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const p = rundePoeng(sp, r);
          const sist = ubesvart(r);
          const besvart = r.ord.filter((w) => w.s !== null);
          const stjeler = sist && r.siste >= 0 && r.siste !== r.lag ? r.siste : null;
          // The record follows the list as it is corrected; it is only written when the token moves.
          const riktige = rundeRiktige(r);
          const gml = rekord(sp.tabu, sp.tid);
          const rekordHtml =
            gml && riktige > gml
              ? `<p class="sk-rekord ny"><span aria-hidden="true">★</span> ${esc(R.t("Ny rekord! {rekord}", { rekord: rekordTekst(sp, riktige) }))}</p>`
              : gml
                ? `<p class="sk-rekord"><span aria-hidden="true">★</span> ${esc(R.t("Rekord: {rekord}", { rekord: rekordTekst(sp, gml) }))}</p>`
                : "";
          return `
            <div class="sk-resultat" style="--lf: ${R.LAG[r.lag].farge}">
              ${klump(r.lag, "stor")}
              <p class="etikett">${esc(R.t("{lag} fikk", { lag: lagNavn(r.lag) }))}</p>
              <h1 id="skjerm-tittel">${R.t("{tall} poeng", { tall: `<b>${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}</b>`, n: Math.abs(p) })}</h1>
              <p class="sk-dom">${esc(domTekst(p, r.tilfeldig))}</p>
              ${rekordHtml}
            </div>
            ${
              besvart.length
                ? `<section class="seksjon">
                    <div class="seksjon-hode"><h2>${esc(R.t("Ordene"))}</h2><span class="tall">${esc(R.t("Trykk for å rette"))}</span></div>
                    <ul class="sk-ordliste">${r.ord
                      .map((w, i) =>
                        w.s === null
                          ? ""
                          : `<li><button class="sk-ord${w.s === -1 ? " brudd" : ""}" data-h="veksle" data-v="${i}" aria-pressed="${w.s === 1}"><i aria-hidden="true">${
                              w.s === 1 ? "✓" : w.s === -1 ? "✕" : "↷"
                            }</i><span>${esc(w.o)}</span><small>${w.s === 1 ? "+1" : w.s === -1 ? esc(R.t("forbudt ord")) + " −1" : sp.straff ? "−1" : esc(R.t("hoppet over"))}</small></button></li>`,
                      )
                      .join("")}</ul>
                  </section>`
                : `<p class="hjelp">${esc(R.t("Ingen ord ble forklart denne runden."))}</p>`
            }
            ${
              sist
                ? `<section class="seksjon sk-sisteord">
                    <div class="seksjon-hode"><h2>${esc(R.t("Siste ord: {ord}", { ord: sist.o }))}</h2></div>
                    ${R.ui.seg("siste-endre", [[-1, R.t("Ingen")], ...sp.poeng.map((_, i) => [i, R.LAG[i].navn])], r.siste, { etikett: R.t("Hvem tok siste ord?") })}
                    ${stjeler != null ? `<p class="hjelp">${esc(R.t("+1 til {lag} for siste ord.", { lag: lagNavn(stjeler) }))}</p>` : ""}
                  </section>`
                : ""
            }
            ${R.ui.dokk(R.ui.knapp(p > 0 ? R.t("Flytt {n} felt fram", { n: p }) : R.t("Videre til løypa"), "flytt"), R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          S.spill.skjerm = "sjekk";
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const topp = ledere(sp);
          const sumRiktig = sp.stat.riktig.reduce((a, b) => a + b, 0);
          const sumHopp = sp.stat.hopp.reduce((a, b) => a + b, 0);
          const hoppet = Array.from(new Set(sp.stat.hoppet)).slice(-12);
          const sorter = sp.poeng.slice().sort((a, b) => b - a);
          const margin = sorter[0] - sorter[1];
          const runder = Math.max(1, Math.ceil(sp.tur / sp.lag));
          const beste = sp.stat.beste && sp.stat.beste.ord > 0 ? sp.stat.beste : null;
          const rek = rekord(sp.tabu, sp.tid);
          let figur = R.ui.figur(null, { stemning: "lei" });
          let etikett = R.t("Ingen vinner");
          let tittel = R.t("Ingen fikk poeng");
          let ingress = R.t("Neste gang tar dere av!");
          if (topp.length === 1) {
            figur = klump(topp[0], "gigant");
            etikett = TEKST.vinnere[(sp.fro >>> 0) % TEKST.vinnere.length];
            tittel = R.t("{lag} vinner!", { lag: lagNavn(topp[0]), n: 1 });
            ingress = R.t("{p} poeng – {margin} foran nærmeste lag.", { p: sp.poeng[topp[0]], n: sp.poeng[topp[0]], margin });
          } else if (topp.length > 1) {
            figur = `<span class="sk-delt">${topp.map((i) => klump(i, "stor")).join("")}</span>`;
            etikett = R.t("Delt seier");
            tittel = R.t("{lag} vinner!", { lag: liste(topp.map(lagNavn)), n: topp.length });
            ingress = R.t("Likt på {p} poeng. Godt jobba!", { p: sp.poeng[topp[0]], n: sp.poeng[topp[0]] });
          }
          return `
            <div class="banner sk-banner"${topp.length === 1 ? ` style="--lf: ${R.LAG[topp[0]].farge}"` : ""}>
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${esc(ingress)}</p>
            </div>
            ${topp.length ? pall(sp) + lagListe(sp) + `<div class="sk-del">${R.ui.knapp2(R.t("Del kåringen"), "del")}</div>` : ""}
            <ul class="sk-fakta">
              <li><b>${sumRiktig}</b><span>${esc(R.t("ord forklart", { n: sumRiktig }))}</span></li>
              <li><b>${sumHopp}</b><span>${esc(R.t("hoppet over", { n: sumHopp }))}</span></li>
              ${
                sp.tabu
                  ? `<li><b>${sp.stat.forbudt || 0}</b><span>${esc((sp.stat.forbudt || 0) === 1 ? R.t("forbudt ord sagt") : R.t("forbudte ord sagt"))}</span></li>`
                  : `<li><b>${runder}</b><span>${esc(runder === 1 ? R.t("runde") : R.t("runder"))}</span></li>`
              }
            </ul>
            ${
              beste
                ? `<p class="hjelp${sp.stat.rekord ? " sk-rekordlinje" : ""}">${esc(
                    sp.stat.rekord
                      ? R.t("Beste runde: {lag} med {n} ord – ny rekord på {tid} s!", { lag: lagNavn(beste.lag), n: beste.ord, tid: sp.tid })
                      : rek > beste.ord
                        ? R.t("Beste runde: {lag} med {n} ord. Rekorden på {tid} s er {rekord}.", { lag: lagNavn(beste.lag), n: beste.ord, tid: sp.tid, rekord: rek })
                        : R.t("Beste runde: {lag} med {n} ord.", { lag: lagNavn(beste.lag), n: beste.ord }),
                  )}</p>`
                : ""
            }
            ${
              hoppet.length
                ? `<section class="seksjon"><h2>${esc(R.t("Ordene dere hoppet over"))}</h2><p class="hjelp sk-venstre">${esc(R.t("Klarer dere å forklare dem nå?"))}</p><ul class="sk-hoppet">${hoppet
                    .map((o) => `<li>${esc(o)}</li>`)
                    .join("")}</ul></section>`
                : ""
            }
            ${R.ui.flereSpill({ antall: Math.max(4, sp.lag * 2) })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "nytt"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          // The actions that end a game («Til kåringen», «Avslutt») have already closed it and
          // reported it; this only catches a game that got here some other way.
          if (!sp.ferdig) avsluttSpill(S, false);
          const forste = feireNa;
          feireNa = false;
          sp.skjerm = "slutt";
          R.slippVaken();
          R.lagre();
          if (!forste) return;
          if (ledere(sp).length) {
            R.lyd.fanfare();
            R.konfetti(["--rosa", "--lampe", "--himmel", "--mynte", "--aksent"]);
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      // A running game is only thrown away after the player confirms.
      async nytt(el, e, S) {
        const iGang = pagar(S);
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(iGang)) || !fortsatt()) return;
        if (iGang) {
          S.spill = null;
          R.slippVaken();
        }
        R.gaTil("oppsett");
      },
      fortsett(el, e, S) {
        if (!pagar(S)) return;
        const mal = S.spill.skjerm;
        R.holdVaken();
        R.gaTil(["runde", "sjekk"].includes(mal) && S.spill.runde ? mal : "tavla");
      },
      // While a round runs, the rules sheet pauses the clock first.
      regler(el, e, S) {
        if (S.skjerm === "runde") pause(S);
        R.visRegler();
      },
      modus(el, e, S) {
        S.oppsett.tabu = el.dataset.v === "tabu";
        R.vis();
      },
      // «Alle ord» or a theme (the theme takes the place of the categories).
      tema(el, e, S) {
        S.oppsett.tema = temaFor(el.dataset.v) ? el.dataset.v : "";
        R.vis();
      },
      // Share the result with the phone's share sheet (or copy it).
      del(el, e, S) {
        if (S.spill && S.spill.ferdig) R.del((window.RUSJ_SPILL && window.RUSJ_SPILL.navn) || "Skravla", delTekst(S.spill), location.origin + R.forside + ((R.sprak !== "nb" && window.RUSJ_SPILL && window.RUSJ_SPILL.slug) || "skravla") + "/");
      },
      lag(el, e, S) {
        S.oppsett.lag = Number(el.dataset.v);
        R.vis();
      },
      tid(el, e, S) {
        S.oppsett.tid = Number(el.dataset.v);
        R.vis();
      },
      mal(el, e, S) {
        S.oppsett.mal = Number(el.dataset.v);
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = Number(el.dataset.v);
        R.vis();
      },
      straff(el, e, S) {
        S.oppsett.straff = !S.oppsett.straff;
        R.vis();
      },
      kategorier: (el, e, S) => R.ark(katArk(S)),
      // Toggle a category in the sheet. The sheet is updated in place so it keeps its scroll.
      kat(el, e, S) {
        const o = S.oppsett;
        const v = el.dataset.v;
        const alle = KAT.map((k) => k.id);
        let valgt = o.kat ? o.kat.slice() : alle.slice();
        if (v === "*") valgt = valgt.length === alle.length ? [] : alle.slice();
        else valgt = valgt.includes(v) ? valgt.filter((x) => x !== v) : [...valgt, v];
        o.kat = valgt.length === alle.length ? null : valgt;
        R.$$('#ark [data-h="kat"]').forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.v === "*" ? valgt.length === alle.length : valgt.includes(b.dataset.v))),
        );
        const info = R.$("#sk-katinfo");
        if (info) info.textContent = katInfo(o);
        const ferdig = R.$('#ark [data-h="kat-ferdig"]');
        if (ferdig) ferdig.disabled = !valgt.length;
        R.vis();
      },
      "kat-ferdig": () => R.lukkArk(),
      async start(el, e, S) {
        const o = S.oppsett;
        if (!tellOrd(o) || (o.tabu && forFaForbudt(o))) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = {
          lag: o.lag,
          tid: o.tid,
          mal: o.mal,
          niva: o.niva,
          kat: o.kat ? o.kat.slice() : null,
          tema: o.tema || "",
          tabu: o.tabu,
          straff: o.straff,
          poeng: Array(o.lag).fill(0),
          tur: 0,
          malgang: false,
          uavgjort: false,
          vinner: null,
          ferdig: false,
          runde: null,
          flytt: null,
          angre: null,
          angreRekord: null,
          nyRekord: null,
          sist: null,
          skjerm: "tavla",
          fro: R.nyttFro(),
          stat: { riktig: Array(o.lag).fill(0), hopp: Array(o.lag).fill(0), forbudt: 0, beste: null, hoppet: [], rekord: false },
        };
        R.statistikk("start", { lag: o.lag, tid: o.tid, mal: o.mal, niva: o.niva, forbudt: !!o.tabu, tema: o.tema || "alle" });
        R.holdVaken();
        R.gaTil("tavla");
      },
      // The round only exists once the countdown has finished on this screen. Leaving during the
      // countdown (back, then «Fortsett») must never start a round by itself.
      async "start-runde"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.vinner != null || opptatt) return;
        opptatt = true;
        R.holdVaken();
        const fortsatt = R.vakt();
        let klar = false;
        try {
          klar = await R.nedtelling(["3", "2", "1", R.t("SNAKK!")], 750);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        sp.runde = { lag: sp.tur % sp.lag, ord: [], igjen: sp.tid, pause: false, ute: false, siste: -1, tilfeldig: Math.random() };
        sp.sist = null;
        sp.angre = null;
        sp.angreRekord = null;
        sp.nyRekord = null;
        nyttOrd(sp);
        startetNa = true;
        R.gaTil("runde");
      },
      riktig: (el, e, S) => svar(S, 1, false),
      hopp: (el, e, S) => svar(S, 0, false),
      // The opponents heard a forbidden word: the word is lost and costs a point.
      forbudt: (el, e, S) => (S.spill && S.spill.tabu ? svar(S, -1, false) : undefined),
      // Swiped card: right is correct, left is skip.
      sveip: (el, e, S) => svar(S, el.dataset.retning === "hoyre" ? 1 : 0, true),
      // Undo the last «Riktig» or «Hopp over»: that word comes back on the card.
      "angre-ord"(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (opptatt || !r || r.ute || r.pause || r.ord.length < 2 || !ubesvart(r)) return;
        r.ord.pop();
        r.ord[r.ord.length - 1].s = null;
        R.lyd.snu();
        R.vis();
      },
      pause: (el, e, S) => pause(S),
      "fortsett-runde": (el, e, S) => fortsettRunde(S),
      async "avbryt-runde"(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avbryte runden?"), R.t("Ordene i denne runden teller ikke. Laget kan starte runden på nytt."), R.t("Avbryt runden"), R.t("Spill videre"));
        if (!ja || !fortsatt() || !S.spill) return;
        S.spill.runde = null;
        R.gaTil("tavla");
      },
      siste(el, e, S) {
        const r = S.spill && S.spill.runde;
        if (!r || !r.ute) return;
        r.siste = Number(el.dataset.v);
        if (r.siste >= 0) R.lyd.riktig();
        R.gaTil("sjekk");
      },
      // Correct a tap in the list: ✓ ↔ skipped. «Forbudte ord» has a third state, and the taps go
      // ✓ → forbidden word → skipped → ✓ (a skipped word is still one tap from correct).
      veksle(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.runde;
        const w = r && r.ord[Number(el.dataset.v)];
        if (!w || w.s === null) return;
        if (sp.tabu) w.s = w.s === 1 ? -1 : w.s === -1 ? 0 : 1;
        else w.s = w.s === 1 ? 0 : 1;
        if (w.s === 1) R.lyd.pop();
        R.vis();
      },
      "siste-endre"(el, e, S) {
        S.spill.runde.siste = Number(el.dataset.v);
        R.vis();
      },
      // Add the points and move the token.
      flytt(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.runde || !sp.runde.ute) return;
        brukRunde(sp);
        R.gaTil("tavla");
      },
      // Take the move back: points, turn and statistics — and the record, if that round set one.
      "angre-flytt"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.angre) return;
        if (sp.angreRekord) settRekord(sp.tabu, sp.tid, somRekord(sp.angreRekord.gml));
        Object.assign(sp, sp.angre);
        sp.angre = null;
        sp.angreRekord = null;
        sp.flytt = null;
        R.lyd.snu();
        R.gaTil("sjekk");
      },
      kar(el, e, S) {
        if (!S.spill || S.spill.vinner == null) return;
        avsluttSpill(S, false);
        R.gaTil("slutt");
      },
      // «Avslutt»: from the track the team in the lead wins. From the list after a round that
      // round is counted first; a round that is still running (paused) is dropped.
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const r = sp.runde;
        const iRunde = !!(r && !r.ute);
        const iSjekk = !!(r && r.ute && S.skjerm === "sjekk");
        const harPoeng = sp.poeng.some((p) => p > 0) || (iSjekk && (rundePoeng(sp, r) > 0 || (!!ubesvart(r) && r.siste >= 0)));
        const tekst = !harPoeng ? R.t("Ingen har fått poeng ennå.") : iRunde ? R.t("Runden som pågår, teller ikke. Laget som leder, vinner.") : R.t("Laget som leder nå, vinner.");
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte spillet?"), tekst, R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (sp.runde && sp.runde.ute && S.skjerm === "sjekk") brukRunde(sp);
        else sp.runde = null;
        if (!sp.poeng.some((p) => p > 0)) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        sp.vinner = leder(sp);
        avsluttSpill(S, true);
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
