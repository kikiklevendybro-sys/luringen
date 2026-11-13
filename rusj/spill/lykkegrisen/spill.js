/* Lykkegrisen — the dice game 10 000 for 1–8 players on one phone, with up to three phone players.
   Roll six dice, put aside at least one that scores (ones, fives, three or more alike, a straight,
   three pairs), then roll the rest again – or stop and keep the turn's points. A roll with nothing
   that scores loses the whole turn. Six dice that all scored may be rolled again. The first to the
   target starts the last round: everyone else gets one more turn. Two scoring tables, an optional
   entry score and an optional penalty for three empty rolls in a row. The rules and the phone
   players are pure functions at the top (window.RusjLykkegrisen when loaded without the kit);
   test/lykkegrisen.test.mjs checks them and lets seeded phone players play whole games. */
(function () {
  "use strict";

  // ---------- The rules (pure: no DOM, no kit) ----------

  const L = (() => {
    const rng = (fro) => {
      let a = fro >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const terning = (rnd) => 1 + Math.floor(rnd() * 6);

    // «klassisk»: four or more alike double the three (four 2s = 400, five = 800 …);
    // «faste»: four alike 1000, five 2000, six 3000, and two more six-dice combinations.
    const TABELLER = {
      klassisk: { flereLike: "dobling", trePar: 1000, straight: 1500, toTre: 0, fireOgPar: 0 },
      faste: { flereLike: "faste", trePar: 1500, straight: 1500, toTre: 2500, fireOgPar: 1500 },
    };
    const tabellFor = (navn) => TABELLER[navn] || TABELLER.klassisk;
    const tell = (t) => {
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (const v of t) c[v]++;
      return c;
    };
    const treLike = (f) => (f === 1 ? 1000 : f * 100);
    const like = (f, n, T) => (T.flereLike === "dobling" ? treLike(f) * 2 ** (n - 3) : n === 3 ? treLike(f) : n === 4 ? 1000 : n === 5 ? 2000 : 3000);

    // The best score of exactly these dice, every one of them counting; 0 if one can't count.
    function verdi(t, tabell) {
      const T = tabellFor(tabell);
      if (!t.length) return 0;
      const c = tell(t);
      let best = 0;
      if (t.length === 6) {
        if (c.slice(1).every((n) => n === 1)) best = Math.max(best, T.straight);
        if (c.filter((n) => n === 2).length === 3) best = Math.max(best, T.trePar);
        if (T.toTre && c.filter((n) => n === 3).length === 2) best = Math.max(best, T.toTre);
        if (T.fireOgPar && c.some((n) => n === 4) && c.some((n) => n === 2)) best = Math.max(best, T.fireOgPar);
      }
      let sum = 0;
      for (let f = 1; f <= 6; f++) {
        const n = c[f];
        if (!n) continue;
        const enkel = f === 1 ? 100 : f === 5 ? 50 : 0;
        let v = enkel ? n * enkel : -1;
        for (let k = 3; k <= n; k++) if (!(n - k) || enkel) v = Math.max(v, like(f, k, T) + (n - k) * enkel);
        if (v < 0) return best;
        sum += v;
      }
      return Math.max(best, sum);
    }
    // Every set of dice (indexes) in this roll that scores: [{ idx, verdi }].
    function utvalg(t, tabell) {
      const ut = [];
      for (let m = 1; m < 1 << t.length; m++) {
        const idx = [];
        for (let i = 0; i < t.length; i++) if (m & (1 << i)) idx.push(i);
        const v = verdi(
          idx.map((i) => t[i]),
          tabell,
        );
        if (v > 0) ut.push({ idx, verdi: v });
      }
      return ut;
    }
    const harPoeng = (t, tabell) => {
      const c = tell(t);
      return c[1] > 0 || c[5] > 0 || c.some((n) => n >= 3) || verdi(t, tabell) > 0;
    };
    // The most points this roll can give (the most dice when it's a tie): «Velg poengene».
    function beste(t, tabell) {
      let b = null;
      for (const u of utvalg(t, tabell)) if (!b || u.verdi > b.verdi || (u.verdi === b.verdi && u.idx.length > b.idx.length)) b = u;
      return b;
    }

    // ---------- The phone as a player ----------
    // Per number of dice (1–6): chance that a roll scores nothing, the average best score when it
    // does, and how often all of them score (then six new dice). Worked out exactly for both tables.
    const TOMT = [0, 0.6667, 0.4444, 0.2778, 0.1574, 0.0772, 0.0231];
    const SNITT = [0, 75, 90, 120, 170, 245, 415];
    const ALLE = [0, 1, 0.2, 0.077, 0.048, 0.033, 0.083];
    const SEKS = 500; // about what six fresh dice are worth
    // Lett stops early and at random; Middels by a table of the dice left; Vanskelig by the odds
    // of losing the turn against what the next roll is likely to add, and by the game: bolder when
    // someone is close to the target or far ahead.
    const GRENSE = [0, 300, 300, 400, 700, 2000, Infinity];
    function grenseVanskelig(n) {
      if (n >= 6) return Infinity;
      return ((1 - TOMT[n]) * (SNITT[n] + ALLE[n] * SEKS)) / TOMT[n];
    }
    // ctx: { tur (the turn's points with this choice), n (dice for the next roll), total, mal,
    //   inngang (entry score; 0 = none), inne (already on the board), leder (best total of the
    //   others), sisteRunde (the target is reached: beat the leader or lose) }
    function skalStoppe(ctx, niva, rnd) {
      const { tur, n, total, mal, inngang, inne, leder, sisteRunde } = ctx;
      if (!inne && inngang && tur < inngang) return false;
      if (sisteRunde) return total + tur > leder;
      if (total + tur >= mal) return true;
      if (niva === "lett") return tur >= 250 + Math.floor(rnd() * 5) * 100 || (n <= 2 && tur >= 200 && rnd() < 0.6);
      if (niva === "middels") return tur >= GRENSE[n];
      let g = grenseVanskelig(n);
      if (leder >= mal - 1500) g *= 1.6;
      else if (leder - total > 2500) g *= 1.3;
      else if (total - leder > 2500) g *= 0.8;
      return tur >= g;
    }
    // Which scoring dice to put aside. Lett and Middels take everything that scores; Vanskelig keeps
    // dice to roll when that is worth more than the points of a lone one or five.
    function velg(t, ctx, niva, tabell, rnd) {
      const alle = utvalg(t, tabell);
      if (!alle.length) return null;
      const maks = alle.reduce((a, b) => (b.verdi > a.verdi || (b.verdi === a.verdi && b.idx.length > a.idx.length) ? b : a));
      if (niva !== "vanskelig") return maks;
      let best = maks;
      let bv = -Infinity;
      for (const u of alle) {
        const igjen = t.length - u.idx.length || 6;
        const neste = { ...ctx, tur: ctx.tur + u.verdi, n: igjen };
        // Stopping now: only the points count. Rolling on: the dice left are worth something.
        const v = skalStoppe(neste, niva, () => 0.5) ? u.verdi : u.verdi + (1 - TOMT[igjen]) * (SNITT[igjen] + ALLE[igjen] * SEKS) - TOMT[igjen] * (ctx.tur + u.verdi) * (niva === "vanskelig" ? 1 : 0.5);
        if (v > bv) {
          bv = v;
          best = u;
        }
      }
      return best;
    }

    // One whole turn by a phone player (tests). valg.sjekk(t, u) sees every choice.
    function spillTur(ctx, niva, tabell, rnd, valg = {}) {
      let fri = 6;
      let tur = 0;
      for (let kast = 1; kast <= 200; kast++) {
        const t = Array.from({ length: fri }, () => terning(rnd));
        if (!harPoeng(t, tabell)) return { poeng: 0, tomt: true, kast };
        const u = velg(t, { ...ctx, tur }, niva, tabell, rnd);
        if (valg.sjekk) valg.sjekk(t, u);
        tur += u.verdi;
        fri = t.length - u.idx.length || 6;
        if (skalStoppe({ ...ctx, tur, n: fri }, niva, rnd)) return { poeng: tur, tomt: false, kast };
      }
      return { poeng: tur, tomt: false, kast: 200 };
    }

    // A whole game between phone players (tests). o: { mal, tabell, inngang, straff, sjekk }.
    function parti(fro, nivaer, o = {}) {
      const rnd = rng(fro);
      const mal = o.mal || 10000;
      const n = nivaer.length;
      const totaler = Array(n).fill(0);
      const inne = Array(n).fill(false);
      const tomme = Array(n).fill(0);
      let sisteRunde = -1;
      let turer = 0;
      for (let i = 0; turer < 5000; i = (i + 1) % n) {
        if (sisteRunde === i) break;
        turer++;
        const leder = Math.max(...totaler.filter((_, j) => j !== i), 0);
        const r = spillTur({ total: totaler[i], mal, inngang: o.inngang || 0, inne: inne[i], leder, sisteRunde: sisteRunde >= 0 }, nivaer[i], o.tabell, rnd, o);
        if (r.tomt) {
          tomme[i]++;
          if (o.straff && tomme[i] >= 3) {
            totaler[i] = Math.max(0, totaler[i] - 1000);
            tomme[i] = 0;
          }
        } else {
          if (o.sjekk && !inne[i] && o.inngang && r.poeng < o.inngang) throw new Error("banked below the entry score");
          totaler[i] += r.poeng;
          inne[i] = true;
          tomme[i] = 0;
          if (totaler[i] >= mal && sisteRunde < 0) {
            sisteRunde = i;
            if (n === 1) break;
          }
        }
      }
      const topp = Math.max(...totaler);
      return { totaler, vinnere: totaler.map((t, i) => (t === topp ? i : -1)).filter((i) => i >= 0), turer, ferdig: sisteRunde >= 0 };
    }

    return { rng, terning, TABELLER, verdi, utvalg, harPoeng, beste, skalStoppe, velg, spillTur, parti, grenseVanskelig };
  })();

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") {
    window.RusjLykkegrisen = L;
    return;
  }

  // ---------- The game on the page ----------

  const esc = R.esc;
  const NIVAER = ["lett", "middels", "vanskelig"];
  const NIVANAVN = { lett: R.t("Lett"), middels: R.t("Middels"), vanskelig: R.t("Vanskelig") };
  const ROBOTER = [R.t("Robo"), R.t("Bipp"), R.t("Bopp")];
  const MAL = [5000, 10000];
  const INNGANG = [0, 500, 1000];
  const TABELLNAVN = { klassisk: R.t("Klassisk"), faste: R.t("Faste poeng") };
  // This edition's address (rusj.no/lykkegrisen/, rusj.no/en/…)
  const DEL_URL = (document.querySelector('link[rel="canonical"]') || { href: "https://rusj.no/lykkegrisen/" }).href;
  let H;

  // S.spill: { antall, mennesker (seats 0…mennesker−1 are people, the rest the phone), niva, mal,
  //   tabell, inngang, straff, totaler [], inne [] (reached the entry score), tomme [] (empty rolls
  //   in a row), logg [[turn points | null for an empty roll | −1000 penalty]], tur, fri (dice for
  //   the next roll), terninger [] (this roll), valgt [bool], lagt [{ verdier, poeng }] (put aside
  //   this turn), turPoeng, status "kast" | "velg" | "tomt", sisteRunde (seat that reached the
  //   target, −1), angre (state before the last «Stopp»), ferdig, resultat, registrert }
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const erRobot = (sp, i) => i >= sp.mennesker;
  const navnFor = (sp, i) => (erRobot(sp, i) ? ROBOTER[i - sp.mennesker] || ROBOTER[0] : R.navn(i));
  const avatarFor = (sp, i, storrelse) =>
    erRobot(sp, i) ? `<span class="avatar lg-robot ${storrelse || ""}" style="--pf: var(--p${(i % 20) + 1})" aria-hidden="true">🤖</span>` : R.avatar(i, storrelse);
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const tall = (n) => R.tall(n);
  const valgte = (sp) => sp.terninger.filter((_, i) => sp.valgt[i]);
  const valgtVerdi = (sp) => L.verdi(valgte(sp), sp.tabell);
  const folk = (sp) => Array.from({ length: sp.antall }, (_, i) => i).filter((i) => !erRobot(sp, i));
  const lederAndre = (sp, i) => Math.max(0, ...sp.totaler.filter((_, j) => j !== i));
  // May this player stop now? (The entry score must be reached first.)
  const kanStoppe = (sp, poeng) => sp.inne[sp.tur] || !sp.inngang || poeng >= sp.inngang;

  let robotId = null;
  let robotTrykk = false;
  let hoppAnim = false;
  let ruller = false;

  // ---------- Dice ----------
  // A flat die face; the throw is shown by visKast (one place, so a shared dice module can take over).
  const PUNKTER = {
    1: [[50, 50]],
    2: [[72, 28], [28, 72]],
    3: [[72, 28], [50, 50], [28, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
  };
  const flate = (n, klasse) =>
    `<svg class="${klasse || "lg-flate"}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect x="6" y="6" width="88" height="88" rx="20"/>${PUNKTER[n]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 13 : 10}"${n === 1 ? ' class="en"' : ""}/>`)
      .join("")}</svg>`;
  function visKast(indekser) {
    return new Promise((ferdig) => {
      const knapper = R.$$("#lg-brett .lg-t");
      if (!knapper.length || R.rolig() || hoppAnim) return setTimeout(ferdig, 60);
      for (let k = 0; k < 7; k++) R.lyd.stoy(k * 0.034 + Math.random() * 0.012, 0.024, 0.08 + Math.random() * 0.07, 2600 + Math.random() * 2800);
      indekser.forEach((i, n) => {
        const el = knapper[i];
        if (!el) return;
        el.style.setProperty("--forsink", `${n * 45}ms`);
        el.classList.add("rull");
      });
      R.lyd.stoy(0.42, 0.04, 0.26, 1400);
      R.lyd.stoy(0.52, 0.04, 0.18, 1500);
      R.vibrer([14, 60, 10]);
      setTimeout(ferdig, 680);
    });
  }

  // ---------- Markup ----------
  function terningHtml(sp, i) {
    const v = sp.terninger[i];
    const valgt = !!sp.valgt[i];
    const etikett = valgt ? R.t("Terning {n} viser {v}, lagt til side", { n: i + 1, v }) : R.t("Terning {n} viser {v}", { n: i + 1, v });
    return `<button class="lg-t${valgt ? " valgt" : ""}" data-h="velg" data-v="${i}" data-stille aria-pressed="${valgt}" aria-label="${esc(etikett)}">${flate(v)}</button>`; // sprak-ok (the action's name)
  }
  function brettHtml(sp) {
    const tom = sp.status === "kast" || !sp.terninger.length;
    const terninger = tom ? Array.from({ length: sp.fri }, (_, i) => `<span class="lg-t vent" aria-hidden="true">${flate([5, 1, 4, 6, 2, 3][i])}</span>`).join("") : sp.terninger.map((_, i) => terningHtml(sp, i)).join("");
    const lagt = sp.lagt.length
      ? `<div class="lg-lagt" aria-label="${esc(R.t("Lagt til side"))}">${sp.lagt.map((g) => `<span class="lg-gruppe">${g.verdier.map((v) => flate(v, "lg-liten")).join("")}<b>+${tall(g.poeng)}</b></span>`).join("")}</div>`
      : "";
    return `<div class="lg-brett${tom ? " klar" : ""}${sp.status === "tomt" ? " tomt" : ""}" id="lg-brett" style="--n: ${Math.max(sp.fri, sp.terninger.length, 1)}">
      <div class="lg-terninger" role="group" aria-label="${esc(R.t("Terningene"))}">${terninger}</div>
      ${lagt}
      <p class="lg-hint" id="lg-hint" aria-live="polite">${esc(hintTekst(sp))}</p>
    </div>`;
  }
  function hintTekst(sp) {
    if (sp.klar) return R.t("Spillet er ferdig – se kåringen!");
    if (sp.status === "kast") {
      return erRobot(sp, sp.tur) ? R.t("{navn} kaster snart …", { navn: navnFor(sp, sp.tur) }) : R.t("Kast seks terninger.");
    }
    if (sp.status === "tomt") return R.t("Ingen poeng – turen er tapt.");
    if (ruller) return R.t("Terningene ruller …");
    if (erRobot(sp, sp.tur)) return R.t("{navn} velger …", { navn: navnFor(sp, sp.tur) });
    const n = valgte(sp).length;
    if (!n) return R.t("Trykk på terningene som gir poeng.");
    const v = valgtVerdi(sp);
    if (!v) return R.t("Noen av dem du har valgt, gir ikke poeng.");
    return R.t("Valgt: {poeng} poeng", { poeng: tall(v) });
  }
  function stillingHtml(sp) {
    if (sp.antall < 2) return "";
    return `<ul class="lg-stilling" aria-label="${esc(R.t("Stillingen"))}">${sp.totaler
      .map(
        (t, i) =>
          `<li class="${i === sp.tur ? "na" : ""}${sp.sisteRunde === i ? " mal" : ""}" style="--pf: var(--p${(i % 20) + 1}); --andel: ${Math.min(100, Math.round((t / sp.mal) * 100))}%"><span class="vh">${esc(navnFor(sp, i))}: </span>${avatarFor(sp, i)}<b>${tall(t)}</b></li>`,
      )
      .join("")}</ul>`;
  }

  // The whole score sheet: one column per player, one row per turn.
  function lappHtml(sp, o = {}) {
    const rader = Math.max(1, ...sp.logg.map((l) => l.length));
    const celle = (v) => (v == null ? "–" : v < 0 ? `<span class="lg-straff">${tall(v)}</span>` : tall(v));
    const linjer = [];
    // Under the tray only the last few turns (the whole sheet is one tap away).
    for (let r = o.siste ? Math.max(0, rader - o.siste) : 0; r < rader; r++) linjer.push(`<tr><th scope="row">${r + 1}</th>${sp.logg.map((l, i) => `<td class="${i === sp.tur && !o.slutt ? "na" : ""}">${r < l.length ? celle(l[r]) : ""}</td>`).join("")}</tr>`);
    return `<div class="lg-lapp-ramme"><table class="lg-lapp">
      <thead><tr><th scope="col"><span class="vh">${esc(R.t("Tur"))}</span></th>${sp.totaler.map((_, i) => `<th scope="col">${avatarFor(sp, i)}<span class="lg-lapp-navn">${esc(navnFor(sp, i))}</span></th>`).join("")}</tr></thead>
      <tbody>${linjer.join("")}</tbody>
      <tfoot><tr><th scope="row">${esc(R.t("Sum"))}</th>${sp.totaler.map((t) => `<td>${tall(t)}</td>`).join("")}</tr></tfoot>
    </table></div>`;
  }

  // The scoring table in the rules sheet (for the table in use).
  const tabellListe = (navn) => {
    const T = L.TABELLER[navn] || L.TABELLER.klassisk;
    const rad = (b, s) => `<li><b>${esc(b)}</b><span>${esc(s)}</span></li>`;
    const doble = T.flereLike === "dobling";
    return `<h3>${esc(R.t("Poengtabellen: {navn}", { navn: TABELLNAVN[navn] }))}</h3><ul class="lg-regelliste">
      ${rad(R.t("Én ener"), "100")}
      ${rad(R.t("Én femmer"), "50")}
      ${rad(R.t("Tre like"), R.t("100 × tallet – tre enere gir 1000"))}
      ${rad(R.t("Fire like"), doble ? R.t("Dobbelt av tre like") : "1000")}
      ${rad(R.t("Fem like"), doble ? R.t("Fire ganger tre like") : "2000")}
      ${rad(R.t("Seks like"), doble ? R.t("Åtte ganger tre like") : "3000")}
      ${rad("1-2-3-4-5-6", tall(T.straight))}
      ${rad(R.t("Tre par"), tall(T.trePar))}
      ${T.toTre ? rad(R.t("To ganger tre like"), tall(T.toTre)) : ""}
      ${T.fireOgPar ? rad(R.t("Fire like og et par"), tall(T.fireOgPar)) : ""}
    </ul>
    <p class="hjelp">${esc(R.t("Poengene teller bare innenfor samme kast."))}</p>`;
  };
  const REGLER = {
    intro: R.t("Kast seks terninger, legg til side det som gir poeng – og våg å kaste videre. Først til målet starter siste runde."),
    steg: [
      [R.t("Kast og legg til side"), R.t("Etter hvert kast legger du til side minst én terning som gir poeng: enere, femmere, tre like eller mer.")],
      [R.t("Kast videre – eller stopp"), R.t("Kast resten på nytt for flere poeng, eller stopp og skriv opp poengene. Gir et kast ingen poeng, er hele turen tapt.")],
      [R.t("Først til målet"), R.t("Når noen når målet, får alle de andre én tur til. Flest poeng da vinner.")],
    ],
    tips: [
      R.t("Ga alle seks terningene poeng? Da kaster du alle seks på nytt og fortsetter turen."),
      R.t("Det lønner seg ofte å legge til side bare én ener og kaste flere terninger igjen."),
      R.t("Med inngang må du få minst så mange poeng i én tur før du kommer på lista."),
      R.t("Husregel: Tre tomme kast på rad koster 1000 poeng."),
      R.t("Stoppet for tidlig? «Angre» tar tilbake poengene, helt til neste kast."),
    ],
    ekstraHtml: tabellListe("klassisk"),
  };
  const visTabell = (navn) => {
    REGLER.ekstraHtml = tabellListe(navn);
  };

  // ---------- Playing ----------
  function nyttSpill(S) {
    const o = S.oppsett;
    const mennesker = R.klamp(Number(S.antall) || 1, 1, 8);
    const roboter = R.klamp(Number(o.roboter) || 0, 0, Math.min(3, 8 - mennesker));
    const antall = mennesker + roboter;
    S.spill = {
      antall,
      mennesker,
      niva: NIVAER.includes(o.niva) ? o.niva : "middels",
      mal: MAL.includes(o.mal) ? o.mal : 10000,
      tabell: L.TABELLER[o.tabell] ? o.tabell : "klassisk",
      inngang: INNGANG.includes(o.inngang) ? o.inngang : 0,
      straff: !!o.straff,
      totaler: Array(antall).fill(0),
      inne: Array(antall).fill(false),
      tomme: Array(antall).fill(0),
      logg: Array.from({ length: antall }, () => []),
      tur: 0,
      fri: 6,
      terninger: [],
      valgt: [],
      lagt: [],
      turPoeng: 0,
      status: "kast",
      sisteRunde: -1,
      klar: false,
      angre: null,
      ferdig: false,
      registrert: false,
      runde: 1,
    };
    hoppAnim = false;
    ruller = false;
    R.statistikk("start", { spillere: mennesker, roboter, mal: S.spill.mal, tabell: S.spill.tabell, inngang: S.spill.inngang, straff: S.spill.straff });
  }

  async function kast(S) {
    const sp = S.spill;
    if (!pagar(S) || ruller || sp.status === "tomt" || sp.klar) return;
    if (sp.status === "velg") {
      // Put the chosen dice aside first.
      const v = valgtVerdi(sp);
      if (!v) return;
      sp.lagt.push({ verdier: valgte(sp), poeng: v });
      sp.turPoeng += v;
      sp.fri = sp.terninger.length - valgte(sp).length || 6;
    }
    sp.angre = null;
    const n = sp.fri;
    sp.terninger = Array.from({ length: n }, () => 1 + Math.floor(tilfeldig() * 6));
    sp.valgt = sp.terninger.map(() => false);
    const tomt = !L.harPoeng(sp.terninger, sp.tabell);
    sp.status = tomt ? "tomt" : "velg";
    if (tomt) bomTur(sp);
    R.lagre(); // the result is saved before the dice land
    ruller = true;
    R.vis();
    const fortsatt = R.vakt();
    await visKast(sp.terninger.map((_, i) => i));
    ruller = false;
    if (!fortsatt() || R.S.spill !== sp) return;
    R.vis();
    const kastet = R.ramsOpp(sp.terninger.map(String));
    R.si((erRobot(sp, sp.tur) ? R.t("{navn} kastet {terninger}.", { navn: navnFor(sp, sp.tur), terninger: kastet }) : R.t("Du kastet {terninger}.", { terninger: kastet })) + (tomt ? " " + R.t("Ingen poeng – turen er tapt.") : ""));
    if (tomt) {
      stempel(R.t("Tomt!"), "rod");
      R.lyd.tone(330, 0, 0.18, "triangle", 0.12, 200);
      R.lyd.tone(247, 0.16, 0.3, "triangle", 0.11, 160);
      R.vibrer([30, 50, 30]);
    } else feir(sp);
    driv();
  }
  // An empty roll: the turn's points are gone (and maybe the penalty).
  function bomTur(sp) {
    const i = sp.tur;
    sp.tomme[i]++;
    sp.logg[i].push(null);
    if (sp.straff && sp.tomme[i] >= 3) {
      const trekk = Math.min(1000, sp.totaler[i]);
      sp.totaler[i] -= trekk;
      sp.tomme[i] = 0;
      if (trekk) sp.logg[i].push(-trekk);
      sp.straffet = true;
    } else sp.straffet = false;
  }
  function feir(sp) {
    const alle = L.beste(sp.terninger, sp.tabell);
    if (!alle) return;
    if (sp.terninger.length === 6 && alle.idx.length === 6 && alle.verdi >= 1000) {
      stempel(alle.verdi >= 1500 ? R.t("Jackpot!") : R.t("Alle seks!"), "aksent");
      R.lyd.fanfare();
      R.konfetti();
    } else if (alle.verdi >= 1000) {
      stempel(R.t("{n}!", { n: tall(alle.verdi) }), "mynte");
      R.lyd.riktig();
    }
  }
  function stempel(tekst, klasse) {
    const brett = R.$("#lg-brett");
    if (!brett) return;
    const gml = R.$(".lg-stempel", brett);
    if (gml) gml.remove();
    brett.insertAdjacentHTML("beforeend", `<span class="lg-stempel" aria-hidden="true"><span class="stempel ${klasse}">${esc(tekst)}</span></span>`);
  }

  function nesteTur(S) {
    const sp = S.spill;
    // The last round is over (or the target reached alone): wait for «Se kåringen», so the last
    // «Stopp» can still be taken back.
    const neste = (sp.tur + 1) % sp.antall;
    if (sp.sisteRunde >= 0 && (sp.sisteRunde === neste || sp.antall === 1)) {
      sp.klar = true;
      sp.status = "kast";
      sp.terninger = [];
      sp.lagt = [];
      sp.turPoeng = 0;
      R.vis();
      R.si(R.t("Spillet er ferdig – se kåringen!"));
      return;
    }
    sp.tur = neste;
    if (sp.tur === 0) sp.runde++;
    sp.fri = 6;
    sp.terninger = [];
    sp.valgt = [];
    sp.lagt = [];
    sp.turPoeng = 0;
    sp.status = "kast";
    if (!erRobot(sp, sp.tur)) hoppAnim = false;
    R.vis();
    if (sp.antall > 1) {
      R.lyd.pop();
      R.si(R.t("{navn} sin tur.", { navn: navnFor(sp, sp.tur) }));
    }
    driv();
  }

  function stopp(S) {
    const sp = S.spill;
    if (!pagar(S) || ruller || sp.status !== "velg") return;
    const v = valgtVerdi(sp);
    if (!v) return;
    const poeng = sp.turPoeng + v;
    if (!kanStoppe(sp, poeng)) return;
    const i = sp.tur;
    if (!erRobot(sp, i)) sp.angre = JSON.stringify({ tur: i, terninger: sp.terninger, valgt: sp.valgt, fri: sp.fri, lagt: sp.lagt, turPoeng: sp.turPoeng, total: sp.totaler[i], inne: sp.inne[i], tomme: sp.tomme[i], sisteRunde: sp.sisteRunde, runde: sp.runde });
    sp.totaler[i] += poeng;
    sp.inne[i] = true;
    sp.tomme[i] = 0;
    sp.logg[i].push(poeng);
    R.lyd.riktig();
    R.vibrer(20);
    const navn = navnFor(sp, i);
    let melding = sp.antall > 1 ? R.t("+{poeng} til {navn}", { poeng: tall(poeng), navn }) : R.t("+{poeng} poeng", { poeng: tall(poeng) });
    if (sp.totaler[i] >= sp.mal && sp.sisteRunde < 0) {
      sp.sisteRunde = i;
      if (sp.antall > 1) {
        melding = R.t("{navn} nådde {mal}! Siste runde – alle andre får én tur til.", { navn, mal: tall(sp.mal) });
        R.lyd.fanfare();
      }
    }
    R.si(R.t("{navn} skrev opp {poeng} og har {total}.", { navn, poeng: tall(poeng), total: tall(sp.totaler[i]) }));
    nesteTur(S);
    if (R.S.skjerm === "spill") R.toast(melding);
  }

  function angre(S) {
    const sp = S.spill;
    if (!sp || !sp.angre || ruller) return;
    const a = JSON.parse(sp.angre);
    sp.klar = false;
    sp.logg[a.tur].pop();
    Object.assign(sp, { tur: a.tur, terninger: a.terninger, valgt: a.valgt, fri: a.fri, lagt: a.lagt, turPoeng: a.turPoeng, sisteRunde: a.sisteRunde, runde: a.runde, status: "velg" });
    sp.totaler[a.tur] = a.total;
    sp.inne[a.tur] = a.inne;
    sp.tomme[a.tur] = a.tomme;
    sp.angre = null;
    stoppRobot();
    R.lyd.snu();
    R.toast(R.t("Angret – {navn} velger på nytt", { navn: navnFor(sp, sp.tur) }));
    R.vis();
  }

  // ---------- The end ----------
  function avsluttSpill(S, komplett) {
    const sp = S.spill;
    stoppRobot();
    sp.ferdig = true;
    const topp = Math.max(...sp.totaler);
    const vinnere = sp.totaler.map((t, i) => (t === topp && topp > 0 ? i : -1)).filter((i) => i >= 0);
    sp.resultat = { vinnere, komplett, turer: sp.logg[0].length };
    const roboter = sp.antall - sp.mennesker;
    // Records: alone, the fewest turns to the target; against the phone, wins and losses.
    if (komplett && sp.antall === 1) {
      const r = S.rekord.solo || (S.rekord.solo = {});
      const gml = r[sp.mal];
      sp.resultat.gml = gml || null;
      sp.resultat.ny = !gml || sp.resultat.turer < gml;
      if (sp.resultat.ny) r[sp.mal] = sp.resultat.turer;
      S.sist = { tekst: R.t("{mal} på {turer}.", { mal: tall(sp.mal), turer: R.flertall(sp.resultat.turer, "tur", "turer") }) };
    } else if (komplett && vinnere.length) {
      const navn = R.ramsOpp(vinnere.map((i) => R.kutt(navnFor(sp, i), 16)));
      S.sist = { tekst: R.t("{navn} vant med {poeng}.", { navn, poeng: tall(topp) }) };
      if (roboter) {
        const r = S.rekord.mobil || (S.rekord.mobil = {});
        const rad = r[sp.niva] || (r[sp.niva] = { seier: 0, tap: 0 });
        if (vinnere.some((i) => !erRobot(sp, i))) {
          rad.seier++;
          R.merke("klassiker-lykkegrisen");
        } else rad.tap++;
      }
    }
    const rader = folk(sp).map((i) => ({ i, poeng: sp.totaler[i] }));
    if (rader.length > 1) R.kveld.registrer(rader); // the phone never takes a place in «Kveldens gjeng»
    R.statistikk("ferdig", { spillere: sp.mennesker, roboter, mal: sp.mal, komplett: !!komplett, turer: sp.logg[0].length, poeng: topp });
    R.gaTil("slutt");
  }

  // ---------- The phone's turn ----------
  function stoppRobot() {
    clearTimeout(robotId);
    robotId = null;
  }
  async function trykk(navn, el) {
    robotTrykk = true;
    try {
      await H[navn](el, null, R.S);
    } finally {
      robotTrykk = false;
    }
  }
  function driv() {
    stoppRobot();
    const S = R.S;
    const sp = S && S.spill;
    if (!sp || sp.ferdig || sp.klar || S.skjerm !== "spill" || !erRobot(sp, sp.tur) || ruller) return;
    if (R.arkApent()) {
      robotId = setTimeout(driv, 400);
      return;
    }
    const pause = (ms) => (R.rolig() || hoppAnim ? 120 : ms);
    if (sp.status === "kast") {
      robotId = setTimeout(() => trykk("kast"), pause(sp.lagt.length ? 700 : 900));
      return;
    }
    if (sp.status === "tomt") {
      robotId = setTimeout(() => trykk("neste"), pause(1500));
      return;
    }
    const i = sp.tur;
    const ctx = { tur: sp.turPoeng, total: sp.totaler[i], mal: sp.mal, inngang: sp.inngang, inne: sp.inne[i], leder: lederAndre(sp, i), sisteRunde: sp.sisteRunde >= 0 };
    const u = L.velg(sp.terninger, ctx, sp.niva, sp.tabell, tilfeldig);
    const onsket = sp.terninger.map((_, k) => u.idx.includes(k));
    const endringer = onsket.map((v, k) => (v !== !!sp.valgt[k] ? k : -1)).filter((k) => k >= 0);
    let n = 0;
    const neste = () => {
      robotId = null;
      if (R.S.skjerm !== "spill" || R.S.spill !== sp || sp.status !== "velg") return;
      if (n < endringer.length) {
        const k = endringer[n++];
        const el = R.$(`#skjerm [data-h="velg"][data-v="${k}"]`);
        robotTrykk = true;
        H.velg(el || { dataset: { v: String(k) } }, null, R.S);
        robotTrykk = false;
        robotId = setTimeout(neste, pause(380));
        return;
      }
      const igjen = sp.terninger.length - u.idx.length || 6;
      const stopper = L.skalStoppe({ ...ctx, tur: sp.turPoeng + u.verdi, n: igjen }, sp.niva, tilfeldig);
      robotId = setTimeout(() => trykk(stopper ? "stopp" : "kast"), pause(700));
    };
    robotId = setTimeout(neste, pause(650));
  }

  // ---------- Screens ----------
  function hodeHtml(sp) {
    const i = sp.tur;
    const etikett = erRobot(sp, i) ? R.t("Mobilen · {niva}", { niva: NIVANAVN[sp.niva] }) : sp.antall > 1 ? R.t("Din tur") : R.t("Mål: {mal}", { mal: tall(sp.mal) });
    const turVerdi = sp.turPoeng + (sp.status === "velg" ? valgtVerdi(sp) : 0);
    return `<div class="lg-hode">
      ${avatarFor(sp, i, "mid")}
      <div class="lg-hvem">
        <p class="etikett">${esc(sp.sisteRunde >= 0 && sp.antall > 1 ? R.t("Siste runde!") : etikett)}</p>
        <h1 id="skjerm-tittel">${esc(navnFor(sp, i))}</h1>
        <p class="lg-total">${esc(R.t("{poeng} på lista", { poeng: tall(sp.totaler[i]) }))}</p>
      </div>
      <p class="lg-tur${sp.status === "tomt" ? " tapt" : ""}"><b>${sp.status === "tomt" ? "0" : tall(turVerdi)}</b><small>${esc(R.t("denne turen"))}</small></p>
    </div>`;
  }
  function dokkHtml(sp) {
    const lenker = [];
    if (sp.angre) lenker.push(`<button class="lenke" data-h="angre">↶ ${esc(R.t("Angre"))}</button>`);
    if (sp.klar) return R.ui.dokk(R.ui.knapp(R.t("Se kåringen"), "kaaring", { variant: "stor", ikon: "🏆" }), R.ui.lenkerad(...lenker, R.ui.lenke(R.t("Poenglista"), "lapp")));
    if (erRobot(sp, sp.tur)) {
      if (!hoppAnim && !R.rolig()) lenker.push(R.ui.lenke(R.t("Hopp over animasjonen"), "hopp-anim"));
      lenker.push(R.ui.lenke(R.t("Poenglista"), "lapp"), R.ui.lenke(R.t("Avslutt"), "avslutt"));
      return R.ui.dokk(R.ui.knapp(R.t("{navn} spiller …", { navn: navnFor(sp, sp.tur) }), "vent", { av: true, ikon: "🤖" }), R.ui.lenkerad(...lenker));
    }
    let hoved;
    let andre = "";
    if (sp.status === "kast") hoved = R.ui.knapp(sp.lagt.length ? R.t("Kast alle seks igjen") : R.t("Kast terningene"), "kast", { variant: "stor", ikon: "🎲" });
    else if (sp.status === "tomt") hoved = R.ui.knapp(sp.antall > 1 ? R.t("Gi turen videre") : R.t("Ny tur"), "neste", { variant: "stor" });
    else {
      const v = valgtVerdi(sp);
      const igjen = sp.terninger.length - valgte(sp).length;
      const poeng = sp.turPoeng + v;
      hoved = R.ui.knapp(igjen ? R.t("Kast {terninger} igjen", { terninger: R.flertall(igjen, "terning", "terninger") }) : R.t("Kast alle seks igjen"), "kast", { variant: "stor", av: !v || ruller, ikon: "🎲" });
      const mangler = v && !kanStoppe(sp, poeng);
      andre = R.ui.knapp2(mangler ? R.t("Du trenger {n} for å komme inn", { n: tall(sp.inngang) }) : R.t("Stopp og ta {poeng}", { poeng: tall(poeng) }), "stopp", { av: !v || mangler || ruller });
      if (sp.terninger.length && !ruller) lenker.push(R.ui.lenke(R.t("Velg poengene"), "beste"));
    }
    lenker.push(R.ui.lenke(R.t("Poenglista"), "lapp"), R.ui.lenke(R.t("Avslutt"), "avslutt"));
    return R.ui.dokk(hoved, andre, R.ui.lenkerad(...lenker));
  }

  function rekordHtml(S) {
    const linjer = [];
    const solo = S.rekord.solo || {};
    for (const m of MAL) if (solo[m]) linjer.push(`<li><span aria-hidden="true">🏆</span> ${esc(R.t("Alene til {mal}: {turer}", { mal: tall(m), turer: R.flertall(solo[m], "tur", "turer") }))}</li>`);
    const mobil = S.rekord.mobil || {};
    for (const n of NIVAER) {
      const r = mobil[n];
      if (r && r.seier + r.tap) linjer.push(`<li><b class="lg-niva">${esc(NIVANAVN[n])}</b> <span><b>${r.seier}</b> ${esc(R.t("seier|seirer", { n: r.seier }))}</span> <span><b>${r.tap}</b> ${esc(R.t("tap|tap", { n: r.tap }))}</span></li>`);
    }
    if (S.sist) linjer.push(`<li class="lg-sist"><b>${esc(R.t("Sist:"))}</b> ${esc(S.sist.tekst)}</li>`);
    return linjer.length ? `<section class="lg-rekorder" aria-label="${esc(R.t("Rekorder på denne mobilen"))}"><p class="etikett">${esc(R.t("Rekorder på denne mobilen"))}</p><ul>${linjer.join("")}</ul></section>` : "";
  }

  function motMobilenHtml(S) {
    const mennesker = R.klamp(Number(S.antall) || 1, 1, 8);
    const maks = Math.min(3, 8 - mennesker);
    const r = Math.min(S.oppsett.roboter, maks);
    return `<section class="seksjon">
      <div class="seksjon-hode"><h2>${esc(R.t("Mot mobilen"))}</h2><span class="tall">${esc(r ? R.t("{spillere} i alt", { spillere: R.flertall(mennesker + r, "spiller", "spillere") }) : R.t("Av"))}</span></div>
      ${R.ui.seg("roboter", [[0, R.t("Ingen")], [1, "1"], [2, "2"], [3, "3"]], r, { etikett: R.t("Hvor mange spillere mobilen er"), av: (v) => Number(v) > maks })}
      ${r ? R.ui.seg("niva", NIVAER.map((n) => [n, NIVANAVN[n]]), S.oppsett.niva, { etikett: R.t("Hvor flink mobilen er") }) : ""}
      <p class="hjelp">${esc(r ? R.t("Mobilen spiller som {navn} 🤖 – {hvordan}.", { navn: R.ramsOpp(ROBOTER.slice(0, r)), hvordan: { lett: R.t("stopper tidlig og tar ingen sjanser"), middels: R.t("vet når det lønner seg å stoppe"), vanskelig: R.t("regner på sjansene og våger mer når det trengs") }[S.oppsett.niva] }) : R.t("Legg til en motspiller som mobilen styrer."))}</p>
    </section>`;
  }

  R.start({
    id: "lykkegrisen",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: Math.max(1, Math.min(8, R.felles.navn.filter((n) => String(n || "").trim()).length || 1)),
      oppsett: { roboter: 1, niva: "middels", mal: 10000, tabell: "klassisk", inngang: 0, straff: false },
      rekord: {},
      sist: null,
      spill: null,
    }),

    lastet(S) {
      const o = (S.oppsett = Object.assign({ roboter: 1, niva: "middels", mal: 10000, tabell: "klassisk", inngang: 0, straff: false }, S.oppsett || {}));
      o.roboter = R.klamp(Number(o.roboter) || 0, 0, 3);
      if (!NIVAER.includes(o.niva)) o.niva = "middels";
      if (!MAL.includes(o.mal)) o.mal = 10000;
      if (!L.TABELLER[o.tabell]) o.tabell = "klassisk";
      if (!INNGANG.includes(o.inngang)) o.inngang = 0;
      o.straff = !!o.straff;
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      if (S.sist && typeof S.sist.tekst !== "string") S.sist = null;
      S.antall = R.klamp(Number(S.antall) || 1, 1, 8);
      const sp = S.spill;
      if (sp) {
        const n = sp.antall;
        const ok =
          Number.isInteger(n) && n >= 1 && n <= 8 && Number.isInteger(sp.mennesker) && sp.mennesker >= 1 && sp.mennesker <= n &&
          [sp.totaler, sp.inne, sp.tomme, sp.logg].every((a) => Array.isArray(a) && a.length === n) &&
          Number.isInteger(sp.tur) && sp.tur >= 0 && sp.tur < n && Array.isArray(sp.terninger) && sp.terninger.every((v) => Number.isInteger(v) && v >= 1 && v <= 6) &&
          Array.isArray(sp.valgt) && Array.isArray(sp.lagt) && ["kast", "velg", "tomt"].includes(sp.status) && Number.isInteger(sp.fri) && sp.fri >= 1 && sp.fri <= 6 &&
          NIVAER.includes(sp.niva) && MAL.includes(sp.mal) && L.TABELLER[sp.tabell];
        if (!ok) S.spill = null;
        else if (sp.status === "velg" && !L.harPoeng(sp.terninger, sp.tabell)) sp.status = "tomt";
      }
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = S.spill ? "spill" : "hjem";
      if (S.skjerm === "spill" && S.spill && S.spill.ferdig) S.skjerm = "slutt";
    },

    regler: REGLER,

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          visTabell(pagar(S) ? sp.tabell : S.oppsett.tabell);
          return (
            R.ui.spillhjem({
              slagordHtml: `${esc(R.t("Kast, legg til side – og våg litt til."))}<br><em>${esc(R.t("Først til 10 000!"))}</em>`,
              knapperHtml: R.ui.startKnapper({
                pagar: pagar(S),
                fortsettTekst: pagar(S) ? R.t("Fortsett · runde {n}", { n: sp.runde }) : "",
                ekstraHtml: R.ui.lenke(R.t("Slik spiller du"), "regler"),
              }),
              merker: [
                ["1–8", R.t("spillere")],
                ["6", R.t("terninger")],
                ["0", R.t("reklame")],
              ],
            }) + rekordHtml(S)
          );
        },
        inn: () => R.slippVaken(),
      },

      oppsett: {
        tittel: R.t("Nytt spill"),
        tilbake: "hjem",
        etter: (S) => visTabell(S.oppsett.tabell),
        vis(S) {
          const o = S.oppsett;
          return `
            <h1 id="skjerm-tittel">${esc(R.t("Gjør klart"))}</h1>
            ${R.ui.spillere({ min: 1, max: 8, tittel: R.t("Hvem spiller?"), hjelp: (S.antall || 1) > 1 ? R.t("Send mobilen videre etter hver tur.") : R.t("Alene? Se hvor fort du når målet – eller spill mot mobilen.") })}
            ${motMobilenHtml(S)}
            <section class="seksjon">
              <h2>${esc(R.t("Mål"))}</h2>
              ${R.ui.seg("mal", MAL.map((m) => [m, tall(m)]), o.mal, { etikett: R.t("Mål") })}
              <p class="hjelp">${esc(o.mal === 10000 ? R.t("Det klassiske målet. Tar gjerne en halvtime.") : R.t("Et kortere spill."))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Poengtabell"))}</h2>
              ${R.ui.seg("tabell", Object.keys(L.TABELLER).map((t) => [t, TABELLNAVN[t]]), o.tabell, { etikett: R.t("Poengtabell") })}
              <p class="hjelp">${esc(o.tabell === "klassisk" ? R.t("Fire like gir dobbelt av tre like, fem like fire ganger. Tre par gir 1000.") : R.t("Fire like gir 1000, fem like 2000 og seks like 3000. Tre par gir 1500, to ganger tre like 2500."))}</p>
            </section>
            <section class="seksjon">
              <h2>${esc(R.t("Inngang"))}</h2>
              ${R.ui.seg("inngang", INNGANG.map((n) => [n, n ? tall(n) : R.t("Ingen")]), o.inngang, { etikett: R.t("Inngang") })}
              <p class="hjelp">${esc(o.inngang ? R.t("Du må få minst {n} i én tur før du kommer på lista.", { n: tall(o.inngang) }) : R.t("Alle poeng teller fra første tur."))}</p>
            </section>
            ${R.ui.bryter("straff", o.straff, R.t("Tre tomme kast på rad: −1000"), R.t("En husregel for de modige."))}
            ${R.ui.dokk(R.ui.knapp(R.t("Start"), "start", { variant: "stor", ikon: "🎲" }))}`;
        },
      },

      spill: {
        tittel: (S) => (S.spill.sisteRunde >= 0 && S.spill.antall > 1 ? R.t("Siste runde") : S.spill.antall > 1 ? R.t("Runde {n}", { n: S.spill.runde }) : R.t("Tur {n}", { n: S.spill.logg[0].length + 1 })),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          visTabell(sp.tabell);
          const lapp = sp.logg.some((l) => l.length) ? `<section class="lg-under" aria-label="${esc(R.t("Poenglista"))}">${lappHtml(sp, { siste: 3 })}</section>` : "";
          return `${hodeHtml(sp)}${stillingHtml(sp)}${brettHtml(sp)}${lapp}${dokkHtml(sp)}`;
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          ruller = false;
          R.holdVaken();
          R.vedForlat(stoppRobot);
          driv();
        },
        ut() {
          stoppRobot();
        },
      },

      slutt: {
        tittel: R.t("Kåringen"),
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const res = sp.resultat || { vinnere: [] };
          const rader = sp.totaler.map((p, i) => ({ i, poeng: p, ...(erRobot(sp, i) ? { navn: navnFor(sp, i) } : {}) }));
          const topp = Math.max(...sp.totaler);
          const lapp = `<section class="seksjon"><h2>${esc(R.t("Poenglista"))}</h2>${lappHtml(sp, { slutt: true })}</section>`;
          const dokk = R.ui.dokk(R.ui.knapp(R.t("Spill igjen"), "igjen", { ikon: "🎲" }), R.ui.lenkerad(R.ui.lenke(R.t("Del resultatet"), "del"), R.ui.lenke(R.t("Endre oppsett"), "endre"), `<a class="lenke" href="${R.forside}">${esc(R.t("Alle spill"))}</a>`));
          if (sp.antall === 1) {
            const tittel = !res.komplett ? R.t("Godt kjempa!") : res.ny && res.gml ? R.t("Ny rekord!") : R.t("Godt jobba!");
            const tekst = !res.komplett
              ? R.t("Du kom til {poeng}. Nå målet for å sette rekord!", { poeng: tall(topp) })
              : res.ny && res.gml
                ? R.t("{mal} på {turer} – forrige rekord var {gml}.", { mal: tall(sp.mal), turer: R.flertall(res.turer, "tur", "turer"), gml: R.flertall(res.gml, "tur", "turer") })
                : R.t("{mal} på {turer}.", { mal: tall(sp.mal), turer: R.flertall(res.turer, "tur", "turer") });
            return `${R.ui.banner({ tittel, tekst, klasse: "aksent", stemning: res.komplett ? "jubel" : "lei" })}${lapp}${R.ui.flereSpill({ antall: 1 })}${dokk}`;
          }
          const vinnere = res.vinnere || [];
          const mobilVant = vinnere.length && vinnere.every((i) => erRobot(sp, i));
          const tittel = !vinnere.length ? R.t("Ingen vinner denne gangen") : vinnere.length === 1 && !erRobot(sp, vinnere[0]) && sp.mennesker === 1 && sp.antall > 1 ? R.t("Du vinner!") : R.t("{navn} vinner!|{navn} vinner!", { navn: R.ramsOpp(vinnere.map((i) => navnFor(sp, i))), n: vinnere.length });
          const tekst = !vinnere.length ? "" : vinnere.length > 1 ? R.t("Likt med {poeng} hver.", { poeng: tall(topp) }) : mobilVant ? R.t("{poeng} – mobilen vant denne gangen. Revansj?", { poeng: tall(topp) }) : R.t("{poeng} poeng", { poeng: tall(topp) });
          const robotAvatarer = (html) => {
            for (let i = sp.mennesker; i < sp.antall; i++) html = html.split(R.avatar(i, "stor")).join(avatarFor(sp, i, "stor")).split(R.avatar(i)).join(avatarFor(sp, i));
            return html;
          };
          return `
            ${R.ui.banner({ tittel, tekst, etikett: R.t("Mål: {mal}", { mal: tall(sp.mal) }), klasse: mobilVant ? "" : "aksent", stemning: mobilVant || !vinnere.length ? "lei" : "jubel" })}
            ${robotAvatarer(R.ui.pall(rader) + R.ui.poengliste(rader))}
            ${lapp}
            ${R.ui.flereSpill({ antall: sp.mennesker })}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const vinnere = (sp.resultat && sp.resultat.vinnere) || [];
          if (vinnere.length && vinnere.some((i) => !erRobot(sp, i)) && sp.resultat.komplett !== false) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
          R.slippVaken();
        },
      },
    },

    handlinger: (H = {
      async nytt(el, e, S) {
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        S.spill = null;
        R.gaTil("oppsett");
      },
      endre: () => R.gaTil("oppsett"),
      fortsett(el, e, S) {
        if (pagar(S)) R.gaTil("spill");
      },
      roboter(el, e, S) {
        S.oppsett.roboter = R.klamp(Number(el.dataset.v) || 0, 0, 3);
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = NIVAER.includes(el.dataset.v) ? el.dataset.v : "middels";
        R.vis();
      },
      mal(el, e, S) {
        const m = Number(el.dataset.v);
        S.oppsett.mal = MAL.includes(m) ? m : 10000;
        R.vis();
      },
      tabell(el, e, S) {
        S.oppsett.tabell = L.TABELLER[el.dataset.v] ? el.dataset.v : "klassisk";
        R.vis();
      },
      inngang(el, e, S) {
        const n = Number(el.dataset.v);
        S.oppsett.inngang = INNGANG.includes(n) ? n : 0;
        R.vis();
      },
      straff(el, e, S) {
        S.oppsett.straff = !S.oppsett.straff;
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
      vent() {},
      "hopp-anim"(el, e, S) {
        if (!S.spill || !erRobot(S.spill, S.spill.tur)) return;
        hoppAnim = true;
        el.remove();
        driv();
      },
      velg(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || sp.status !== "velg") return;
        if (erRobot(sp, sp.tur) && !robotTrykk) return;
        const i = Number(el.dataset.v);
        if (!(i >= 0 && i < sp.terninger.length)) return;
        sp.valgt[i] = !sp.valgt[i];
        if (sp.valgt[i]) R.lyd.pop();
        else R.lyd.tone(420, 0, 0.08, "sine", 0.16, 300);
        R.vibrer(8);
        R.vis();
      },
      beste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || sp.status !== "velg" || erRobot(sp, sp.tur)) return;
        const b = L.beste(sp.terninger, sp.tabell);
        if (!b) return;
        sp.valgt = sp.terninger.map((_, i) => b.idx.includes(i));
        R.lyd.pop();
        R.vis();
      },
      kast(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || (erRobot(sp, sp.tur) && !robotTrykk)) return;
        if (sp.status === "velg" && !valgtVerdi(sp)) {
          R.toast(valgte(sp).length ? R.t("Noen av dem du har valgt, gir ikke poeng") : R.t("Legg til side minst én terning som gir poeng"));
          return;
        }
        if (sp.status === "velg" && valgte(sp).length === sp.terninger.length) R.toast(R.t("Alle ga poeng – du får kaste alle seks igjen!"));
        return kast(S);
      },
      stopp(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || (erRobot(sp, sp.tur) && !robotTrykk)) return;
        stopp(S);
      },
      neste(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || sp.status !== "tomt" || ruller || (erRobot(sp, sp.tur) && !robotTrykk)) return;
        if (sp.straffet) R.toast(R.t("Tre tomme kast på rad – minus 1000!"));
        sp.straffet = false;
        nesteTur(S);
      },
      angre(el, e, S) {
        angre(S);
      },
      kaaring(el, e, S) {
        if (pagar(S) && S.spill.klar) avsluttSpill(S, true);
      },
      lapp(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.ark(`
          <h2 id="ark-tittel">${esc(R.t("Poenglista"))}</h2>
          ${lappHtml(sp)}
          <p class="hjelp">${esc(R.t("Mål: {mal} · – betyr et tomt kast.", { mal: tall(sp.mal) }))}</p>
          <button class="knapp" data-h="lukk-ark">${esc(R.t("Spill videre"))}</button>`);
      },
      del(el, e, S) {
        const sp = S.spill;
        if (!sp || !sp.ferdig) return;
        const topp = Math.max(...sp.totaler);
        const navn = R.app.navn;
        let tekst;
        let linjer;
        if (sp.antall === 1) {
          const turer = R.flertall(sp.logg[0].length, "tur", "turer");
          tekst = R.t("Jeg nådde {mal} på {turer} i {spill}. Klarer du det raskere?", { mal: tall(sp.mal), turer, spill: navn });
          linjer = [tall(topp), turer];
        } else {
          const v = (sp.resultat.vinnere || []).map((i) => navnFor(sp, i));
          tekst = R.t("{navn} vant {spill} med {poeng}! Kast terningene du også.", { navn: R.ramsOpp(v), spill: navn, poeng: tall(topp) });
          linjer = [tall(topp), R.t("{navn} vant", { navn: R.ramsOpp(v.map((x) => R.kutt(x, 14))) })];
        }
        R.del(navn, tekst, DEL_URL, { kort: { tittel: navn, linjer } });
      },
      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller) return;
        const fortsatt = R.vakt();
        stoppRobot();
        const tom = sp.logg.every((l) => !l.length);
        if (tom) {
          const ja = await R.bekreft(R.t("Avslutte spillet?"), sp.antall > 1 ? R.t("Ingen har fått poeng ennå. Dere kan alltid starte et nytt.") : R.t("Du har ikke fått poeng ennå. Du kan alltid starte et nytt."), R.t("Avslutt"), R.t("Spill videre"));
          if (!fortsatt()) return;
          if (!ja) return driv();
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        const ja = await R.bekreft(R.t("Avslutte spillet?"), R.t("Dere går rett til kåringen med poengene så langt."), R.t("Avslutt"), R.t("Spill videre"));
        if (!fortsatt() || !pagar(S)) return;
        if (!ja) return driv();
        avsluttSpill(S, false);
      },
    }),
  });
})();
