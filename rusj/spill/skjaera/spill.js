/* Skjæra — Kim's game ("Kims lek").
   A board of things is shown for a few seconds. Then the magpie swoops across the screen and steals
   one or more of them; the board comes back with gaps (shuffled on the harder levels) and the player
   picks what is missing. As many guesses as stolen things. At the end the magpie flies back with
   whatever was not found. Alone: 12 levels × 3 rounds with stars. Together: 2–8 players take turns.
   The board is drawn once per round; the phases (look → steal → find → answer) change the DOM
   directly so the animations run undisturbed, and every phase is saved in S for reloads. */
(function () {
  "use strict";

  const R = window.Rusj;
  const G = window.RusjGjengen;
  const D = window.RUSJ_DATA.ting;
  const esc = R.esc;

  // Every thing in one list: { e: emoji, n: name, t: theme index }
  const TING = [];
  D.temaer.forEach((tema, t) => tema.ting.forEach(([e, n]) => TING.push({ e, n, t })));
  const AV_TEMA = D.temaer.map((_, t) => TING.map((x, i) => (x.t === t ? i : -1)).filter((i) => i >= 0));
  const TINTER = ["#ffd6e4", "#d4efff", "#d9f6cf", "#fff0bd", "#e6d9ff", "#ffdcc7", "#cbf6e8", "#f5d6ff", "#dae2ff", "#ffe4dc", "#e2f7c4", "#ffe9a8"];
  const tint = (x) => TINTER[(x * 7) % TINTER.length];

  // ting: things on the board · kol: columns · sek: seconds to look · stjel: stolen · valg: options
  // temaer: how many themes the board mixes · stokk: the rest is shuffled · lur: one option is still on the board
  const NIVAER = [
    { ting: 4, kol: 2, sek: 6, stjel: 1, valg: 4, temaer: 4 },
    { ting: 6, kol: 3, sek: 6, stjel: 1, valg: 4, temaer: 6 },
    { ting: 6, kol: 3, sek: 5, stjel: 1, valg: 5, temaer: 3 },
    { ting: 8, kol: 4, sek: 7, stjel: 1, valg: 5, temaer: 4, lur: true },
    { ting: 9, kol: 3, sek: 7, stjel: 2, valg: 5, temaer: 3 },
    { ting: 9, kol: 3, sek: 6, stjel: 1, valg: 5, temaer: 3, stokk: true },
    { ting: 12, kol: 4, sek: 8, stjel: 2, valg: 6, temaer: 3 },
    { ting: 12, kol: 4, sek: 7, stjel: 2, valg: 6, temaer: 3, stokk: true },
    { ting: 12, kol: 4, sek: 7, stjel: 3, valg: 6, temaer: 2, lur: true },
    { ting: 16, kol: 4, sek: 9, stjel: 2, valg: 6, temaer: 2, stokk: true },
    { ting: 16, kol: 4, sek: 8, stjel: 3, valg: 6, temaer: 2, stokk: true },
    { ting: 20, kol: 4, sek: 9, stjel: 3, valg: 6, temaer: 2, stokk: true, lur: true },
  ];
  const RUNDER_SOLO = 3;
  const START = { lett: 0, middels: 3, vanskelig: 6 };
  const ORD = ["", "én ting", "to ting", "tre ting"];

  let H; // actions
  let opptatt = false; // an animation is running; taps wait
  let nyttBrett = false; // pop the things in on the next draw

  // ---------- Rounds ----------

  function lagRunde(L) {
    const N = NIVAER[L];
    const rng = R.rng(R.nyttFro());
    const temaer = R.stokk(D.temaer.map((_, t) => t), rng).slice(0, N.temaer);
    const per = Math.ceil(N.ting / temaer.length);
    let brett = [];
    for (const t of temaer) brett.push(...R.stokk(AV_TEMA[t], rng).slice(0, per));
    brett = R.stokk(brett, rng).slice(0, N.ting);
    const stjalet = R.stokk(brett.map((_, p) => p), rng).slice(0, N.stjel);
    const tatt = stjalet.map((p) => brett[p]);
    const paBrett = new Set(brett);
    const lur = N.lur ? R.stokk(brett.filter((_, p) => !stjalet.includes(p)), rng).slice(0, 1) : [];
    // Decoys: never on the board; on the easy levels from other themes, later from the same themes.
    const ledige = TING.map((_, i) => i).filter((i) => !paBrett.has(i));
    const samme = R.stokk(ledige.filter((i) => tatt.some((s) => TING[s].t === TING[i].t)), rng);
    const andre = R.stokk(ledige.filter((i) => !samme.includes(i) && !brett.some((b) => TING[b].t === TING[i].t)), rng);
    const resten = R.stokk(ledige.filter((i) => !samme.includes(i) && !andre.includes(i)), rng);
    const kilde = L < 2 ? [...andre, ...resten] : [...samme, ...andre, ...resten];
    const lokke = kilde.slice(0, N.valg - N.stjel - lur.length);
    let plass;
    if (N.stokk) {
      const rest = R.stokk(brett.filter((_, p) => !stjalet.includes(p)), rng);
      plass = R.stokk([...rest, ...stjalet.map(() => -1)], rng);
    } else plass = brett.map((x, p) => (stjalet.includes(p) ? -1 : x));
    return { niva: L, brett, stjalet, plass, valg: R.stokk([...tatt, ...lur, ...lokke], rng), gjett: [], fase: "se" };
  }

  const tatte = (b) => b.stjalet.map((p) => b.brett[p]);
  const funnet = (b) => b.gjett.filter((x) => tatte(b).includes(x));

  // What the board looks like now: gaps filled in the order things were found.
  function visning(b) {
    if (b.fase === "svar") return b.brett.slice();
    const v = b.plass.slice();
    for (const x of funnet(b)) {
      const p = NIVAER[b.niva].stokk ? v.indexOf(-1) : b.brett.indexOf(x);
      if (p >= 0) v[p] = x;
    }
    return v;
  }

  function nivaForRunde(sp) {
    return sp.modus === "solo" ? sp.niva : Math.min(NIVAER.length - 1, sp.start + sp.runde);
  }

  // ---------- Markup ----------

  function tingHtml(x, klasse, n, ekstraHtml, etikett) {
    return `<span class="skj-ting ${klasse || ""}" data-ting="${x}" role="img" aria-label="${esc(etikett || TING[x].n)}" style="--tint:${tint(x)}; --n:${n || 0}">${esc(TING[x].e)}${ekstraHtml || ""}</span>`;
  }
  function ruteHtml(p, x, o = {}) {
    if (x < 0) return `<div class="skj-rute tom" data-pos="${p}"><span class="skj-hull" aria-hidden="true">?</span><span class="vh">Tom plass</span></div>`;
    const m = o.merk ? o.merk(x) : {};
    return `<div class="skj-rute" data-pos="${p}">${tingHtml(x, m.klasse || "", p, m.html, m.etikett)}</div>`;
  }
  // After the answer: things you found get a green tick. Things the magpie got away with are shown
  // where they were – a gold ring, the magpie and «Her var den!» – never a cross: they weren't wrong.
  function brettHtml(b, layout) {
    const st = tatte(b);
    const plass = layout.length <= 12;
    const merk =
      b.fase === "svar"
        ? (x) =>
            !st.includes(x)
              ? {}
              : b.gjett.includes(x)
                ? { klasse: "var-tatt funnet", etikett: `${TING[x].n} – du fant den` }
                : {
                    klasse: "var-tatt her",
                    etikett: `${TING[x].n} – her var den`,
                    html: `<span class="skj-merke" aria-hidden="true">${G.svg("skjaera")}</span>${plass ? '<span class="skj-her" aria-hidden="true">Her var den!</span>' : ""}`,
                  }
        : null;
    return layout.map((x, p) => ruteHtml(p, x, { merk })).join("");
  }

  function lukerHtml(b) {
    const st = tatte(b);
    return `<div class="skj-luker" aria-label="Forsøk">${b.stjalet
      .map((_, n) => {
        const x = b.gjett[n];
        if (x == null) return `<span class="skj-luke">?</span>`;
        const rett = st.includes(x);
        return `<span class="skj-luke ${rett ? "rett" : "feil"}" role="img" aria-label="${esc(TING[x].n)}: ${rett ? "riktig" : "feil"}">${esc(TING[x].e)}</span>`;
      })
      .join("")}</div>`;
  }

  function hvemHtml(sp) {
    return sp.modus === "flere" ? `<p class="skj-hvem">${R.avatar(sp.tur)}<span>${esc(R.navn(sp.tur))}</span></p>` : "";
  }

  function tittelFor(b) {
    const k = b.stjalet.length;
    if (b.fase === "se") return "Se godt!";
    if (b.fase === "finn") return "Hva tok skjæra?";
    const fant = funnet(b).length;
    if (fant === k) return k === 1 ? "Riktig!" : "Du fant alt!";
    return fant ? `${fant} av ${k} riktig!` : "Skjæra lurte deg!";
  }

  function hodeHtml(S) {
    const sp = S.spill;
    const b = sp.b;
    const ikon = b.fase === "se" ? "👀" : b.fase === "finn" ? "🔍" : funnet(b).length === b.stjalet.length ? "⭐" : SKJAERA_IKON;
    return `<div class="skj-hode">
      ${hvemHtml(sp)}
      <h1 id="skjerm-tittel" class="skj-tittel"><span class="skj-ikon" aria-hidden="true">${ikon}</span><span class="skj-tekst">${esc(tittelFor(b))}</span></h1>
      <div class="skj-under">${b.fase === "se" ? `<div class="skj-tid" aria-hidden="true"><i></i></div>` : lukerHtml(b)}</div>
    </div>`;
  }

  const kolonner = (n) => (n <= 4 ? 2 : 3);
  // Height of the options under the thumb (smaller buttons on short phones, see spill.css).
  function dokkHoyde(N) {
    const rader = Math.ceil(N.valg / kolonner(N.valg));
    return rader * (window.innerHeight < 700 ? 64 : 78) + (rader - 1) * 10;
  }

  function valgHtml(b) {
    const k = kolonner(b.valg.length);
    const st = tatte(b);
    return `<div class="skj-valg-rad" style="--k:${k}" role="group" aria-label="Hva mangler?">${b.valg
      .map((x) => {
        const gjettet = b.gjett.includes(x);
        const klasse = gjettet ? (st.includes(x) ? " rett" : " feil") : "";
        return `<button class="skj-valg${klasse}" data-h="gjett" data-v="${x}" data-stille${gjettet ? " disabled" : ""}><span class="skj-valg-e" aria-hidden="true">${esc(TING[x].e)}</span><span class="skj-valg-n">${esc(TING[x].n)}</span></button>`;
      })
      .join("")}</div>`;
  }

  function svarHtml(S) {
    const sp = S.spill;
    const b = sp.b;
    const fant = funnet(b).length;
    const k = b.stjalet.length;
    const tekst = `Skjæra tok: ${tatte(b).map((x) => `${TING[x].e} ${TING[x].n}`).join(" · ")}`;
    let knapp;
    if (sp.modus === "solo") knapp = sp.runde + 1 < RUNDER_SOLO ? R.ui.knapp("Neste runde", "neste", { ikon: "➜" }) : R.ui.knapp("Se stjernene", "neste", { ikon: "⭐" });
    else if (sp.tur + 1 < sp.antall) knapp = R.ui.knapp(`Neste: ${R.navn(sp.tur + 1)}`, "neste");
    else knapp = R.ui.knapp(sp.runde + 1 < sp.runder ? "Se stillingen" : "Se vinneren", "neste", { ikon: sp.runde + 1 < sp.runder ? "📋" : "🏆" });
    const poeng =
      sp.modus === "flere"
        ? `<b class="skj-pluss${fant ? "" : " null"}">${fant ? `+${fant} poeng` : "0 poeng"}</b>`
        : fant === k
          ? `<b class="skj-pluss stjerne">+1 ⭐</b>`
          : "";
    return `<div class="skj-svar"><p>${poeng}<span>${esc(tekst)}</span></p></div>${knapp}`;
  }

  function dokkInnhold(S) {
    const b = S.spill.b;
    if (b.fase === "se") return R.ui.knapp("Jeg er klar!", "klar", { ikon: "✋" });
    if (b.fase === "finn") return valgHtml(b);
    return svarHtml(S);
  }

  // ---------- Small DOM helpers ----------

  const rute = (p) => R.$(`.skj-rute[data-pos="${p}"]`);
  function settHode(S) {
    const h = R.$(".skj-hode");
    if (!h) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = hodeHtml(S);
    h.replaceWith(tmp.firstElementChild);
  }
  function settTittel(ikon, tekst) {
    const t = R.$(".skj-tittel");
    if (!t) return;
    t.querySelector(".skj-ikon").innerHTML = ikon;
    t.querySelector(".skj-tekst").textContent = tekst;
    if (!R.rolig()) {
      t.classList.remove("ny");
      void t.offsetWidth;
      t.classList.add("ny");
    }
  }
  function settDokk(html) {
    const d = R.$(".skj-dokk");
    if (d) d.innerHTML = html;
  }

  // Board size: fits the screen together with the options under the thumb (the dock keeps the
  // same height in every phase, so the board never jumps).
  function tilpass() {
    const brett = R.$(".skj-brett");
    const bord = R.$(".skj-bord");
    if (!brett || !bord) return;
    const n = Number(brett.dataset.n);
    const kol = Number(brett.dataset.kol);
    const rader = Math.ceil(n / kol);
    const gap = n >= 16 ? 8 : 10;
    const dokk = R.$(".skj-dokk");
    const reserve = (dokk ? parseFloat(dokk.style.minHeight) || 180 : 180) + 26 + 16 + 14;
    const topp = bord.getBoundingClientRect().top + window.scrollY;
    const hoyde = window.innerHeight - topp - reserve;
    const bredde = bord.clientWidth;
    const b = Math.floor(Math.max(46, Math.min((bredde - gap * (kol - 1)) / kol, (hoyde - gap * (rader - 1)) / rader, 124)));
    brett.style.setProperty("--rb", b + "px");
    brett.style.setProperty("--gap", gap + "px");
  }
  window.addEventListener("resize", () => {
    if (R.S && R.S.skjerm === "brett") tilpass();
  });

  // Where everything is now, so it can glide to where it ends up (FLIP).
  function posisjoner() {
    const m = new Map();
    R.$$(".skj-brett .skj-ting").forEach((el) => m.set(el.dataset.ting, el.getBoundingClientRect()));
    return m;
  }
  function glidFra(gml, ms) {
    if (R.rolig()) return;
    R.$$(".skj-brett .skj-ting").forEach((el, n) => {
      const a = gml.get(el.dataset.ting);
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(${n % 2 ? 14 : -14}deg) scale(1.08)` }, { transform: "none" }], {
        duration: (ms || 620) + (n % 5) * 60,
        easing: "cubic-bezier(.3,1.25,.5,1)",
      });
    });
  }

  // ---------- The magpie ----------

  const HODE = G.svg("skjaera").replace("<svg ", '<svg x="52" y="24" width="96" height="96" ');
  // A magpie wing: royal blue with a lighter sheen, a white patch and three feather tips.
  const VINGE =
    '<path d="M86 74C72 48 48 24 10 8C16 22 22 31 30 37C18 37 10 41 3 46C17 52 29 56 40 58C30 62 23 68 19 75C35 77 49 81 61 87C69 90 77 92 86 93Z" fill="#2f4ea8" stroke="#170e2b" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M80 72C66 50 46 30 16 14C32 27 50 45 64 66Z" fill="#5a86ea"/>' +
    '<ellipse cx="35" cy="46" rx="13" ry="5" transform="rotate(-30 35 46)" fill="#fff1dd"/>' +
    '<path d="M12 11L24 26M6 46L22 49M21 74L36 71" stroke="#8fd3ff" stroke-width="2.6" stroke-linecap="round"/>';
  const FUGL = `<svg class="skj-fugl-svg" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      <g class="skj-hale"><path d="M78 100L14 136C6 140 1 130 8 126L71 87Z" fill="#2a6f7d" stroke="#170e2b" stroke-width="4" stroke-linejoin="round"/><path d="M67 97L18 126" stroke="#3de3b0" stroke-width="3.2" stroke-linecap="round"/></g>
      <g class="skj-vinge v">${VINGE}</g>
      <g class="skj-vinge h"><g transform="translate(200 0) scale(-1 1)">${VINGE}</g></g>
      ${HODE}
    </svg>`;
  const SKJAERA_IKON = `<span class="skj-ikon-figur">${G.svg("skjaera")}</span>`;

  function himmel() {
    let h = R.$("#skj-himmel");
    if (!h) {
      h = document.createElement("div");
      h.id = "skj-himmel";
      h.className = "skj-himmel";
      h.setAttribute("aria-hidden", "true");
      document.body.appendChild(h);
    }
    return h;
  }
  function tomHimmel() {
    const h = R.$("#skj-himmel");
    if (h) h.innerHTML = "";
  }

  // The magpie's chatter: a quick rattle.
  function skratt() {
    for (let n = 0; n < 6; n++) {
      R.lyd.stoy(n * 0.08, 0.055, 0.2, 2500 + (n % 2) * 800);
      R.lyd.tone(1450 - n * 50, n * 0.08, 0.05, "square", 0.03, 950);
    }
  }

  // Fly through the targets [{ x, y, ved(fugl) }] (viewport px). retning 1 = to the right.
  function fly(mal, o = {}) {
    const fortsatt = R.vakt();
    // A target is only touched if the round is still on screen when the magpie gets there.
    mal = mal.map((m) => ({ ...m, ved: m.ved && ((fugl) => fortsatt() && m.ved(fugl)) }));
    return new Promise((ferdig) => {
      const lag = himmel();
      const fugl = document.createElement("div");
      fugl.className = "skj-fugl" + (o.retning < 0 ? " venstre" : "");
      fugl.innerHTML = `<span class="skj-kropp">${FUGL}</span><span class="skj-bytte">${o.bytte || ""}</span>`;
      lag.appendChild(fugl);
      const bw = fugl.offsetWidth;
      const bh = fugl.offsetHeight;
      const ank = { x: bw * 0.5, y: bh * 0.82 };
      const W = window.innerWidth;
      const hoyre = o.retning !== -1;
      if (R.rolig()) {
        // No flying: the magpie appears, does its thing, and leaves.
        fugl.style.transform = `translate(${W / 2 - ank.x}px, ${Math.max(10, (mal[0] ? mal[0].y : 200) - bh * 1.6)}px)`;
        mal.forEach((m, n) => setTimeout(() => m.ved && m.ved(fugl), 250 + n * 250));
        setTimeout(
          () => {
            fugl.remove();
            ferdig();
          },
          600 + mal.length * 250,
        );
        return;
      }
      const forste = mal[0] || { y: window.innerHeight / 3 };
      const punkter = [
        { x: hoyre ? -bw : W + bw, y: Math.max(bh, forste.y - 170) },
        ...mal,
        { x: hoyre ? W + bw * 1.3 : -bw * 1.3, y: -bh * 1.2 },
      ];
      const kf = [];
      let t = 0;
      for (let n = 0; n < punkter.length - 1; n++) {
        const a = punkter[n];
        const b = punkter[n + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const varighet = 230 + len * 0.7;
        const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - len * 0.2 };
        const steg = 10;
        for (let s = n === 0 ? 0 : 1; s <= steg; s++) {
          const u = s / steg;
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          kf.push({
            x: (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * c.x + e * e * b.x,
            y: (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * c.y + e * e * b.y,
            t: t + u * varighet,
          });
        }
        t += varighet;
        if (b.ved) {
          const vedTid = t;
          setTimeout(() => b.ved(fugl), vedTid);
          t += 170;
          kf.push({ x: b.x, y: b.y + 6, t });
        }
      }
      const total = t;
      const rammer = kf.map((k, n) => {
        const neste = kf[Math.min(n + 1, kf.length - 1)];
        const forrige = kf[Math.max(n - 1, 0)];
        const dx = neste.x - forrige.x;
        const dy = neste.y - forrige.y;
        const rot = R.klamp((Math.atan2(dy, Math.abs(dx) + 0.001) * 180) / Math.PI, -24, 24) * 0.7 * (hoyre ? 1 : -1);
        return { transform: `translate(${(k.x - ank.x).toFixed(1)}px, ${(k.y - ank.y).toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`, offset: k.t / total };
      });
      const anim = fugl.animate(rammer, { duration: total, easing: "linear", fill: "forwards" });
      anim.onfinish = () => {
        fugl.remove();
        ferdig();
      };
    });
  }

  // ---------- Phases ----------

  let seLoop = null;
  function startSe(S) {
    const fortsatt = R.vakt();
    const b = S.spill.b;
    const N = NIVAER[b.niva];
    const forsinkelse = R.rolig() ? 150 : 350 + N.ting * 45;
    setTimeout(() => {
      if (!fortsatt() || S.spill.b !== b || b.fase !== "se") return;
      const start = performance.now();
      const ms = N.sek * 1000;
      const bar = R.$(".skj-tid i");
      let sistSek = Math.ceil(ms / 1000);
      const steg = (na) => {
        if (!fortsatt() || b.fase !== "se" || opptatt) return;
        const andel = Math.max(0, 1 - (na - start) / ms);
        if (bar) bar.style.transform = `scaleX(${andel.toFixed(4)})`;
        const sek = Math.ceil((andel * ms) / 1000);
        if (sek !== sistSek) {
          sistSek = sek;
          if (sek > 0 && sek <= 3) R.lyd.tikk();
        }
        if (andel <= 0) {
          stjel(S);
          return;
        }
        seLoop = requestAnimationFrame(steg);
      };
      seLoop = requestAnimationFrame(steg);
    }, forsinkelse);
  }

  async function stjel(S) {
    const sp = S.spill;
    const b = sp.b;
    if (b.fase !== "se" || opptatt) return;
    opptatt = true;
    const fortsatt = R.vakt();
    cancelAnimationFrame(seLoop);
    const N = NIVAER[b.niva];
    settDokk(`<p class="skj-pst">Pssst … her kommer noen!</p>`);
    settTittel(SKJAERA_IKON, "Skjæra kommer!");
    R.$(".skj-under").innerHTML = "";
    R.$(".skj-brett").classList.remove("inn");
    R.si("Skjæra kommer!");
    skratt();
    R.vibrer(30);
    await R.vent(R.rolig() ? 150 : 450);
    if (!fortsatt()) return;
    const mal = b.stjalet
      .map((p) => {
        const r = rute(p).getBoundingClientRect();
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          ved: (fugl) => {
            const el = rute(p);
            const t = el && el.querySelector(".skj-ting");
            if (t) {
              t.classList.add("tatt");
              setTimeout(() => {
                if (fortsatt()) el.outerHTML = ruteHtml(p, -1);
              }, R.rolig() ? 0 : 260);
            }
            const pose = fugl.querySelector(".skj-bytte");
            pose.insertAdjacentHTML("beforeend", `<span>${esc(TING[b.brett[p]].e)}</span>`);
            R.lyd.pop();
            R.vibrer(15);
          },
        };
      })
      .sort((a, c) => a.x - c.x);
    R.lyd.sveip();
    await fly(mal, { retning: 1 });
    if (!fortsatt()) return;
    if (N.stokk) {
      settTittel("🌀", "Skjæra rotet til!");
      R.si("Skjæra rotet til alt!");
      await R.vent(R.rolig() ? 100 : 350);
      if (!fortsatt()) return;
      const gml = posisjoner();
      R.$(".skj-brett").innerHTML = b.plass.map((x, p) => ruteHtml(p, x)).join("");
      glidFra(gml, 680);
      R.lyd.sveip();
      setTimeout(() => R.lyd.sveip(), 180);
      await R.vent(R.rolig() ? 200 : 1000);
      if (!fortsatt()) return;
    }
    b.fase = "finn";
    R.lagre();
    opptatt = false;
    settHode(S);
    settDokk(valgHtml(b));
    R.si(`${tittelFor(b)} Velg blant ${b.valg.length} ting.`);
  }

  function flyTil(fraEl, tilEl, emoji) {
    return new Promise((ferdig) => {
      if (R.rolig() || !fraEl || !tilEl) return ferdig();
      const a = fraEl.getBoundingClientRect();
      const b = tilEl.getBoundingClientRect();
      const el = document.createElement("span");
      el.className = "skj-flyr";
      el.textContent = emoji;
      himmel().appendChild(el);
      const s = el.offsetWidth;
      const x0 = a.left + a.width / 2 - s / 2;
      const y0 = a.top + a.height / 2 - s / 2;
      const x1 = b.left + b.width / 2 - s / 2;
      const y1 = b.top + b.height / 2 - s / 2;
      const anim = el.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(1)` },
          { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 70}px) scale(1.5) rotate(-12deg)`, offset: 0.5 },
          { transform: `translate(${x1}px, ${y1}px) scale(1.2)` },
        ],
        { duration: 520, easing: "cubic-bezier(.4,0,.3,1)", fill: "forwards" },
      );
      anim.onfinish = () => {
        el.remove();
        ferdig();
      };
    });
  }

  // The round is decided the moment the last guess is made: the score and the "svar" phase are
  // saved right away, so leaving or reloading during the animation can never leave a dead board.
  // Safe to call twice (only the first call counts).
  function fullfor(S) {
    const sp = S.spill;
    const b = sp && sp.b;
    if (!b || b.fase !== "finn" || b.gjett.length < b.stjalet.length) return false;
    const fant = funnet(b).length;
    if (sp.modus === "solo") {
      if (fant === b.stjalet.length) sp.perfekte += 1;
    } else {
      sp.poeng[sp.tur] += fant;
      sp.rundePoeng[sp.tur] = fant;
    }
    b.fase = "svar";
    R.lagre();
    return true;
  }

  // Only the show: the magpie brings back what you didn't find, then the answer. The result is
  // already saved by fullfor().
  async function avslor(S) {
    const sp = S.spill;
    const b = sp.b;
    const N = NIVAER[b.niva];
    opptatt = true;
    const fortsatt = R.vakt();
    const st = tatte(b);
    const mangler = st.filter((x) => !b.gjett.includes(x));
    const perfekt = !mangler.length;
    await R.vent(R.rolig() ? 50 : 350);
    if (!fortsatt()) return;
    if (mangler.length) {
      settTittel(SKJAERA_IKON, "Skjæra kommer tilbake!");
      skratt();
      const tomme = R.$$(".skj-rute.tom").map((el) => Number(el.dataset.pos));
      const mal = mangler
        .map((x, n) => {
          const p = N.stokk ? tomme[n] : b.brett.indexOf(x);
          const r = rute(p).getBoundingClientRect();
          return {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            ved: (fugl) => {
              const pose = fugl.querySelector(`.skj-bytte span[data-ting="${x}"]`);
              if (pose) pose.remove();
              const el = rute(p);
              if (el) el.outerHTML = ruteHtml(p, x, { merk: () => ({ klasse: "slipp" }) });
              R.lyd.pop();
            },
          };
        })
        .sort((a, c) => c.x - a.x);
      await fly(mal, { retning: -1, bytte: mangler.map((x) => `<span data-ting="${x}">${esc(TING[x].e)}</span>`).join("") });
      if (!fortsatt()) return;
      R.lyd.feil();
    } else {
      R.lyd.riktig();
      setTimeout(() => R.lyd.pling(), 220);
      R.vibrer([30, 50, 30]);
    }
    if (N.stokk) {
      // Put everything back where it was, so you can see what it looked like.
      await R.vent(R.rolig() ? 50 : 450);
      if (!fortsatt()) return;
      settTittel("↩️", "Slik så det ut!");
      const gml = posisjoner();
      R.$(".skj-brett").innerHTML = brettHtml(b, b.brett);
      glidFra(gml, 720);
      R.lyd.sveip();
      await R.vent(R.rolig() ? 100 : 1100);
      if (!fortsatt()) return;
    } else {
      R.$(".skj-brett").innerHTML = brettHtml(b, b.brett);
    }
    if (perfekt && !R.rolig()) {
      R.$$(".skj-brett .skj-ting").forEach((el, n) =>
        el.animate([{ transform: "none" }, { transform: "translateY(-16px) scale(1.12) rotate(-6deg)" }, { transform: "none" }], { duration: 560, delay: n * 40, easing: "ease-out" }),
      );
    }
    opptatt = false;
    settHode(S);
    settDokk(svarHtml(S));
    R.si(`${tittelFor(b)} ${R.$(".skj-svar span") ? R.$(".skj-svar span").textContent : ""}`);
  }

  // ---------- Results ----------

  const stjerner = (S) => (Array.isArray(S.stjerner) ? S.stjerner : []);
  const laast = (S, L) => L > 0 && !(stjerner(S)[L - 1] >= 1);
  function nesteNiva(S) {
    const st = stjerner(S);
    for (let L = 0; L < NIVAER.length; L++) if (!laast(S, L) && !(st[L] >= 1)) return L;
    for (let L = 0; L < NIVAER.length; L++) if (!(st[L] >= 3)) return L;
    return NIVAER.length - 1;
  }
  const sumStjerner = (S) => stjerner(S).reduce((s, n) => s + (n || 0), 0);
  const stjerneRad = (n, maks = 3) => Array.from({ length: maks }, (_, i) => (i < n ? "★" : "☆")).join("");


  function vinnerBanner(rader) {
    const best = Math.max(...rader.map((r) => r.poeng));
    const vinnere = rader.filter((r) => r.poeng === best);
    const alene = vinnere.length === 1;
    return `<div class="banner aksent">
      ${alene ? `<span class="skj-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="skj-krone" aria-hidden="true">👑</span></span>` : R.figur()}
      <p class="etikett">${alene ? `${best} ting funnet` : `Like mange ting · ${best} hver`}</p>
      <h1 id="skjerm-tittel">${esc(`${R.ramsOpp(vinnere.map((r) => R.navn(r.i)))} vinner!`)}</h1>
    </div>`;
  }

  // ---------- Start ----------

  R.start({
    id: "skjaera",
    versjon: 1,
    // A game (a solo level or a round with friends) is in progress until its result screen.
    pagar: (S) => !!(S.spill && !S.spill.ferdig),

    tilstand: () => ({
      antall: 3,
      oppsett: { niva: "lett", runder: 3 },
      stjerner: [],
      spill: null,
    }),

    lastet(S) {
      if (!S.oppsett || !(S.oppsett.niva in START)) S.oppsett = { niva: "lett", runder: 3 };
      if (![3, 5].includes(S.oppsett.runder)) S.oppsett.runder = 3;
      S.stjerner = stjerner(S)
        .slice(0, NIVAER.length)
        .map((n) => R.klamp(Number(n) || 0, 0, 3));
      S.antall = R.klamp(Number(S.antall) || 3, 2, 8);
      const sp = S.spill;
      if (sp) {
        const b = sp.b;
        const ok =
          b &&
          NIVAER[b.niva] &&
          Array.isArray(b.brett) &&
          b.brett.every((x) => TING[x]) &&
          Array.isArray(b.valg) &&
          b.valg.every((x) => TING[x]) &&
          Array.isArray(b.gjett) &&
          ["se", "finn", "svar"].includes(b.fase) &&
          (sp.modus === "solo" || (Array.isArray(sp.poeng) && sp.poeng.length === sp.antall));
        if (!ok) S.spill = null;
        // All guesses used but the round not closed (saved by an older version): close it now.
        else fullfor(S);
      }
      const spillSkjerm = ["brett", "gi", "stilling", "nivaklart", "slutt"];
      if (!S.spill && spillSkjerm.includes(S.skjerm)) S.skjerm = "hjem";
    },

    regler: {
      intro: "Se godt på tingene. Så kommer skjæra og stjeler noe! Klarer du å se hva som mangler?",
      steg: [
        ["Se godt", "Tingene vises i noen sekunder. Prøv å huske alle sammen."],
        ["Skjæra stjeler", "Skjæra flyr forbi og tar med seg noe. På de vanskelige nivåene roter den til resten også."],
        ["Hva mangler?", "Trykk på det skjæra tok. Du har like mange forsøk som ting som mangler."],
      ],
      tips: [
        "Si tingene høyt mens du ser på dem. Da husker du dem bedre.",
        "Alene: Samle stjerner og lås opp alle de tolv nivåene. En runde uten feil gir en stjerne.",
        "Sammen: Alle får hvert sitt brett. Hver ting du finner, gir ett poeng.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          const aktiv = sp && !sp.ferdig;
          const fortsett = aktiv
            ? R.ui.knapp(sp.modus === "solo" ? `Fortsett · nivå ${sp.niva + 1}` : `Fortsett · runde ${sp.runde + 1} av ${sp.runder}`, "fortsett", { ikon: "▶" })
            : "";
          const sum = sumStjerner(S);
          return R.ui.spillhjem({
            slagordHtml: "Se godt på tingene.<br><em>Skjæra stjeler noe!</em>",
            knapperHtml:
              fortsett +
              R.ui[aktiv ? "knapp2" : "knapp"]("Spill alene", "alene", { ikon: "⭐", variant: aktiv ? "" : "stor", tekstHtml: `Spill alene${sum ? ` <small class="skj-sum">${sum} ★</small>` : ""}` }) +
              R.ui.knapp2("Spill sammen", "sammen", { ikon: "🦊🐸" }) +
              R.ui.lenke("Slik spiller du", "regler"),
            merker: [
              ["1–8", "spillere"],
              [String(NIVAER.length), "nivåer"],
              [String(TING.length), "ting"],
            ],
          });
        },
      },

      nivaer: {
        tittel: "Alene",
        tilbake: "hjem",
        vis(S) {
          const st = stjerner(S);
          const neste = nesteNiva(S);
          return `
            <div class="skj-kart-hode">
              <span class="skj-kart-figur">${R.figur()}</span>
              <div>
                <h1 id="skjerm-tittel">Velg nivå</h1>
                <p class="skj-kart-sum"><b>${sumStjerner(S)}</b> av ${NIVAER.length * 3} ★</p>
              </div>
            </div>
            <ol class="skj-kart">${NIVAER.map((N, L) => {
              const lukket = laast(S, L);
              const n = st[L] || 0;
              return `<li><button class="skj-niva${L === neste ? " neste" : ""}${n === 3 ? " full" : ""}" data-h="niva" data-v="${L}" style="--h:${(L * 27) % 360}"${lukket ? " disabled" : ""} aria-label="Nivå ${L + 1}${lukket ? ", låst" : `, ${n} av 3 stjerner`}">
                <b>${L + 1}</b>
                <span class="skj-niva-st" aria-hidden="true">${lukket ? "🔒" : stjerneRad(n)}</span>
                <small aria-hidden="true">${N.ting} ting${N.stokk ? " · 🌀" : ""}</small>
              </button></li>`;
            }).join("")}</ol>
            <p class="hjelp">🌀 = skjæra roter til brettet. En runde uten feil gir en stjerne.</p>
            ${R.ui.dokk(R.ui.knapp(`Spill nivå ${neste + 1}`, "niva", { v: neste, variant: "stor" }))}`;
        },
      },

      oppsett: {
        tittel: "Spill sammen",
        tilbake: "hjem",
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          ${R.ui.spillere({ min: 2, max: 8, tittel: "Hvem spiller?", hjelp: "Dere sender mobilen rundt. Alle får hvert sitt brett." })}
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Hvor vanskelig?</h2></div>
            ${R.ui.seg("vanskelighet", [["lett", "Lett"], ["middels", "Middels"], ["vanskelig", "Vanskelig"]], S.oppsett.niva, { etikett: "Vanskelighet" })}
            <p class="hjelp">Det blir litt vanskeligere for hver runde.</p>
          </section>
          <section class="seksjon">
            <div class="seksjon-hode"><h2>Antall runder</h2></div>
            ${R.ui.seg("runder", [[3, "3 runder"], [5, "5 runder"]], S.oppsett.runder, { etikett: "Antall runder" })}
          </section>
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: "👀" }))}`,
      },

      gi: {
        tittel: (S) => `Runde ${S.spill.runde + 1} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis: (S) =>
          R.ui.giTil({
            i: S.spill.tur,
            h: "klar-spiller",
            knapp: "Jeg er klar!",
            tekst: "Gi mobilen til",
            advarsel: "De andre kan se på – men ikke hviske!",
            ikon: "👀",
            prikker: [S.spill.antall, S.spill.tur],
          }),
      },

      brett: {
        tittel: (S) => (S.spill.modus === "solo" ? `Nivå ${S.spill.niva + 1} · runde ${S.spill.runde + 1} av ${RUNDER_SOLO}` : `Runde ${S.spill.runde + 1} av ${S.spill.runder}`),
        tilbake: "hjem",
        vis(S) {
          const b = S.spill.b;
          const N = NIVAER[b.niva];
          const layout = b.fase === "se" ? b.brett : visning(b);
          const inn = nyttBrett && b.fase === "se";
          nyttBrett = false;
          return `
            ${hodeHtml(S)}
            <div class="skj-bord">
              <div class="skj-brett${inn ? " inn" : ""}" data-n="${layout.length}" data-kol="${N.kol}" style="--kol:${N.kol}" role="group" aria-label="Tingene">
                ${b.fase === "svar" ? brettHtml(b, layout) : layout.map((x, p) => ruteHtml(p, x)).join("")}
              </div>
            </div>
            ${R.ui.dokk(`<div class="skj-dokk" style="min-height:${dokkHoyde(N)}px">${dokkInnhold(S)}</div>`)}`;
        },
        etter() {
          tilpass();
        },
        inn(S) {
          opptatt = false;
          R.holdVaken();
          // Never a dead board: a round whose guesses are all used is shown as answered.
          if (fullfor(S)) return R.vis();
          if (S.spill.b.fase === "se") {
            if (!R.rolig()) R.lyd.pop();
            startSe(S);
          }
        },
        ut() {
          opptatt = false;
          cancelAnimationFrame(seLoop);
          tomHimmel();
          R.slippVaken();
        },
      },

      nivaklart: {
        tittel: (S) => `Nivå ${S.spill.niva + 1}`,
        tilbake: "nivaer",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const n = sp.perfekte;
          const L = sp.niva;
          const sisteNiva = L === NIVAER.length - 1;
          const tittel = n === 0 ? "Skjæra vant!" : sisteNiva ? "Du klarte alt!" : `Nivå ${L + 1} klart!`;
          const tekst =
            n === 0
              ? "Ingen runder uten feil denne gangen. Prøv igjen – du klarer det!"
              : n === 3
                ? "Tre runder uten en eneste feil!"
                : `${n} av 3 runder uten feil.${n < 3 ? " Klarer du alle tre?" : ""}`;
          const knapper =
            n > 0 && !sisteNiva
              ? R.ui.dokk(R.ui.knapp(`Neste nivå (${L + 2})`, "niva", { v: L + 1, ikon: "➜" }), R.ui.lenkerad(R.ui.lenke("Prøv igjen", "niva", { v: L }), R.ui.lenke("Alle nivåer", "alene")))
              : R.ui.dokk(R.ui.knapp("Prøv igjen", "niva", { v: L }), R.ui.lenkerad(R.ui.lenke("Alle nivåer", "alene"), '<a class="lenke" href="/">Alle spill</a>'));
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${n === 3 ? "Perfekt!" : n > 0 ? "Godt jobba!" : "Godt forsøk!"}</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="skj-store-stjerner" aria-label="${n} av 3 stjerner">${[1, 2, 3].map((k) => `<span class="${k <= n ? "pa" : ""}" style="--k:${k}">★</span>`).join("")}</p>
              <p class="ingress">${esc(tekst)}</p>
              ${sp.nyRekord && n > 0 ? '<p class="skj-rekord">Ny rekord på nivået!</p>' : ""}
              ${sp.lasteOpp ? `<p class="skj-rekord mynte">🔓 Nivå ${L + 2} er låst opp!</p>` : ""}
            </div>
            ${knapper}`;
        },
        // Celebrate in proportion: fanfare for two or three stars, a warm "pling" otherwise.
        inn(S) {
          const n = S.spill.perfekte;
          if (n >= 2) {
            R.lyd.fanfare();
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
        },
      },

      stilling: {
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
              ${R.figur()}
              <p class="etikett">Runde ${sp.runde + 1} av ${sp.runder} er ferdig</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
            </div>
            ${R.ui.poengliste(rader)}
            <p class="hjelp">Neste runde blir litt vanskeligere …</p>
            ${R.ui.dokk(R.ui.knapp("Neste runde", "neste-runde", { ikon: "➜" }))}`;
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = sp.poeng.map((p, i) => ({ i, poeng: p }));
          return `
            ${vinnerBanner(rader)}
            ${sp.antall >= 3 ? R.ui.pall(rader) : ""}
            ${R.ui.poengliste(rader)}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "sammen"), '<a class="lenke" href="/">Alle spill</a>'))}`;
        },
        inn() {
          R.lyd.fanfare();
          R.konfetti();
        },
      },
    },

    handlinger: (H = {
      hjem: () => R.gaTil("hjem"),
      alene: () => R.gaTil("nivaer"),
      sammen: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.ferdig) return R.gaTil("hjem");
        R.gaTil(sp.modus === "flere" && sp.b.fase === "se" && !sp.b.gjett.length ? "gi" : "brett");
      },
      async niva(el, e, S) {
        const L = R.klamp(Number(el.dataset.v) || 0, 0, NIVAER.length - 1);
        if (laast(S, L)) return;
        // Never throw away a running game without asking (and do nothing if the screen changed meanwhile).
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig))) || !fortsatt()) return;
        S.spill = { modus: "solo", niva: L, runde: 0, perfekte: 0, b: lagRunde(L), ferdig: false };
        nyttBrett = true;
        R.gaTil("brett");
      },
      vanskelighet(el, e, S) {
        S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      async start(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(!!(S.spill && !S.spill.ferdig))) || !fortsatt()) return;
        const antall = R.klamp(S.antall || 2, 2, 8);
        const start = START[S.oppsett.niva] || 0;
        S.spill = {
          modus: "flere",
          antall,
          runder: S.oppsett.runder,
          runde: 0,
          tur: 0,
          start,
          poeng: Array.from({ length: antall }, () => 0),
          rundePoeng: Array.from({ length: antall }, () => 0),
          b: lagRunde(start),
          ferdig: false,
        };
        R.gaTil("gi");
      },
      igjen(el, e, S) {
        H.start(el, e, S);
      },
      "klar-spiller"() {
        nyttBrett = true;
        R.gaTil("brett");
      },
      klar(el, e, S) {
        stjel(S);
      },
      // Right: the thing flies back into its place. Wrong: a cross (and a wiggle if it's on the board).
      gjett(el, e, S) {
        const b = S.spill && S.spill.b;
        if (!b || b.fase !== "finn" || opptatt) return;
        const x = Number(el.dataset.v);
        if (!TING[x] || b.gjett.includes(x) || b.gjett.length >= b.stjalet.length) return;
        const st = tatte(b);
        const rett = st.includes(x);
        const fortsatt = R.vakt();
        b.gjett.push(x);
        // The last guess decides the round now (saved), the animations come afterwards.
        const ferdig = fullfor(S);
        R.lagre();
        el.disabled = true;
        el.classList.add(rett ? "rett" : "feil");
        const luker = R.$(".skj-luker");
        if (luker) luker.outerHTML = lukerHtml(b);
        if (rett) {
          R.lyd.riktig();
          R.vibrer(20);
          R.si(`Riktig: ${TING[x].n}`);
          const N = NIVAER[b.niva];
          const tom = N.stokk ? R.$(".skj-rute.tom") : rute(b.brett.indexOf(x));
          if (tom) {
            tom.classList.remove("tom");
            tom.classList.add("venter");
            opptatt = true;
            flyTil(el.querySelector(".skj-valg-e"), tom, TING[x].e).then(() => {
              if (!fortsatt()) return;
              const p = Number(tom.dataset.pos);
              tom.outerHTML = ruteHtml(p, x, { merk: () => ({ klasse: "landet" }) });
              opptatt = false;
              if (ferdig) avslor(S);
            });
            return;
          }
        } else {
          R.lyd.feil();
          R.vibrer([40, 40, 40]);
          const her = R.$(`.skj-brett .skj-ting[data-ting="${x}"]`);
          if (her) {
            R.toast(`${TING[x].e} ${TING[x].n} er jo her!`);
            if (!R.rolig()) her.animate([{ transform: "none" }, { transform: "rotate(-14deg) scale(1.15)" }, { transform: "rotate(12deg) scale(1.15)" }, { transform: "none" }], { duration: 600 });
          }
          R.si(`Nei, ikke ${TING[x].n}`);
        }
        if (ferdig) setTimeout(() => fortsatt() && avslor(S), R.rolig() ? 200 : 650);
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.b.fase !== "svar" || opptatt) return;
        if (sp.modus === "solo") {
          if (sp.runde + 1 < RUNDER_SOLO) {
            sp.runde += 1;
            sp.b = lagRunde(sp.niva);
            nyttBrett = true;
            R.gaTil("brett");
            return;
          }
          const L = sp.niva;
          const gml = stjerner(S)[L] || 0;
          const varLast = L + 1 < NIVAER.length && laast(S, L + 1);
          S.stjerner = stjerner(S).slice();
          while (S.stjerner.length < NIVAER.length) S.stjerner.push(0);
          S.stjerner[L] = Math.max(gml, sp.perfekte);
          sp.nyRekord = sp.perfekte > gml && gml > 0;
          sp.lasteOpp = varLast && !laast(S, L + 1);
          sp.ferdig = true;
          R.gaTil("nivaklart");
          return;
        }
        if (sp.tur + 1 < sp.antall) {
          sp.tur += 1;
          sp.b = lagRunde(nivaForRunde(sp));
          R.gaTil("gi");
          return;
        }
        if (sp.runde + 1 < sp.runder) {
          R.gaTil("stilling");
          return;
        }
        sp.ferdig = true;
        R.gaTil("slutt");
      },
      "neste-runde"(el, e, S) {
        const sp = S.spill;
        sp.runde += 1;
        sp.tur = 0;
        sp.rundePoeng = sp.rundePoeng.map(() => 0);
        sp.b = lagRunde(nivaForRunde(sp));
        R.gaTil("gi");
      },
    }),
  });
})();
