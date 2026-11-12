/* Admiralen — "Slagskip" (Battleship).
   Place your fleet (drag the ships, tap to move or turn, or let the dice place them), then take
   turns firing at the enemy waters. Against the computer on three levels, or two players on one
   phone with a «Gi mobilen til …» gate between turns, so nobody sees the other fleet.
   Rules: ships lie straight and may not touch each other, not even at a corner, so the water
   around a sunk ship is shown at once. The computer only sees what a player would see: its own
   shots and which ships are sunk. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  let H; // the actions, so one action can reuse another

  // The "install as an app" tip at a calm moment – only if the player is still on this screen.
  // (The kit shows it after R.kveld.registrer; games without an evening score call it here.)
  function visTipsSnart() {
    const fortsatt = R.vakt();
    setTimeout(() => fortsatt() && R.visInstallTips(), 2500);
  }

  const BOKSTAV = "ABCDEFGHIJ";
  const FLATER = {
    10: [
      ["hangar", 5],
      ["slag", 4],
      ["fregatt", 3],
      ["ubat", 3],
      ["torpedo", 2],
    ],
    8: [
      ["slag", 4],
      ["fregatt", 3],
      ["ubat", 3],
      ["torpedo", 2],
    ],
  };
  // [definite form, indefinite form, «yours» («fregatten din», «slagskipet ditt»)]. Every text goes
  // through R.t (rusj/SPRAK.md): the key is the Norwegian text, and each language bends the names its own way.
  const SKIPSNAVN = {
    hangar: [R.t("hangarskipet"), R.t("Hangarskip"), R.t("hangarskipet ditt")],
    slag: [R.t("slagskipet"), R.t("Slagskip"), R.t("slagskipet ditt")],
    fregatt: [R.t("fregatten"), R.t("Fregatt"), R.t("fregatten din")],
    ubat: [R.t("ubåten"), R.t("Ubåt"), R.t("ubåten din")],
    torpedo: [R.t("torpedobåten"), R.t("Torpedobåt"), R.t("torpedobåten din")],
  };
  const bestemt = (id) => SKIPSNAVN[id][0];
  const NIVAER = [
    ["lett", R.t("Lett")],
    ["middels", R.t("Middels")],
    ["vanskelig", R.t("Vanskelig")],
  ];
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const rute = (i, n) => BOKSTAV[i % n] + (Math.floor(i / n) + 1);

  // ---------- The board (pure functions) ----------

  // Cells of a ship { x, y, r: "h" | "v", lengde }.
  function celler(s, n) {
    const ut = [];
    for (let k = 0; k < s.lengde; k++) ut.push((s.y + (s.r === "v" ? k : 0)) * n + s.x + (s.r === "h" ? k : 0));
    return ut;
  }
  const innenfor = (s, n) => s.x >= 0 && s.y >= 0 && (s.r === "h" ? s.x + s.lengde <= n && s.y < n : s.y + s.lengde <= n && s.x < n);

  function naboer(i, n, skra) {
    const x = i % n;
    const y = Math.floor(i / n);
    const ut = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!skra && dx && dy)) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n) ut.push(ny * n + nx);
      }
    return ut;
  }

  // Every ship inside the board, no overlaps, and no two ships touching (not even at a corner).
  function gyldig(flate, n) {
    const eier = new Map();
    for (let k = 0; k < flate.length; k++) {
      if (!innenfor(flate[k], n)) return false;
      for (const c of celler(flate[k], n)) {
        if (eier.has(c)) return false;
        eier.set(c, k);
      }
    }
    for (const [c, k] of eier) for (const m of naboer(c, n, true)) if (eier.has(m) && eier.get(m) !== k) return false;
    return true;
  }

  function tilfeldigFlate(n, tilfeldig) {
    const t = tilfeldig || Math.random;
    for (let forsok = 0; forsok < 500; forsok++) {
      const flate = [];
      for (const [id, lengde] of FLATER[n]) {
        let plassert = false;
        for (let p = 0; p < 300 && !plassert; p++) {
          const s = { id, lengde, r: t() < 0.5 ? "h" : "v", x: Math.floor(t() * n), y: Math.floor(t() * n) };
          if (innenfor(s, n) && gyldig([...flate, s], n)) {
            flate.push(s);
            plassert = true;
          }
        }
        if (!plassert) break;
      }
      if (flate.length === FLATER[n].length) return flate;
    }
    throw new Error("Fant ingen plassering");
  }

  // What the shooter knows about the other side's waters: 0 unknown, 1 miss, 2 hit, 3 sunk ship,
  // 4 water around a sunk ship (known to be empty).
  function tavle(flate, skudd, n) {
    const eier = new Map();
    flate.forEach((s, k) => celler(s, n).forEach((c) => eier.set(c, k)));
    const skutt = new Set(skudd);
    const senket = flate.map((s) => celler(s, n).every((c) => skutt.has(c)));
    const t = new Array(n * n).fill(0);
    for (const c of skutt) t[c] = eier.has(c) ? (senket[eier.get(c)] ? 3 : 2) : 1;
    flate.forEach((s, k) => {
      if (!senket[k]) return;
      for (const c of celler(s, n)) for (const m of naboer(c, n, true)) if (t[m] === 0) t[m] = 4;
    });
    return { t, senket, eier };
  }

  // Groups of hits that touch: since ships never touch, each group is (part of) one ship.
  function grupper(treff, n) {
    const sett = new Set(treff);
    const sett2 = new Set();
    const ut = [];
    for (const i of treff) {
      if (sett2.has(i)) continue;
      const g = [];
      const ko = [i];
      sett2.add(i);
      while (ko.length) {
        const c = ko.pop();
        g.push(c);
        for (const m of naboer(c, n)) {
          if (!sett.has(m) || sett2.has(m)) continue;
          sett2.add(m);
          ko.push(m);
        }
      }
      ut.push(g.sort((a, b) => a - b));
    }
    return ut;
  }

  // The computer's next shot. It sees only `t` (as above) and the lengths of the ships still
  // afloat – never where they are.
  //   lett: random shots, and now and then a shot next to a hit
  //   middels: half a checkerboard hunt, then it follows the line of hits
  //   vanskelig: counts every way the remaining ships could still lie and fires where most of them meet
  function maskinVelg(niva, n, t, igjen, tilfeldig) {
    const r = tilfeldig || Math.random;
    const velg = (liste) => liste[Math.floor(r() * liste.length)];
    const ukjent = [];
    const treff = [];
    t.forEach((v, i) => (v === 0 ? ukjent.push(i) : v === 2 ? treff.push(i) : null));
    if (!ukjent.length) return -1;
    const rundt = (i) => naboer(i, n).filter((m) => t[m] === 0);

    if (niva === "lett") {
      if (treff.length && r() < 0.35) {
        const c = [...new Set(treff.flatMap(rundt))];
        if (c.length) return velg(c);
      }
      return velg(ukjent);
    }

    if (niva === "middels") {
      for (const g of grupper(treff, n)) {
        let c = [];
        if (g.length > 1) {
          const vannrett = Math.floor(g[0] / n) === Math.floor(g[1] / n);
          const a = g[0];
          const b = g[g.length - 1];
          if (vannrett) {
            if (a % n > 0 && t[a - 1] === 0) c.push(a - 1);
            if (b % n < n - 1 && t[b + 1] === 0) c.push(b + 1);
          } else {
            if (a >= n && t[a - n] === 0) c.push(a - n);
            if (b + n < n * n && t[b + n] === 0) c.push(b + n);
          }
        }
        if (!c.length) c = [...new Set(g.flatMap(rundt))];
        if (c.length) return velg(c);
      }
      // Half of the time it hunts in a checkerboard pattern, otherwise anywhere.
      const sjakk = ukjent.filter((i) => ((i % n) + Math.floor(i / n)) % 2 === 0);
      return velg(sjakk.length && r() < 0.5 ? sjakk : ukjent);
    }

    // vanskelig: probability density over every possible placement
    const treffSett = new Set(treff);
    const blokkert = (c) => t[c] === 1 || t[c] === 3 || t[c] === 4;
    const tell = (maaDekke) => {
      const vekt = new Array(n * n).fill(0);
      for (const L of igjen)
        for (const retning of ["h", "v"])
          for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
              const s = { x, y, r: retning, lengde: L };
              if (!innenfor(s, n)) continue;
              const cs = celler(s, n);
              if (cs.some(blokkert)) continue;
              const csSett = new Set(cs);
              // A hit right next to this ship would belong to another ship – but ships never touch.
              if (cs.some((c) => naboer(c, n, true).some((m) => treffSett.has(m) && !csSett.has(m)))) continue;
              const dekker = cs.filter((c) => treffSett.has(c)).length;
              if (maaDekke && !dekker) continue;
              const w = dekker ? 40 ** dekker : 1;
              for (const c of cs) if (t[c] === 0) vekt[c] += w;
            }
      return vekt;
    };
    let vekt = tell(treff.length > 0);
    if (treff.length && !ukjent.some((i) => vekt[i] > 0)) vekt = tell(false);
    let best = 0;
    let beste = [];
    for (const i of ukjent) {
      if (vekt[i] > best) {
        best = vekt[i];
        beste = [i];
      } else if (vekt[i] === best && best > 0) beste.push(i);
    }
    return beste.length ? velg(beste) : velg(ukjent);
  }

  // ---------- Sounds ----------

  const LYD = {
    sikt: () => R.lyd.tone(980, 0, 0.05, "square", 0.05),
    bom: () => {
      R.lyd.tone(420, 0, 0.18, "sine", 0.1, 140);
      R.lyd.stoy(0.05, 0.45, 0.22, 900, "lowpass");
      R.lyd.stoy(0.25, 0.4, 0.08, 2400);
    },
    treff: () => {
      R.lyd.stoy(0, 0.55, 0.5, 380, "lowpass");
      R.lyd.tone(95, 0, 0.5, "sine", 0.35, 42);
      R.lyd.stoy(0.03, 0.2, 0.18, 2600);
    },
    senk: () => {
      R.lyd.bom();
      [0.55, 0.75, 0.95].forEach((t, k) => R.lyd.tone(330 - k * 60, t, 0.16, "sine", 0.09, 200 - k * 40));
    },
  };

  // ---------- Markup ----------

  // One board. o: { flate (own ships to draw), t (what is known), sikte, valgt, knapp (h), liten, fersk }
  function brettHtml(n, o = {}) {
    const skipCelle = new Map();
    (o.flate || []).forEach((s, k) => {
      const cs = celler(s, n);
      cs.forEach((c, j) => skipCelle.set(c, { k, del: cs.length === 1 ? "en" : j === 0 ? "forst" : j === cs.length - 1 ? "sist" : "midt", r: s.r }));
    });
    const t = o.t || null;
    const kol = range(n)
      .map((x) => `<span class="ad-merke" aria-hidden="true">${BOKSTAV[x]}</span>`)
      .join("");
    const rader = range(n)
      .map((y) => {
        const ruter = range(n)
          .map((x) => {
            const i = y * n + x;
            const sk = skipCelle.get(i);
            const v = t ? t[i] : 0;
            const klasser = ["ad-rute"];
            if (sk) klasser.push("skip", sk.r, sk.del, sk.k === o.valgt ? "valgt" : "");
            if (v) klasser.push(["", "bom", "treff", "senket", "vann"][v]);
            if (o.sikte === i) klasser.push("sikte");
            if (o.fersk && o.fersk.i === i) klasser.push("ny-" + o.fersk.type);
            if (o.fersk && o.fersk.senk && o.fersk.senk.includes(i)) klasser.push("ny-senk");
            const tilstand = v === 1 ? R.t("bom") : v === 2 ? R.t("treff") : v === 3 ? R.t("senket skip") : v === 4 ? R.t("vann") : sk && !t ? SKIPSNAVN[o.flate[sk.k].id][1] : sk ? R.t("eget skip") : "";
            const etikett = `${rute(i, n)}${tilstand ? ", " + tilstand : ""}`;
            if (!o.knapp || o.liten) return `<span class="${klasser.filter(Boolean).join(" ")}" data-celle="${i}"></span>`;
            const av = o.knapp === "sikt" && v !== 0;
            return `<button class="${klasser.filter(Boolean).join(" ")}" data-h="${o.knapp}" data-v="${i}" data-celle="${i}" aria-label="${esc(etikett)}"${av ? ' aria-disabled="true" data-stille' : ""}${o.sikte === i ? ' aria-pressed="true"' : ""}></button>`;
          })
          .join("");
        return `<span class="ad-merke" aria-hidden="true">${y + 1}</span>${ruter}`;
      })
      .join("");
    return `<div class="ad-brett${o.liten ? " liten" : ""}${o.mal ? " mal" : ""}${o.plassering ? " ad-plassering" : ""}" style="--n: ${n}" role="group" aria-label="${esc(o.etikett || R.t("Brettet"))}">
      <span class="ad-merke hjorne" aria-hidden="true"></span>${kol}${rader}
    </div>`;
  }

  function skipListe(flate, senket, o = {}) {
    return `<ul class="ad-skipliste${o.liten ? " liten" : ""}">${flate
      .map(
        (s, k) =>
          `<li class="${senket && senket[k] ? "senket" : ""}${o.valgt === k ? " valgt" : ""}">${
            o.h ? `<button data-h="${o.h}" data-v="${k}" aria-pressed="${o.valgt === k}">` : ""
          }<span class="ad-skipnavn">${SKIPSNAVN[s.id][1]}</span><span class="ad-skiplengde" aria-label="${esc(R.t("{n} ruter", { n: s.lengde }))}">${"<i></i>".repeat(s.lengde)}</span>${o.h ? "</button>" : ""}</li>`,
      )
      .join("")}</ul>`;
  }

  // ---------- Game flow ----------

  const navnFor = (sp, s) => sp.navn[s];
  const MASKIN = 1;
  const maskin = (sp) => sp.modus === "maskin";
  const igjenLengder = (flate, senket) => flate.filter((s, k) => !senket[k]).map((s) => s.lengde);
  const stillingNokkel = (sp) => (maskin(sp) ? "maskin:" + sp.niva + ":" + sp.n : "to:" + sp.navn.join("|") + ":" + sp.n);

  function nyttSpill(S) {
    const o = S.oppsett;
    const n = o.brett;
    const forrige = S.spill;
    const navn = o.modus === "maskin" ? [R.navn(0), R.t("Mobilen")] : [R.navn(0), R.navn(1)];
    // Who fires first alternates from game to game.
    const starter = forrige && forrige.modus === o.modus ? 1 - (forrige.starter || 0) : 0;
    const sp = {
      modus: o.modus,
      niva: o.niva,
      n,
      ekstra: !!o.ekstra,
      navn,
      flate: [tilfeldigFlate(n), tilfeldigFlate(n)],
      skudd: [[], []],
      starter: o.modus === "maskin" ? 0 : starter,
      tur: o.modus === "maskin" ? 0 : starter,
      ser: 0,
      fase: o.modus === "maskin" ? "plasser" : "gate",
      plasserer: 0,
      valgt: null,
      sikte: null,
      vinner: null,
      melding: null,
      klar: [false, o.modus === "maskin"],
      feiret: false,
    };
    S.spill = sp;
    R.statistikk("start", { modus: sp.modus, niva: sp.niva, brett: n, ekstra: sp.ekstra });
    if (sp.modus === "maskin") R.gaTil("plasser");
    else {
      sp.gate = { til: 0, neste: "plasser" };
      R.gaTil("gi");
    }
  }

  // The newest shot is animated once on the next drawing.
  let fersk = null;
  let maskinKjorer = false;

  function skyt(S, s, i) {
    const sp = S.spill;
    const mot = 1 - s;
    const for_ = tavle(sp.flate[mot], sp.skudd[s], sp.n);
    if (for_.t[i] !== 0) return null;
    sp.skudd[s].push(i);
    const { t, senket, eier } = tavle(sp.flate[mot], sp.skudd[s], sp.n);
    const k = eier.has(i) ? eier.get(i) : -1;
    const type = t[i] === 3 ? "senk" : t[i] === 2 ? "treff" : "bom";
    const skip = k >= 0 ? sp.flate[mot][k] : null;
    fersk = { side: mot, i, type: type === "bom" ? "bom" : "treff", senk: type === "senk" ? celler(skip, sp.n) : null };
    const alle = senket.every(Boolean);
    const navn = rute(i, sp.n);
    // Plain text; it is escaped where it is shown.
    if (s === MASKIN && maskin(sp)) {
      sp.melding = {
        type: type === "bom" ? "bom" : "treff",
        tekst:
          type === "bom"
            ? R.t("Mobilen bommet på {rute}.", { rute: navn })
            : type === "senk"
              ? R.t("Mobilen senket {skip}!", { skip: SKIPSNAVN[skip.id][2] })
              : R.t("Mobilen traff {skip} på {rute}!", { skip: SKIPSNAVN[skip.id][2], rute: navn }),
      };
    } else {
      sp.melding = {
        type: type === "bom" ? "bom" : type,
        tekst: type === "bom" ? R.t("Plask! Bom på {rute}.", { rute: navn }) : type === "senk" ? R.t("Du senket {skip}!", { skip: bestemt(skip.id) }) : R.t("Treff på {rute}!", { rute: navn }),
      };
    }
    if (type === "bom") LYD.bom();
    else if (type === "treff") LYD.treff();
    else LYD.senk();
    R.vibrer(type === "bom" ? 15 : type === "treff" ? [40, 30, 60] : [80, 40, 160]);
    R.si(sp.melding.tekst);
    if (alle) {
      sp.vinner = s;
      sp.tur = null;
      if (maskin(sp) && s === 0) R.merke("klassiker-admiralen");
      if (!sp.talt) {
        sp.talt = true;
        const nokkel = stillingNokkel(sp);
        const st = (S.stilling[nokkel] = S.stilling[nokkel] || [0, 0]);
        st[s] += 1;
        const keys = Object.keys(S.stilling);
        if (keys.length > 20) delete S.stilling[keys[0]];
      }
    } else if (!(type !== "bom" && sp.ekstra)) sp.tur = mot;
    return { type, alle };
  }

  // The end of a game comes after a short pause, so the last explosion can be seen.
  async function tilSlutt(S) {
    const fortsatt = R.vakt();
    await R.vent(R.rolig() ? 500 : 1500);
    if (fortsatt() && S.spill && S.spill.vinner != null) R.gaTil("slutt");
  }

  async function maskinTur(S) {
    const sp = S.spill;
    if (maskinKjorer || !sp || !maskin(sp) || sp.tur !== MASKIN || sp.vinner != null) return;
    maskinKjorer = true;
    const fortsatt = R.vakt();
    try {
      while (sp.tur === MASKIN && sp.vinner == null) {
        sp.melding = { type: "venter", tekst: R.t("Mobilen sikter …") };
        sp.visEgen = true; // on a phone your own fleet takes the big board while the computer fires
        R.vis();
        await R.vent(R.rolig() ? 400 : 950);
        if (!fortsatt() || S.spill !== sp) return;
        const { t, senket } = tavle(sp.flate[0], sp.skudd[MASKIN], sp.n);
        const i = maskinVelg(sp.niva, sp.n, t, igjenLengder(sp.flate[0], senket));
        if (i < 0) return;
        const res = skyt(S, MASKIN, i);
        R.vis();
        if (res && res.alle) {
          tilSlutt(S);
          return;
        }
        if (sp.tur === MASKIN) {
          await R.vent(R.rolig() ? 300 : 700);
          if (!fortsatt() || S.spill !== sp) return;
        }
      }
      await R.vent(R.rolig() ? 300 : 1100); // let the shot be seen on your own fleet
      if (!fortsatt() || S.spill !== sp) return;
      sp.visEgen = false;
      if (sp.tur === 0 && sp.vinner == null && sp.melding) sp.melding.tekst += " " + R.t("Din tur!");
      R.vis();
    } finally {
      maskinKjorer = false;
    }
  }

  // ---------- Placement: drag a ship with a finger or the mouse ----------

  let dra = null;
  let sisteDra = -1e9;

  function placementCelle(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const c = el && el.closest && el.closest(".ad-plassering [data-celle]");
    return c ? Number(c.dataset.celle) : null;
  }

  function visForslag(sp, s) {
    const n = sp.n;
    R.$$(".ad-plassering .forslag").forEach((el) => el.classList.remove("forslag", "ok", "nei"));
    if (!s) return;
    const prov = sp.flate[sp.plasserer].map((x, k) => (k === dra.k ? s : x));
    const ok = innenfor(s, n) && gyldig(prov, n);
    for (const c of innenfor(s, n) ? celler(s, n) : []) {
      const el = R.$(`.ad-plassering [data-celle="${c}"]`);
      if (el) el.classList.add("forslag", ok ? "ok" : "nei");
    }
    return ok;
  }

  function startDra(e) {
    const S = R.S;
    const sp = S.spill;
    if (!sp || S.skjerm !== "plasser" || e.button > 0) return;
    const i = placementCelle(e);
    if (i == null) return;
    const flate = sp.flate[sp.plasserer];
    const k = flate.findIndex((s) => celler(s, sp.n).includes(i));
    if (k < 0) return;
    const s = flate[k];
    dra = { k, gx: (i % sp.n) - s.x, gy: Math.floor(i / sp.n) - s.y, x0: e.clientX, y0: e.clientY, aktiv: false, id: e.pointerId, s: null };
  }

  function flyttDra(e) {
    if (!dra || e.pointerId !== dra.id) return;
    const sp = R.S.spill;
    if (!dra.aktiv) {
      if (Math.hypot(e.clientX - dra.x0, e.clientY - dra.y0) < 8) return;
      dra.aktiv = true;
      sp.valgt = dra.k;
      const brett = R.$(".ad-plassering");
      if (brett) brett.classList.add("drar");
      R.$$(`.ad-plassering .skip`).forEach((el) => el.classList.remove("valgt"));
    }
    e.preventDefault();
    const i = placementCelle(e);
    if (i == null) return;
    const s0 = sp.flate[sp.plasserer][dra.k];
    const s = { ...s0, x: (i % sp.n) - dra.gx, y: Math.floor(i / sp.n) - dra.gy };
    if (dra.s && dra.s.x === s.x && dra.s.y === s.y) return;
    dra.s = s;
    if (visForslag(sp, s)) R.lyd.tone(660, 0, 0.03, "triangle", 0.04);
  }

  function sluttDra(e) {
    if (!dra || (e && e.pointerId !== dra.id)) return;
    const d = dra;
    dra = null;
    if (!d.aktiv) return;
    sisteDra = performance.now();
    const S = R.S;
    const sp = S.spill;
    const flate = sp.flate[sp.plasserer];
    if (d.s && innenfor(d.s, sp.n) && gyldig(flate.map((x, k) => (k === d.k ? d.s : x)), sp.n)) {
      flate[d.k] = d.s;
      R.lyd.pop();
    } else {
      R.lyd.feil();
      R.toast(R.t("Skipene kan ikke ligge inntil hverandre"));
    }
    R.vis();
  }

  // Arrow keys move between the cells of a board (keyboard players don't have to tab through 100 cells).
  function piltaster(e) {
    const el = e.target;
    const retning = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!retning || !el || !el.classList || !el.classList.contains("ad-rute") || el.dataset.celle == null) return;
    const brett = el.closest(".ad-brett");
    const n = Number(String(brett && brett.style.getPropertyValue("--n")).trim());
    if (!n) return;
    const i = Number(el.dataset.celle);
    const x = (i % n) + retning[0];
    const y = Math.floor(i / n) + retning[1];
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    const neste = brett.querySelector(`button[data-celle="${y * n + x}"]`);
    if (!neste) return;
    e.preventDefault();
    neste.focus();
  }

  try {
    document.addEventListener("keydown", piltaster);
    document.addEventListener("pointerdown", startDra);
    document.addEventListener("pointermove", flyttDra, { passive: false });
    document.addEventListener("pointerup", sluttDra);
    document.addEventListener("pointercancel", sluttDra);
  } catch (e) {
    /* no document (unit tests) */
  }

  // Move or turn a ship so it fits: try the spot, then pushed back inside the board.
  function plasserHvisMulig(flate, k, s, n) {
    const prov = (x) => innenfor(x, n) && gyldig(flate.map((y, j) => (j === k ? x : y)), n);
    if (prov(s)) return s;
    const inn = { ...s, x: Math.min(s.x, s.r === "h" ? n - s.lengde : n - 1), y: Math.min(s.y, s.r === "v" ? n - s.lengde : n - 1) };
    return prov(inn) ? inn : null;
  }

  // Wide screens: the two boards side by side on the battle screen.
  const bred = (pa) => {
    try {
      document.documentElement.classList.toggle("ad-vid", !!pa);
    } catch (e) {
      /* no document (unit tests) */
    }
  };

  // The «Gi mobilen til …» gate in front of whatever a player was doing (two players).
  function settPort(sp) {
    if (sp.fase === "plasser") sp.gate = { til: sp.plasserer, neste: "plasser" };
    else if (!sp.gate) sp.gate = { til: sp.tur != null ? sp.tur : sp.ser, neste: "kamp" };
    sp.fase = "gate";
  }

  // ---------- The app ----------

  const SPILLSKJERMER = ["plasser", "gi", "kamp", "slutt"];
  const pagar = (S) => !!(S.spill && S.spill.vinner == null);

  const DEF = {
    id: "admiralen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: 2,
      oppsett: { modus: "maskin", niva: "middels", brett: 10, ekstra: false },
      spill: null,
      stilling: {},
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ modus: "maskin", niva: "middels", brett: 10, ekstra: false }, S.oppsett));
      if (!["maskin", "to"].includes(o.modus)) o.modus = "maskin";
      if (!NIVAER.some(([v]) => v === o.niva)) o.niva = "middels";
      if (![8, 10].includes(o.brett)) o.brett = 10;
      o.ekstra = !!o.ekstra;
      S.antall = 2;
      if (!S.stilling || typeof S.stilling !== "object") S.stilling = {};
      const sp = S.spill;
      const okFlate = (f, n) => Array.isArray(f) && f.length === FLATER[n].length && f.every((s, k) => s && s.id === FLATER[n][k][0] && s.lengde === FLATER[n][k][1]) && gyldig(f, n);
      if (sp && (![8, 10].includes(sp.n) || !Array.isArray(sp.flate) || !okFlate(sp.flate[0], sp.n) || !okFlate(sp.flate[1], sp.n) || !Array.isArray(sp.skudd) || !sp.skudd.every((l) => Array.isArray(l) && l.every((i) => Number.isInteger(i) && i >= 0 && i < sp.n * sp.n)))) S.spill = null;
      if (!S.spill && SPILLSKJERMER.includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "slutt" && S.spill.vinner == null) S.skjerm = "kamp";
      if (S.spill) S.spill.visEgen = false;
      // Two players: after a reload the phone may be in the other player's hands – always the gate first.
      if (S.spill && !maskin(S.spill) && S.spill.vinner == null && ["plasser", "kamp"].includes(S.skjerm)) {
        settPort(S.spill);
        S.skjerm = "gi";
      }
    },

    regler: {
      intro: R.t("Plasser flåten din i det skjulte og senk motstanderens skip før dine egne går til bunns."),
      steg: [
        [R.t("Plasser flåten"), R.t("Dra skipene dit du vil, eller trykk på «Tilfeldig». Skipene kan ikke ligge inntil hverandre – heller ikke på skrå.")],
        [R.t("Sikt og fyr"), R.t("Trykk på en rute i fiendens farvann og så på «Fyr!». Plask betyr bom, smell betyr treff.")],
        [R.t("Senk alle"), R.t("Når alle rutene til et skip er truffet, synker det. Den som senker hele flåten til den andre først, vinner.")],
      ],
      tips: [
        R.t("Rundt et senket skip er det bare vann – de rutene blir merket med en gang."),
        R.t("Trykk på samme rute to ganger for å fyre med en gang."),
        R.t("Treffer du et skip, prøv rutene ved siden av. Skipene ligger alltid rett."),
        R.t("To spillere: gi mobilen videre etter hvert skudd, og se bort mens den andre plasserer."),
        R.t("Mobilen ser bare sine egne skudd – den jukser aldri."),
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: `${esc(R.t("Plasser flåten."))}<br><em>${esc(R.t("Senk fienden først!"))}</em>`,
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: R.t("Fortsett slaget"),
              ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
            }),
            merker: [
              ["1–2", R.t("spillere")],
              ["5", R.t("skip")],
              ["3", R.t("nivåer")],
            ],
          }),
      },

      oppsett: {
        tittel: R.t("Nytt slag"),
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            <section class="seksjon">
              <h2>${esc(R.t("Hvem spiller?"))}</h2>
              ${R.ui.fliser(
                "modus",
                [
                  { v: "maskin", tittel: R.t("Mot mobilen"), tekst: R.t("Du alene mot mobilen"), ikon: "🤖" },
                  { v: "to", tittel: R.t("To spillere"), tekst: R.t("Send mobilen mellom dere"), ikon: "👥" },
                ],
                o.modus,
              )}
            </section>
            ${
              o.modus === "maskin"
                ? `<section class="seksjon">
                    <h2>${esc(R.t("Hvor flink er mobilen?"))}</h2>
                    ${R.ui.seg("niva", NIVAER, o.niva, { etikett: R.t("Nivå") })}
                    <p class="hjelp">${esc(o.niva === "lett" ? R.t("Skyter litt i blinde. Fin for de minste.") : o.niva === "middels" ? R.t("Leter i et mønster og følger opp treff.") : R.t("Regner ut hvor skipene mest sannsynlig ligger. Lykke til!"))}</p>
                  </section>`
                : R.ui.spillere({ min: 2, max: 2, tittel: R.t("Hvem spiller?"), hjelp: R.t("Den som står først, plasserer først.") })
            }
            <section class="seksjon">
              <h2>${esc(R.t("Havet"))}</h2>
              ${R.ui.seg(
                "brett",
                [
                  [10, R.t("Klassisk 10 × 10")],
                  [8, R.t("Rask 8 × 8")],
                ],
                o.brett,
                { etikett: R.t("Brettstørrelse") },
              )}
              <p class="hjelp">${esc(o.brett === 10 ? R.t("Fem skip: hangarskip, slagskip, fregatt, ubåt og torpedobåt.") : R.t("Fire skip på et mindre hav – raskere slag."))}</p>
            </section>
            ${R.ui.bryter("ekstra", o.ekstra, R.t("Treff gir et skudd til"), R.t("Den som treffer, fyrer igjen"))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start"))}`;
        },
      },

      // «Gi mobilen til …» (two players)
      gi: {
        tittel: () => R.app.navn,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const s = sp.gate.til;
          return R.ui.giTil({
            i: s,
            h: "jeg-er",
            v: s,
            tekst: sp.gate.neste === "plasser" ? R.t("Plasser flåten – gi mobilen til") : R.t("Gi mobilen til"),
            knapp: R.t("Jeg er {navn}", { navn: navnFor(sp, s) }),
            advarsel: R.t("{navn} ser bort", { navn: navnFor(sp, 1 - s) }),
            ikon: "🙈",
          });
        },
      },

      plasser: {
        tittel: (S) => (maskin(S.spill) ? R.t("Din flåte") : navnFor(S.spill, S.spill.plasserer)),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const flate = sp.flate[sp.plasserer];
          const valgt = sp.valgt;
          return `
            <h1 id="skjerm-tittel">${esc(maskin(sp) ? R.t("Plasser flåten") : R.t("Plasser flåten, {navn}", { navn: navnFor(sp, sp.plasserer) }))}</h1>
            <p class="ingress ad-hint">${esc(R.t("Dra et skip dit du vil – eller trykk på skipet og så på en ny rute. Trykk to ganger for å snu det."))}</p>
            ${brettHtml(sp.n, { flate, valgt, knapp: "plass-celle", plassering: true, etikett: R.t("Din flåte") })}
            ${skipListe(flate, null, { h: "velg-skip", valgt })}
            <div class="knapprad">
              ${R.ui.knapp2(R.t("Snu skipet"), "snu", { ikon: "↻", av: valgt == null })}
              ${R.ui.knapp2(R.t("Tilfeldig"), "tilfeldig", { ikon: "🎲" })}
            </div>
            ${R.ui.dokk(R.ui.knapp(R.t("Klar!"), "klar", { ikon: "⚓" }))}`;
        },
        etter() {
          fersk = null;
        },
      },

      kamp: {
        tittel: (S) => (maskin(S.spill) ? R.t("Nivå: {niva}", { niva: NIVAER.find(([v]) => v === S.spill.niva)[1] }) : navnFor(S.spill, S.spill.ser)),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.ser;
          const mot = 1 - v;
          const mal = tavle(sp.flate[mot], sp.skudd[v], sp.n);
          const egen = tavle(sp.flate[v], sp.skudd[mot], sp.n);
          const minTur = sp.tur === v;
          const venterPaMaskin = maskin(sp) && sp.tur === MASKIN;
          const ferdig = sp.vinner != null;
          let melding = sp.melding;
          if (!melding || (minTur && sp.sikte != null)) {
            melding = minTur
              ? sp.sikte != null
                ? { type: "sikte", tekst: R.t("Sikter på {rute}. Trykk «Fyr!» – eller på ruta en gang til.", { rute: rute(sp.sikte, sp.n) }) }
                : { type: "tur", tekst: maskin(sp) ? R.t("Din tur! Trykk på en rute i fiendens farvann.") : R.t("{navn}, din tur! Trykk på en rute i fiendens farvann.", { navn: navnFor(sp, v) }) }
              : melding;
          }
          const ferskMal = fersk && fersk.side === mot ? fersk : null;
          const ferskEgen = fersk && fersk.side === v ? fersk : null;
          const knapp = ferdig
            ? R.ui.knapp(sp.vinner === v || !maskin(sp) ? R.t("Til kåringen") : R.t("Se kåringen"), "til-slutt", { ikon: "🏆" })
            : venterPaMaskin
              ? R.ui.knapp(R.t("Mobilen sikter …"), "fyr", { av: true })
              : minTur
                ? R.ui.knapp(sp.sikte != null ? R.t("Fyr på {rute}!", { rute: rute(sp.sikte, sp.n) }) : R.t("Fyr!"), "fyr", { av: sp.sikte == null, variant: "rod", ikon: "🎯" })
                : R.ui.knapp("", "bytt", { tekstHtml: `<span class="ad-to-linjer"><b>${esc(R.t("Ferdig"))}</b><small>${esc(R.t("Gi mobilen til {navn}", { navn: navnFor(sp, sp.tur) }))}</small></span>` });
          return `
            <h1 class="vh" id="skjerm-tittel">${esc(maskin(sp) ? R.t("Slaget mot mobilen") : R.t("Slaget til {navn}", { navn: navnFor(sp, v) }))}</h1>
            <p class="ad-melding ${melding ? esc(melding.type) : ""}" aria-live="polite">${melding ? esc(melding.tekst) : ""}</p>
            <div class="ad-kamp${sp.visEgen ? " viser-egen" : ""}">
              <div class="ad-mal-boks">
                ${brettHtml(sp.n, { t: mal.t, sikte: minTur && !ferdig ? sp.sikte : null, knapp: minTur && !ferdig ? "sikt" : null, mal: true, fersk: ferskMal, etikett: R.t("Fiendens farvann") })}
              </div>
              <div class="ad-egen">
                <p class="etikett">${esc(maskin(sp) ? R.t("Din flåte") : R.t("Flåten til {navn}", { navn: navnFor(sp, v) }))}</p>
                ${brettHtml(sp.n, { flate: sp.flate[v], t: egen.t.map((x) => (x === 4 ? 0 : x)), fersk: ferskEgen, etikett: R.t("Din flåte") })}
              </div>
              <div class="ad-fiende">
                <p class="etikett">${esc(maskin(sp) ? R.t("Fiendens skip") : R.t("Skipene til {navn}", { navn: navnFor(sp, mot) }))}</p>
                ${skipListe(sp.flate[mot], mal.senket, { liten: true })}
                <p class="ad-tall">${esc(R.flertall(sp.skudd[v].length, "skudd", "skudd"))} · ${esc(R.flertall(sp.skudd[v].filter((i) => mal.t[i] >= 2).length, "treff", "treff"))}</p>
              </div>
            </div>
            ${R.ui.dokk(knapp, ferdig ? "" : R.ui.lenkerad(R.ui.lenke(R.t("Avslutt"), "avslutt")))}`;
        },
        inn(S) {
          bred(true);
          if (S.spill.visEgen && !maskinKjorer && S.spill.tur !== MASKIN) {
            S.spill.visEgen = false;
            R.vis();
          }
          if (S.spill.vinner != null) return;
          if (maskin(S.spill) && S.spill.tur === MASKIN) {
            const fortsatt = R.vakt();
            setTimeout(() => fortsatt() && maskinTur(S), 0);
          }
        },
        etter() {
          fersk = null;
        },
        ut: () => bred(false),
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const v = sp.vinner;
          const duVant = maskin(sp) && v === 0;
          const st = S.stilling[stillingNokkel(sp)] || [0, 0];
          const visNavn = (s) => (maskin(sp) && s === 0 ? R.t("Du") : navnFor(sp, s));
          const kort = (s) => {
            const t = tavle(sp.flate[1 - s], sp.skudd[s], sp.n);
            const treff = sp.skudd[s].filter((i) => t.t[i] >= 2).length;
            const skudd = sp.skudd[s].length;
            return `<div class="ad-statkort${s === v ? " vinner" : ""}">
              <b class="ad-statnavn">${s === v ? "🏆 " : ""}${esc(visNavn(s))}</b>
              <span><b>${skudd}</b> ${esc(R.t("skudd|skudd", { n: skudd }))}</span>
              <span><b>${treff}</b> ${esc(R.t("treff|treff", { n: treff }))}</span>
              <span><b>${skudd ? Math.round((100 * treff) / skudd) : 0} %</b> ${esc(R.t("treffsikkerhet"))}</span>
              <span><b>${t.senket.filter(Boolean).length}</b> ${esc(R.t("av {n} skip senket", { n: sp.flate[1 - s].length }))}</span>
            </div>`;
          };
          const tekst = maskin(sp)
            ? duVant
              ? esc(R.t("Hele flåten til mobilen ligger på bunnen. Godt jobba, admiral!"))
              : esc(R.t("Mobilen var skarp i dag. Godt forsøk – ta revansj!"))
            : esc(R.t("{a} senket hele flåten til {b}.", { a: navnFor(sp, v), b: navnFor(sp, 1 - v) }));
          const flateBoks = (s) => `<div class="ad-egen"><p class="etikett">${esc(maskin(sp) && s === 0 ? R.t("Din flåte") : R.t("Flåten til {navn}", { navn: navnFor(sp, s) }))}</p>${brettHtml(sp.n, { flate: sp.flate[s], t: tavle(sp.flate[s], sp.skudd[1 - s], sp.n).t.map((x) => (x === 4 ? 0 : x)), liten: true })}</div>`;
          return `
            <div class="banner ${duVant || !maskin(sp) ? "aksent" : ""}">
              ${R.figur()}
              <p class="etikett">${esc(maskin(sp) ? R.t("Mot mobilen · {niva}", { niva: NIVAER.find(([x]) => x === sp.niva)[1].toLocaleLowerCase(R.lokale) }) : R.t("To spillere"))}</p>
              <h1 id="skjerm-tittel">${esc(maskin(sp) ? (duVant ? R.t("Du vinner!") : R.t("Mobilen vinner!")) : R.t("{navn} vinner!", { navn: navnFor(sp, v) }))}</h1>
              <p class="ingress">${tekst}</p>
            </div>
            <p class="ad-stilling" aria-label="${esc(R.t("Stillingen: {a} {pa}, {b} {pb}", { a: navnFor(sp, 0), pa: st[0], b: navnFor(sp, 1), pb: st[1] }))}"><span>${esc(maskin(sp) ? R.t("Du") : navnFor(sp, 0))} <b>${st[0]}</b></span><span class="ad-strek">–</span><span><b>${st[1]}</b> ${esc(maskin(sp) ? R.t("Mobilen") : navnFor(sp, 1))}</span></p>
            <section class="seksjon">
              <h2>${esc(R.t("Slik gikk det"))}</h2>
              <div class="ad-stat">${kort(0)}${kort(1)}</div>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Flåtene"))}</h2>
              <div class="ad-under">${flateBoks(0)}${flateBoks(1)}</div>
            </section>
            ${R.ui.flereSpill({ antall: 2 })}
            ${R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen"), R.ui.lenkerad(R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`))}`;
        },
        inn(S) {
          const sp = S.spill;
          if (sp.feiret) return;
          sp.feiret = true;
          R.lagre();
          R.slippVaken();
          const senket = (s) => tavle(sp.flate[1 - s], sp.skudd[s], sp.n).senket.filter(Boolean).length;
          R.statistikk("ferdig", { modus: sp.modus, niva: sp.niva, vant: sp.vinner === 0, skudd: sp.skudd[0].length, brett: sp.n });
          if (!maskin(sp)) R.kveld.registrer([0, 1].map((s) => ({ i: s, poeng: senket(s) })));
          else visTipsSnart();
          if (!maskin(sp) || sp.vinner === 0) {
            R.lyd.fanfare();
            R.konfetti();
          } else R.lyd.pling();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("oppsett");
      },
      endre: (el, e, S) => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        // Two players: never straight onto a secret fleet – the gate first.
        if (!maskin(sp) && sp.vinner == null && sp.fase !== "gate") {
          settPort(sp);
          return R.gaTil("gi");
        }
        if (sp.fase === "plasser") return R.gaTil("plasser");
        if (sp.fase === "gate") return R.gaTil("gi");
        R.gaTil(sp.vinner != null ? "slutt" : "kamp");
      },

      // Setup
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v === "to" ? "to" : "maskin";
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = el.dataset.v;
        R.vis();
      },
      brett(el, e, S) {
        S.oppsett.brett = Number(el.dataset.v) === 8 ? 8 : 10;
        R.vis();
      },
      ekstra(el, e, S) {
        S.oppsett.ekstra = !S.oppsett.ekstra;
        R.vis();
      },
      start: (el, e, S) => nyttSpill(S),
      igjen: (el, e, S) => nyttSpill(S),

      // Two players: the gate
      "jeg-er"(el, e, S) {
        const sp = S.spill;
        const g = sp.gate;
        if (!g) return;
        sp.gate = null;
        if (g.neste === "plasser") {
          sp.plasserer = g.til;
          sp.valgt = null;
          sp.fase = "plasser";
          R.gaTil("plasser");
        } else {
          sp.ser = g.til;
          sp.sikte = null;
          sp.melding = null;
          sp.fase = "kamp";
          R.gaTil("kamp");
        }
      },

      // Placement
      "plass-celle"(el, e, S) {
        if (performance.now() - sisteDra < 400) return; // the end of a drag, not a tap
        const sp = S.spill;
        const n = sp.n;
        const flate = sp.flate[sp.plasserer];
        const i = Number(el.dataset.v);
        const k = flate.findIndex((s) => celler(s, n).includes(i));
        if (k >= 0) {
          if (sp.valgt === k) return H.snu(el, e, S);
          sp.valgt = k;
          R.lyd.pop();
          R.vis();
          return;
        }
        if (sp.valgt == null) {
          R.toast(R.t("Trykk på et skip først – eller dra det"));
          return;
        }
        const ny = plasserHvisMulig(flate, sp.valgt, { ...flate[sp.valgt], x: i % n, y: Math.floor(i / n) }, n);
        if (!ny) {
          R.lyd.feil();
          R.toast(R.t("Skipene kan ikke ligge inntil hverandre"));
          return;
        }
        flate[sp.valgt] = ny;
        R.lyd.pop();
        R.vis();
      },
      "velg-skip"(el, e, S) {
        const sp = S.spill;
        const k = Number(el.dataset.v);
        sp.valgt = sp.valgt === k ? null : k;
        R.vis();
      },
      snu(el, e, S) {
        const sp = S.spill;
        const flate = sp.flate[sp.plasserer];
        if (sp.valgt == null) return;
        const s = flate[sp.valgt];
        const ny = plasserHvisMulig(flate, sp.valgt, { ...s, r: s.r === "h" ? "v" : "h" }, sp.n);
        if (!ny) {
          R.lyd.feil();
          R.toast(R.t("Ikke plass til å snu skipet her"));
          return;
        }
        flate[sp.valgt] = ny;
        R.lyd.snu();
        R.vis();
      },
      tilfeldig(el, e, S) {
        const sp = S.spill;
        sp.flate[sp.plasserer] = tilfeldigFlate(sp.n);
        sp.valgt = null;
        R.lyd.sveip();
        R.vis();
      },
      klar(el, e, S) {
        const sp = S.spill;
        sp.klar[sp.plasserer] = true;
        sp.valgt = null;
        if (maskin(sp)) {
          sp.fase = "kamp";
          sp.ser = 0;
          sp.tur = 0;
          sp.melding = null;
          R.lyd.riktig();
          R.gaTil("kamp");
          return;
        }
        R.lyd.riktig();
        if (!sp.klar[1 - sp.plasserer]) {
          sp.fase = "gate";
          sp.gate = { til: 1 - sp.plasserer, neste: "plasser" };
        } else {
          sp.fase = "gate";
          sp.gate = { til: sp.starter, neste: "kamp" };
          sp.tur = sp.starter;
        }
        R.gaTil("gi");
      },

      // Battle
      sikt(el, e, S) {
        const sp = S.spill;
        const i = Number(el.dataset.v);
        if (sp.vinner != null || sp.tur !== sp.ser || (maskin(sp) && sp.tur === MASKIN)) return;
        const t = tavle(sp.flate[1 - sp.ser], sp.skudd[sp.ser], sp.n).t;
        if (t[i] !== 0) {
          R.toast(t[i] === 4 ? R.t("Det er bare vann rundt et senket skip") : R.t("Du har allerede skutt der"));
          return;
        }
        if (sp.sikte === i) return H.fyr(el, e, S);
        sp.sikte = i;
        sp.melding = null;
        LYD.sikt();
        R.vis();
      },
      fyr(el, e, S) {
        const sp = S.spill;
        if (sp.sikte == null || sp.vinner != null || sp.tur !== sp.ser || (maskin(sp) && sp.tur === MASKIN)) return;
        const i = sp.sikte;
        sp.sikte = null;
        const res = skyt(S, sp.ser, i);
        R.vis();
        if (!res) return;
        if (res.alle) return tilSlutt(S);
        if (maskin(sp) && sp.tur === MASKIN) {
          const fortsatt = R.vakt();
          setTimeout(() => fortsatt() && maskinTur(S), R.rolig() ? 300 : 900);
        }
      },
      bytt(el, e, S) {
        const sp = S.spill;
        if (maskin(sp) || sp.tur === sp.ser || sp.vinner != null) return;
        sp.fase = "gate";
        sp.gate = { til: sp.tur, neste: "kamp" };
        R.gaTil("gi");
      },
      "til-slutt": (el, e, S) => R.gaTil("slutt"),
      async avslutt(el, e, S) {
        const fortsatt = R.vakt();
        const ja = await R.bekreft(R.t("Avslutte slaget?"), R.t("Slaget blir borte. Stillingen fra tidligere slag er lagret."), R.t("Avslutt"), R.t("Spill videre"));
        if (!ja || !fortsatt()) return;
        S.spill = null;
        R.slippVaken();
        R.gaTil("hjem");
      },
    }),

    // The pure parts, for the unit tests (test/admiralen.test.mjs).
    kjerne: { FLATER, celler, innenfor, naboer, gyldig, tilfeldigFlate, tavle, maskinVelg, grupper, rute },
  };

  // Remember the screen of a running game.
  SPILLSKJERMER.forEach((navn) => {
    const sk = DEF.skjermer[navn];
    const inn = sk.inn;
    sk.inn = (S) => {
      if (S.spill && navn !== "slutt") S.spill.fase = navn === "gi" ? "gate" : navn === "plasser" ? "plasser" : "kamp";
      if (inn) inn(S);
    };
  });

  R.start(DEF);
})();
