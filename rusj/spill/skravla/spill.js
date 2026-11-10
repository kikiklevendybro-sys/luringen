/* Skravla — «Forklar ordet» (explain the word), team against team.
   One explainer per turn describes as many words as possible before the time runs out while the
   rest of the team guesses. Every correct word moves the team's token one field along the race
   track. When a team reaches the goal, the round is played out so all teams get the same number
   of turns; most points wins (a tie at the top means one more round).
   Words come from the shared word bank (window.RUSJ_ORD). */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const TEKST = window.RUSJ_DATA.tekster;
  const KAT = window.RUSJ_ORD.kategorier;
  const katMedId = (id) => KAT.find((k) => k.id === id);

  // Every word in one list, so the deck remembers what this device has already shown.
  const ALLE = [];
  KAT.forEach((k) => k.ord.forEach((o) => ALLE.push({ k: k.id, o: o[0], n: o[1], h: o[2], l: o[3] })));
  const stokk = R.kortstokk("ord", ALLE.length);

  // The three choices and which word-bank levels (n = 1–3) each one draws from.
  const NIVAER = [
    { v: 1, navn: "Lett", n: [1], tekst: "Lette ord – fint når barna er med." },
    { v: 2, navn: "Middels", n: [1, 2], tekst: "Lette og middels ord – passer for de fleste." },
    { v: 3, navn: "Vanskelig", n: [2, 3], tekst: "Middels og vanskelige ord – for dere som elsker ord." },
  ];
  const niva = (v) => NIVAER.find((x) => x.v === v) || NIVAER[1];
  const TIDER = [45, 60, 90];
  const MAL = [20, 30, 40, 50];
  const DYP = ["var(--rosa-dyp)", "var(--lampe-dyp)", "var(--himmel-dyp)", "var(--mynte-dyp)"];
  const KORTFARGE = ["rosa", "lampe", "himmel", "mynte"];
  const lagNavn = (i) => "Lag " + R.LAG[i].navn;
  const rundeNr = (sp) => Math.floor(sp.tur / sp.lag) + 1;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  // «A», «A og B», «A, B og C»
  const liste = (navn) => (navn.length < 2 ? navn.join("") : `${navn.slice(0, -1).join(", ")} og ${navn[navn.length - 1]}`);

  let H; // the actions, so one action can reuse another
  let startetNa = false; // the round screen was entered from the countdown: start the clock
  let opptatt = false; // a card is flying out or the countdown runs: ignore extra taps
  let poppTeller = false; // the next draw of the round screen makes the counter pop

  // ---------- Words ----------

  function filter(o) {
    const lov = new Set(niva(o.niva).n);
    const kat = o.kat ? new Set(o.kat) : null;
    return (i) => lov.has(ALLE[i].n) && (!kat || kat.has(ALLE[i].k));
  }
  function tellOrd(o) {
    const f = filter(o);
    let n = 0;
    for (let i = 0; i < ALLE.length; i++) if (f(i)) n++;
    return n;
  }
  function tellKat(id, nivaV) {
    const lov = niva(nivaV).n;
    const k = katMedId(id);
    return k ? k.ord.filter((o) => lov.includes(o[1])).length : 0;
  }
  function nyttOrd(sp) {
    const i = stokk.neste(filter(sp));
    const w = ALLE[i >= 0 ? i : 0];
    sp.runde.ord.push({ o: w.o, k: w.k, h: w.h, l: w.l, s: null });
  }
  // The word on screen (not answered yet), if any.
  const ubesvart = (r) => {
    const w = r.ord[r.ord.length - 1];
    return w && w.s === null ? w : null;
  };
  // Points for the team that explained: +1 per correct word, −1 per skip if that rule is on,
  // +1 if the team itself took the last word.
  function rundePoeng(sp, r) {
    let p = 0;
    r.ord.forEach((w) => {
      if (w.s === 1) p++;
      else if (w.s === 0 && sp.straff) p--;
    });
    if (ubesvart(r) && r.siste === r.lag) p++;
    return p;
  }
  function domTekst(p, t) {
    const gruppe = TEKST.dommer.find((d) => p <= d.til) || TEKST.dommer[TEKST.dommer.length - 1];
    return gruppe.tekster[Math.floor((t || 0) * gruppe.tekster.length) % gruppe.tekster.length];
  }
  // Big word: the font shrinks with the longest word so it always fits on one line per word.
  function ordHtml(o) {
    const lengste = Math.max(6, ...String(o).split(/\s+/).map((d) => d.length));
    return `<span class="sk-ordet" style="--tegn: ${lengste}">${esc(o)}</span>`;
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
      if (k === 0) return `<circle class="sk-start" cx="${p.x}" cy="${p.y}" r="15"/><text class="sk-baneord" x="${p.x}" y="${p.y + 33}">START</text>`;
      if (k === sp.mal)
        return `<circle class="sk-mal" cx="${p.x}" cy="${p.y}" r="19"/><text class="sk-pokal" x="${p.x}" y="${p.y + 6.5}">🏆</text><text class="sk-baneord" x="${p.x}" y="${p.y + 36}">MÅL</text>`;
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
    const tekst = "Løypa: " + sp.poeng.map((p, i) => `${lagNavn(i)} har ${p} av ${sp.mal} poeng`).join(", ");
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
    R.si("Tiden er ute! Siste ord: alle lag kan gjette.");
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

  async function svar(S, riktig, fraSveip) {
    const sp = S.spill;
    const r = sp && sp.runde;
    if (opptatt || !r || r.ute || r.pause) return;
    const w = ubesvart(r);
    if (!w) return;
    opptatt = true;
    w.s = riktig ? 1 : 0;
    if (riktig) {
      R.lyd.riktig();
      R.vibrer(25);
      poppTeller = true;
    } else R.vibrer(10);
    const fortsatt = R.vakt();
    try {
      if (!fraSveip) await R.kastKort(riktig ? 1 : -1);
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
    return `<div class="sk-status">
      ${R.ui.timer({ id: "sk-tid", sekunder: r.igjen })}
      <div class="sk-status-lag">${klump(r.lag)}<span><b>${esc(lagNavn(r.lag))}</b><small>gjetter</small></span></div>
      <div class="sk-teller${poppTeller ? " popp" : ""}" aria-label="${riktige} riktige"><b>${riktige}</b><small>riktige</small></div>
    </div>`;
  }

  const tabuHtml = (w) =>
    `<span class="sk-tabu"><span class="sk-tabu-tittel">Forbudt å si</span><span class="sk-tabu-ord"><span>${esc(w.h)}</span><span>${esc(w.l)}</span></span></span>`;

  function uteVis(sp, r) {
    const w = ubesvart(r);
    const topp = w
      ? `<div class="sk-ute">
          <h1 id="skjerm-tittel" class="stempel sk-stempel">Tiden er ute!</h1>
          <div class="bunke"><article class="storkort sk-siste">
            <p class="etikett">Siste ord</p>
            <p class="storkort-tekst">${ordHtml(w.o)}</p>
            <p class="sk-siste-tekst">Nå kan alle lag gjette! Hvem tok det?</p>
          </article></div>
        </div>`
      : `<div class="sk-ute"><h1 id="skjerm-tittel" class="stempel sk-stempel">Tiden er ute!</h1><p class="ingress">Godt jobba! Nå sjekker vi ordene.</p></div>`;
    const knapper = w
      ? `<div class="sk-lagknapper k${sp.lag}">${sp.poeng
          .map(
            (_, i) =>
              `<button class="knapp sk-lagknapp" style="--f: ${R.LAG[i].farge}; --f-dyp: ${DYP[i]}" data-h="siste" data-v="${i}">${esc(lagNavn(i))}</button>`,
          )
          .join("")}<button class="knapp-2 sk-ingen" data-h="siste" data-v="-1">Ingen tok det</button></div>`
      : R.ui.knapp("Se ordene", "siste", { v: -1 });
    return topp + R.ui.dokk(knapper);
  }

  function pauseVis(r) {
    return `<div class="bunke"><article class="storkort sk-kort sk-pausekort">
        ${R.figur()}
        <h1 id="skjerm-tittel">Pause</h1>
        <p class="sk-pause-tekst">Ordet er skjult. Fortsett når ${esc(lagNavn(r.lag))} er klare.</p>
      </article></div>
      ${R.ui.dokk(R.ui.knapp("Fortsett", "fortsett-runde", { ikon: "▶" }), R.ui.lenkerad(R.ui.lenke("Avbryt runden", "avbryt-runde")))}`;
  }

  // ---------- Setup pieces ----------

  function katTekst(o) {
    if (!o.kat) return `Alle ${KAT.length} kategorier`;
    if (!o.kat.length) return "Ingen valgt";
    if (o.kat.length <= 2) return o.kat.map((id) => katMedId(id).navn).join(" · ");
    return `${o.kat.length} av ${KAT.length} kategorier`;
  }
  function katInfo(o) {
    const n = tellOrd(o);
    return n ? `${R.tall(n)} ord på nivå ${niva(o.niva).navn.toLowerCase()}.` : "Velg minst én kategori.";
  }
  function katArk(S) {
    const o = S.oppsett;
    const valgt = o.kat || KAT.map((k) => k.id);
    return `<h2 id="ark-tittel">Velg kategorier</h2>
      <p class="ingress" id="sk-katinfo">${esc(katInfo(o))}</p>
      ${R.ui.brikker(
        "kat",
        KAT.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: tellKat(k.id, o.niva) })),
        valgt,
        { alle: true, etikett: "Kategorier" },
      )}
      <button class="knapp" data-h="kat-ferdig"${valgt.length ? "" : " disabled"}>Ferdig</button>`;
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
      return `<div class="pall-plass p${Math.min(n, 3)}">${klump(x.lag, "stor")}<span class="navn">${esc(lagNavn(x.lag))}</span><span class="poeng">${x.poeng} p</span><span class="blokk">${n}</span></div>`;
    };
    return `<div class="pall sk-pall" aria-label="Pallen">${plass(alle[1])}${plass(alle[0])}${plass(alle[2])}</div>`;
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

  // ---------- The game ----------

  R.start({
    id: "skravla",
    versjon: 1,
    liggende: true, // landscape phones: the kit may move every dock to the side column, also those with the game's own buttons in them
    pagar, // a game is running until the end screen (front-page badge, wake lock)

    tilstand: () => ({
      oppsett: { lag: 2, tid: 60, mal: 30, niva: 2, kat: null, tabu: false, straff: false },
      spill: null,
    }),

    // Repair saved settings and drop a saved game that doesn't fit this version.
    lastet(S) {
      const o = (S.oppsett = Object.assign({ lag: 2, tid: 60, mal: 30, niva: 2, kat: null, tabu: false, straff: false }, S.oppsett));
      if (![2, 3, 4].includes(o.lag)) o.lag = 2;
      if (!TIDER.includes(o.tid)) o.tid = 60;
      if (!MAL.includes(o.mal)) o.mal = 30;
      if (![1, 2, 3].includes(o.niva)) o.niva = 2;
      if (o.kat != null) {
        o.kat = Array.isArray(o.kat) ? o.kat.filter((id) => katMedId(id)) : null;
        if (o.kat && (!o.kat.length || o.kat.length === KAT.length)) o.kat = null;
      }
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
      if (sp.runde && !(Array.isArray(sp.runde.ord) && sp.runde.ord.length && sp.runde.lag < sp.lag)) sp.runde = null;
      if (!sp.runde && (sp.skjerm === "runde" || sp.skjerm === "sjekk")) sp.skjerm = "tavla";
    },

    regler: {
      intro: "Lag mot lag: én forklarer, resten av laget gjetter. Hvert riktige ord flytter brikken ett felt nærmere mål.",
      steg: [
        ["Forklar", "Få laget ditt til å si ordet på skjermen – uten å si selve ordet eller deler av det."],
        ["Riktig eller hopp over", "Trykk «Riktig ✓» når laget gjetter ordet, eller «Hopp over». Du kan også sveipe kortet: høyre er riktig, venstre er hopp."],
        ["Flytt brikken", "Når tiden er ute, retter dere feil og flytter brikken. Først i mål vinner – men alle lag får like mange runder."],
      ],
      tips: [
        "Siste ord når tiden er ute: alle lag kan gjette. Laget som tar det, får poenget.",
        "Ikke lov: peke på ting, rime, si ordet på engelsk eller «det begynner på …».",
        "Forbudte ord: to ekstra ord står under ordet. Sier du dem, må du hoppe over.",
        "Bytt forklarer hver runde, så alle får prøve seg.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Forklar ordet – uten å si det.<br><em>Første lag i mål vinner.</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · runde ${rundeNr(S.spill)}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["2–4", "lag"],
              [R.tall(ALLE.length), "ord"],
              ["0", "reklame"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const antall = tellOrd(o);
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
            <h2>Hvordan spiller dere?</h2>
            ${R.ui.fliser(
              "modus",
              [
                { v: "klassisk", tittel: "Klassisk", tekst: "Forklar ordet med egne ord", ikon: "💬" },
                { v: "tabu", tittel: "Forbudte ord", tekst: "To ekstra ord du ikke får si", ikon: "🚫" },
              ],
              o.tabu ? "tabu" : "klassisk",
            )}
            </section>
            <section class="seksjon">
              <h2>Hvor mange lag?</h2>
              ${R.ui.seg("lag", [[2, "2 lag"], [3, "3 lag"], [4, "4 lag"]], o.lag, { etikett: "Antall lag" })}
              <ul class="sk-lagrad" aria-label="Lagene">${Array.from({ length: o.lag }, (_, i) => `<li>${klump(i)}<span>${esc(R.LAG[i].navn)}</span></li>`).join("")}</ul>
              <p class="hjelp">Del dere i lag som sitter sammen. Én forklarer, resten av laget gjetter.</p>
            </section>
            <div class="sk-to">
              <section class="seksjon"><h2>Tid per runde</h2>${R.ui.seg("tid", TIDER.map((t) => [t, `${t} s`]), o.tid, { etikett: "Tid per runde" })}</section>
              <section class="seksjon"><h2>Først til</h2>${R.ui.seg("mal", MAL.map((m) => [m, String(m)]), o.mal, { etikett: "Poeng for å vinne" })}</section>
            </div>
            <section class="seksjon">
              <div class="seksjon-hode"><h2>Ordene</h2><span class="tall">${R.tall(antall)} ord</span></div>
              ${R.ui.seg("niva", NIVAER.map((n) => [n.v, n.navn]), o.niva, { etikett: "Vanskelighet" })}
              <p class="hjelp">${esc(niva(o.niva).tekst)}</p>
              <button class="sk-katknapp" data-h="kategorier"><span class="sk-katikon" aria-hidden="true">🗂️</span><span><b>Kategorier</b><small>${esc(katTekst(o))}</small></span><i>Endre</i></button>
            </section>
            ${R.ui.bryter("straff", o.straff, "Hopp over koster ett poeng", "For dem som liker det tøft.")}
            ${R.ui.dokk(R.ui.knapp("Start", "start", { av: !antall }))}`;
        },
      },

      // The race track, and who explains next (this is also the pass-the-phone screen).
      tavla: {
        tittel: (S) => (S.spill.vinner != null ? "I mål!" : `Runde ${rundeNr(S.spill)}`),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const fra = {};
          (sp.flytt || []).forEach((f) => {
            if (fra[f.lag] == null) fra[f.lag] = f.fra;
          });
          const topp = bane(sp, fra) + stilling(sp);
          if (sp.vinner != null) {
            return `${topp}
              <div class="sk-neste vunnet" style="--lf: ${R.LAG[sp.vinner].farge}">
                <p class="etikett">Først i mål</p>
                <h1 id="skjerm-tittel"><span>${esc(lagNavn(sp.vinner))}</span> vinner!</h1>
                <p class="sk-neste-tekst">${sp.poeng[sp.vinner]} poeng. Klare for kåringen?</p>
              </div>
              ${R.ui.dokk(R.ui.knapp("Til kåringen", "kar", { ikon: "🏆" }), sp.angre ? R.ui.lenkerad(R.ui.lenke("Angre", "angre-flytt")) : "")}`;
          }
          const neste = sp.tur % sp.lag;
          const imal = sp.poeng.map((p, i) => (p >= sp.mal ? lagNavn(i) : null)).filter(Boolean);
          // The explanation after «… er i mål!» is left out on short phones (the rules have it too).
          let melding = "";
          if (sp.uavgjort) melding = esc("Likt på toppen! Én runde til.");
          else if (imal.length) melding = `🏁 ${esc(liste(imal))} er i mål!<span class="sk-melding-mer"> Alle lag får like mange forsøk.</span>`;
          const etikett = sp.tur === 0 ? "Først ut" : imal.length && !sp.uavgjort ? "Siste runde" : "Neste lag";
          return `${topp}
            <div class="sk-neste" style="--lf: ${R.LAG[neste].farge}">
              ${melding ? `<p class="sk-melding">${melding}</p>` : ""}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel"><span>${esc(lagNavn(neste))}:</span> hvem forklarer?</h1>
              <p class="sk-neste-tekst">Den som forklarer, tar mobilen. Resten av laget gjetter.</p>
            </div>
            ${R.ui.dokk(
              R.ui.knapp(`Start runden – ${lagNavn(neste)}`, "start-runde"),
              R.ui.lenkerad(sp.angre ? R.ui.lenke("Angre", "angre-flytt") : "", R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        inn(S) {
          S.spill.skjerm = "tavla";
          animer(S);
        },
      },

      runde: {
        tittel: (S) => `Runde ${rundeNr(S.spill)}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          if (r.ute) return uteVis(sp, r);
          if (r.pause || (!startetNa && !klokke())) return status(sp, r) + pauseVis(r);
          const w = ubesvart(r);
          const k = katMedId(w.k);
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(lagNavn(r.lag))} gjetter</h1>
            ${status(sp, r)}
            <div style="--bunke: ${R.LAG[r.lag].farge}">${R.ui.storkort({
              etikett: k ? `${k.ikon} ${k.navn}` : "Forklar",
              nr: `#${r.ord.length}`,
              tekstHtml: ordHtml(w.o),
              fotHtml: sp.tabu ? tabuHtml(w) : r.ord.length === 1 ? `<span class="sk-hint">Forklar – uten å si ordet!</span>` : "",
              klasse: "sk-kort " + KORTFARGE[r.lag],
              sveip: "sveip",
            })}</div>
            <p class="sveip-hint" aria-hidden="true">← Hopp over · Riktig →</p>
            ${R.ui.dokk(
              `<div class="sk-svarknapper">${R.ui.knapp("Hopp over", "hopp", { variant: "papir", stille: true })}${R.ui.knapp("Riktig ✓", "riktig", { variant: "mynte", stille: true })}</div>`,
              R.ui.lenkerad(r.ord.length > 1 ? R.ui.lenke("Angre", "angre-ord") : "", R.ui.lenke("Pause", "pause")),
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
        tittel: "Sjekk ordene",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.runde;
          const p = rundePoeng(sp, r);
          const sist = ubesvart(r);
          const besvart = r.ord.filter((w) => w.s !== null);
          const stjeler = sist && r.siste >= 0 && r.siste !== r.lag ? r.siste : null;
          return `
            <div class="sk-resultat" style="--lf: ${R.LAG[r.lag].farge}">
              ${klump(r.lag, "stor")}
              <p class="etikett">${esc(lagNavn(r.lag))} fikk</p>
              <h1 id="skjerm-tittel"><b>${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}</b> poeng</h1>
              <p class="sk-dom">${esc(domTekst(p, r.tilfeldig))}</p>
            </div>
            ${
              besvart.length
                ? `<section class="seksjon">
                    <div class="seksjon-hode"><h2>Ordene</h2><span class="tall">Trykk for å rette</span></div>
                    <ul class="sk-ordliste">${r.ord
                      .map((w, i) =>
                        w.s === null
                          ? ""
                          : `<li><button class="sk-ord" data-h="veksle" data-v="${i}" aria-pressed="${w.s === 1}"><i aria-hidden="true">${w.s === 1 ? "✓" : "↷"}</i><span>${esc(w.o)}</span><small>${
                              w.s === 1 ? "+1" : sp.straff ? "−1" : "hoppet over"
                            }</small></button></li>`,
                      )
                      .join("")}</ul>
                  </section>`
                : `<p class="hjelp">Ingen ord ble forklart denne runden.</p>`
            }
            ${
              sist
                ? `<section class="seksjon sk-sisteord">
                    <div class="seksjon-hode"><h2>Siste ord: ${esc(sist.o)}</h2></div>
                    ${R.ui.seg("siste-endre", [[-1, "Ingen"], ...sp.poeng.map((_, i) => [i, R.LAG[i].navn])], r.siste, { etikett: "Hvem tok siste ord?" })}
                    ${stjeler != null ? `<p class="hjelp">+1 til ${esc(lagNavn(stjeler))} for siste ord.</p>` : ""}
                  </section>`
                : ""
            }
            ${R.ui.dokk(R.ui.knapp(p > 0 ? `Flytt ${p} felt fram` : "Videre til løypa", "flytt"))}`;
        },
        inn(S) {
          S.spill.skjerm = "sjekk";
        },
      },

      slutt: {
        tittel: "Kåringen",
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
          let figur = R.figur();
          let etikett = "Ingen vinner";
          let tittel = "Ingen fikk poeng";
          let ingress = "Neste gang tar dere av!";
          if (topp.length === 1) {
            figur = klump(topp[0], "gigant");
            etikett = TEKST.vinnere[(sp.fro >>> 0) % TEKST.vinnere.length];
            tittel = `${lagNavn(topp[0])} vinner!`;
            ingress = `${sp.poeng[topp[0]]} poeng – ${margin} foran nærmeste lag.`;
          } else if (topp.length > 1) {
            figur = `<span class="sk-delt">${topp.map((i) => klump(i, "stor")).join("")}</span>`;
            etikett = "Delt seier";
            tittel = `${liste(topp.map(lagNavn))} vinner!`;
            ingress = `Likt på ${sp.poeng[topp[0]]} poeng. Godt jobba!`;
          }
          return `
            <div class="banner sk-banner"${topp.length === 1 ? ` style="--lf: ${R.LAG[topp[0]].farge}"` : ""}>
              ${figur}
              <p class="etikett">${esc(etikett)}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${esc(ingress)}</p>
            </div>
            ${topp.length ? pall(sp) + lagListe(sp) : ""}
            <ul class="sk-fakta">
              <li><b>${sumRiktig}</b><span>ord forklart</span></li>
              <li><b>${sumHopp}</b><span>hoppet over</span></li>
              <li><b>${runder}</b><span>${runder === 1 ? "runde" : "runder"}</span></li>
            </ul>
            ${sp.stat.beste && sp.stat.beste.ord > 0 ? `<p class="hjelp">Beste runde: ${esc(lagNavn(sp.stat.beste.lag))} med ${sp.stat.beste.ord} ord.</p>` : ""}
            ${
              hoppet.length
                ? `<section class="seksjon"><h2>Ordene dere hoppet over</h2><p class="hjelp sk-venstre">Klarer dere å forklare dem nå?</p><ul class="sk-hoppet">${hoppet
                    .map((o) => `<li>${esc(o)}</li>`)
                    .join("")}</ul></section>`
                : ""
            }
            ${R.ui.flereSpill({ antall: Math.max(4, sp.lag * 2) })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), `<a class="lenke" href="/">Alle spill</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          const forste = !sp.ferdig;
          sp.ferdig = true;
          sp.angre = null;
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
        if (!tellOrd(o)) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = {
          lag: o.lag,
          tid: o.tid,
          mal: o.mal,
          niva: o.niva,
          kat: o.kat ? o.kat.slice() : null,
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
          sist: null,
          skjerm: "tavla",
          fro: R.nyttFro(),
          stat: { riktig: Array(o.lag).fill(0), hopp: Array(o.lag).fill(0), beste: null, hoppet: [] },
        };
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
          klar = await R.nedtelling(["3", "2", "1", "SNAKK!"], 750);
        } finally {
          opptatt = false;
        }
        if (!klar || !fortsatt() || S.spill !== sp) return;
        sp.runde = { lag: sp.tur % sp.lag, ord: [], igjen: sp.tid, pause: false, ute: false, siste: -1, tilfeldig: Math.random() };
        sp.sist = null;
        sp.angre = null;
        nyttOrd(sp);
        startetNa = true;
        R.gaTil("runde");
      },
      riktig: (el, e, S) => svar(S, true, false),
      hopp: (el, e, S) => svar(S, false, false),
      // Swiped card: right is correct, left is skip.
      sveip: (el, e, S) => svar(S, el.dataset.retning === "hoyre", true),
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
        const ja = await R.bekreft("Avbryte runden?", "Ordene i denne runden teller ikke. Laget kan starte runden på nytt.", "Avbryt runden", "Fortsett");
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
      veksle(el, e, S) {
        const r = S.spill.runde;
        const w = r && r.ord[Number(el.dataset.v)];
        if (!w || w.s === null) return;
        w.s = w.s === 1 ? 0 : 1;
        if (w.s === 1) R.lyd.pop();
        R.vis();
      },
      "siste-endre"(el, e, S) {
        S.spill.runde.siste = Number(el.dataset.v);
        R.vis();
      },
      // Add the points, remember what to animate, advance the turn and check for a winner.
      flytt(el, e, S) {
        const sp = S.spill;
        const r = sp.runde;
        if (!r || !r.ute) return;
        // Everything this move changes, so «Angre» on the track can put it back.
        sp.angre = JSON.parse(JSON.stringify({ runde: r, poeng: sp.poeng, stat: sp.stat, tur: sp.tur, malgang: sp.malgang, uavgjort: sp.uavgjort, vinner: sp.vinner, sist: sp.sist }));
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
        const riktige = r.ord.filter((w) => w.s === 1).length + (sist && r.siste === r.lag ? 1 : 0);
        sp.stat.riktig[r.lag] += riktige;
        sp.stat.hopp[r.lag] += r.ord.filter((w) => w.s === 0).length;
        if (!sp.stat.beste || riktige > sp.stat.beste.ord) sp.stat.beste = { lag: r.lag, ord: riktige };
        r.ord.forEach((w) => {
          if (w.s === 0) sp.stat.hoppet.push(w.o);
        });
        sp.stat.hoppet = sp.stat.hoppet.slice(-40);
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
        R.gaTil("tavla");
      },
      "angre-flytt"(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.angre) return;
        Object.assign(sp, sp.angre);
        sp.angre = null;
        sp.flytt = null;
        R.lyd.snu();
        R.gaTil("sjekk");
      },
      kar: () => R.gaTil("slutt"),
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const harPoeng = sp.poeng.some((p) => p > 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", harPoeng ? "Laget som leder nå, vinner." : "Ingen har fått poeng ennå.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (!harPoeng) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        sp.vinner = leder(sp);
        sp.angre = null;
        R.gaTil("slutt");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },
    }),
  });
})();
