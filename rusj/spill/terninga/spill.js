/* Terninga — Yatzy with Scandinavian rules, plus the six-dice variant («maxi»).
   Five (or six) 3D dice, three rolls, tap a die to hold it. The score pad shows what every open box
   would give; one tap scores, and «Angre» takes it back until the next roll. Pass the phone round
   the table. The rules are pure functions (window.RusjTerninga) so test/terninga.test.mjs can check
   every box in Node without a browser. */
(function () {
  "use strict";

  // ---------- Rules (pure: no DOM, no kit) ----------

  const OVER = ["enere", "toere", "treere", "firere", "femmere", "seksere"];
  const KAT = {
    enere: { navn: "Enere", regel: "Summen av alle enere." },
    toere: { navn: "Toere", regel: "Summen av alle toere." },
    treere: { navn: "Treere", regel: "Summen av alle treere." },
    firere: { navn: "Firere", regel: "Summen av alle firere." },
    femmere: { navn: "Femmere", regel: "Summen av alle femmere." },
    seksere: { navn: "Seksere", regel: "Summen av alle seksere." },
    par1: { navn: "Ett par", regel: "To like. Det høyeste paret teller." },
    par2: { navn: "To par", regel: "To ulike par." },
    par3: { navn: "Tre par", regel: "Tre ulike par." },
    like3: { navn: "Tre like", regel: "Summen av tre like." },
    like4: { navn: "Fire like", regel: "Summen av fire like." },
    like5: { navn: "Fem like", regel: "Summen av fem like." },
    liten: { navn: "Liten straight", kort: "Liten str.", regel: "1-2-3-4-5 gir 15." },
    stor: { navn: "Stor straight", kort: "Stor str.", regel: "2-3-4-5-6 gir 20." },
    full: { navn: "Full straight", kort: "Full str.", regel: "1-2-3-4-5-6 gir 21." },
    hus: { navn: "Hus", regel: "Tre like og to like av et annet tall. Summen av dem." },
    villa: { navn: "Villa", regel: "To ganger tre like. Summen av alle." },
    taarn: { navn: "Tårn", regel: "Fire like og to like av et annet tall. Summen av alle." },
    sjanse: { navn: "Sjanse", regel: "Summen av alle terningene." },
    yatzy: { navn: "Yatzy", regel: "Fem like gir 50." },
  };
  const VARIANTER = {
    vanlig: {
      id: "vanlig",
      navn: "Yatzy",
      terninger: 5,
      grense: 63,
      bonus: 50,
      yatzy: 50,
      spar: false,
      over: OVER,
      under: ["par1", "par2", "like3", "like4", "liten", "stor", "hus", "sjanse", "yatzy"],
    },
    maxi: {
      id: "maxi",
      navn: "Yatzy med seks terninger",
      terninger: 6,
      grense: 84,
      bonus: 100,
      yatzy: 100,
      spar: true, // rolls you don't use are saved for later turns
      over: OVER,
      under: ["par1", "par2", "par3", "like3", "like4", "like5", "liten", "stor", "full", "hus", "villa", "taarn", "sjanse", "yatzy"],
    },
  };
  for (const v of Object.values(VARIANTER)) v.alle = v.over.concat(v.under);
  const KAST_PER_TUR = 3;

  function tell(terninger) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const v of terninger) c[v] += 1;
    return c;
  }

  // The best score `a` dice of one number and `b` dice of another number can give.
  function toSorter(c, a, b) {
    let beste = 0;
    for (let x = 1; x <= 6; x++) {
      if (c[x] < a) continue;
      for (let y = 1; y <= 6; y++) if (y !== x && c[y] >= b) beste = Math.max(beste, a * x + b * y);
    }
    return beste;
  }

  // What box `kat` gives for these dice (Scandinavian rules: pairs must be different numbers,
  // a full house is three of one number and two of another, «Yatzy» is all dice equal).
  function poeng(kat, terninger) {
    const t = terninger || [];
    const c = tell(t);
    const sum = t.reduce((s, v) => s + v, 0);
    const over = OVER.indexOf(kat);
    if (over >= 0) return c[over + 1] * (over + 1);
    const par = [6, 5, 4, 3, 2, 1].filter((v) => c[v] >= 2);
    const like = (n) => {
      for (let v = 6; v >= 1; v--) if (c[v] >= n) return v * n;
      return 0;
    };
    const har = (...tall) => tall.every((v) => c[v] >= 1);
    switch (kat) {
      case "par1":
        return par.length >= 1 ? par[0] * 2 : 0;
      case "par2":
        return par.length >= 2 ? (par[0] + par[1]) * 2 : 0;
      case "par3":
        return par.length >= 3 ? (par[0] + par[1] + par[2]) * 2 : 0;
      case "like3":
        return like(3);
      case "like4":
        return like(4);
      case "like5":
        return like(5);
      case "liten":
        return har(1, 2, 3, 4, 5) ? 15 : 0;
      case "stor":
        return har(2, 3, 4, 5, 6) ? 20 : 0;
      case "full":
        return har(1, 2, 3, 4, 5, 6) ? 21 : 0;
      case "hus":
        return toSorter(c, 3, 2);
      case "villa":
        return toSorter(c, 3, 3);
      case "taarn":
        return toSorter(c, 4, 2);
      case "sjanse":
        return sum;
      case "yatzy":
        return t.length >= 5 && c.some((n) => n === t.length) ? (t.length >= 6 ? 100 : 50) : 0;
      default:
        return 0;
    }
  }

  // Sums of one player's pad. kort = { enere: 3, … } (only filled boxes).
  function summer(variant, kort) {
    const V = VARIANTER[variant];
    const over = V.over.reduce((s, k) => s + (kort[k] || 0), 0);
    const bonus = over >= V.grense ? V.bonus : 0;
    const under = V.under.reduce((s, k) => s + (kort[k] || 0), 0);
    const overFull = V.over.every((k) => kort[k] != null);
    return { over, bonus, under, total: over + bonus + under, overFull, bonusTapt: overFull && !bonus };
  }

  const fullt = (variant, kort) => VARIANTER[variant].alle.every((k) => kort[k] != null);

  // How many rolls are left this turn (the six-dice variant adds the rolls saved from earlier turns).
  const kastIgjen = (variant, kast, spart) => Math.max(0, KAST_PER_TUR - kast) + (VARIANTER[variant].spar ? spart || 0 : 0);
  // Rolls saved when a box is filled after `kast` rolls (Maxi only).
  const sparesVed = (variant, kast) => (VARIANTER[variant].spar ? Math.max(0, KAST_PER_TUR - kast) : 0);

  // ---------- The phone as a player (pure) ----------
  // Lett keeps the most common number and grabs the biggest score (now and then a box it should
  // have saved). Middels values a box by its score minus what that box is usually worth, with an
  // eye on the bonus, and holds the dice that give the best expected value after the next roll.
  // Vanskelig does the same with a better value and looks two rolls ahead (exact expectimax over
  // the dice multisets; with six dice one roll ahead), memoised so a decision takes a few ms.

  const NIVAER = ["lett", "middels", "vanskelig"];
  // What a box is typically worth when it is filled in a good game (its "cost" when used).
  const VERDI = {
    vanlig: { par1: 9, par2: 15, like3: 12, like4: 9, liten: 8, stor: 9, hus: 14, sjanse: 22, yatzy: 14 },
    maxi: { par1: 10, par2: 17, par3: 17, like3: 13, like4: 10, like5: 6, liten: 9, stor: 10, full: 8, hus: 15, villa: 10, taarn: 10, sjanse: 25, yatzy: 12 },
  };
  const sortert = (t) => t.slice().sort((a, b) => a - b);

  // How good it is to put these dice in box kat now (higher is better).
  function feltVerdi(variant, kat, terninger, kort, nivaa) {
    const V = VARIANTER[variant];
    const p = poeng(kat, terninger);
    const over = OVER.indexOf(kat);
    if (over >= 0) {
      const flate = over + 1;
      const maal = V.terninger === 6 ? 4 : 3;
      const s = summer(variant, kort);
      const apen = !s.bonus && !s.bonusTapt;
      // Above or below "par" for the bonus; the bonus matters less when it is out of reach.
      const avvik = p - maal * flate;
      const vekt = !apen ? 0 : nivaa === "vanskelig" ? 0.9 : 0.6;
      return p + vekt * avvik - (nivaa === "vanskelig" ? 0.6 * flate * (maal - 1) : 0.4 * flate * maal);
    }
    const vanlig = VERDI[variant][kat] || 0;
    return p - (nivaa === "vanskelig" ? 0.9 : 0.7) * vanlig;
  }

  const apneFelt = (variant, kort) => VARIANTER[variant].alle.filter((k) => kort[k] == null);

  // The box to fill with these dice.
  function velgFelt(variant, terninger, kort, nivaa, tilfeldig) {
    const rng = tilfeldig || Math.random;
    const apne = apneFelt(variant, kort);
    if (!apne.length) return null;
    if (nivaa === "lett") {
      const med = apne.filter((k) => poeng(k, terninger) > 0);
      if (!med.length || rng() < 0.12) return apne[Math.floor(rng() * apne.length)];
      return med.reduce((a, b) => (poeng(b, terninger) > poeng(a, terninger) ? b : a));
    }
    let best = apne[0];
    let bestV = -Infinity;
    for (const k of apne) {
      const v = feltVerdi(variant, k, terninger, kort, nivaa);
      if (v > bestV) {
        bestV = v;
        best = k;
      }
    }
    return best;
  }

  // Every multiset of k dice with its probability, as [counts per face 1–6, p].
  const UTFALL = [];
  (function () {
    const fak = [1, 1, 2, 6, 24, 120, 720];
    for (let k = 0; k <= 6; k++) {
      const liste = [];
      const c = [0, 0, 0, 0, 0, 0, 0];
      (function rek(flate, igjen) {
        if (flate === 6) {
          c[6] = igjen;
          let p = fak[k] / Math.pow(6, k);
          for (let f = 1; f <= 6; f++) p /= fak[c[f]];
          liste.push([c.slice(1), p]);
          return;
        }
        for (let n = 0; n <= igjen; n++) {
          c[flate] = n;
          rek(flate + 1, igjen - n);
        }
      })(1, k);
      UTFALL.push(liste);
    }
  })();

  // All different "keep" choices for these dice: [kept dice sorted, how many to reroll].
  function holdValg(terninger) {
    const c = tell(terninger);
    const ut = [];
    (function rek(flate, holdt) {
      if (flate === 7) {
        ut.push(holdt.slice());
        return;
      }
      for (let n = 0; n <= c[flate]; n++) {
        for (let j = 0; j < n; j++) holdt.push(flate);
        rek(flate + 1, holdt);
        for (let j = 0; j < n; j++) holdt.pop();
      }
    })(1, []);
    return ut;
  }

  // The keep that gives the best expected value with `kast` rolls left (Middels/Vanskelig).
  function besteHold(variant, terninger, kort, nivaa, kast) {
    const n = terninger.length;
    const apne = apneFelt(variant, kort);
    const memo = new Map();
    const v0 = (t) => {
      const nokkel = "0:" + t.join("");
      if (memo.has(nokkel)) return memo.get(nokkel);
      let best = -Infinity;
      for (const k of apne) best = Math.max(best, feltVerdi(variant, k, t, kort, nivaa));
      memo.set(nokkel, best);
      return best;
    };
    // Value of standing on sorted dice t with r rolls left.
    const verdi = (t, r) => {
      if (r <= 0) return v0(t);
      const nokkel = r + ":" + t.join("");
      if (memo.has(nokkel)) return memo.get(nokkel);
      let best = v0(t);
      for (const holdt of holdValg(t)) best = Math.max(best, forventet(holdt, r));
      memo.set(nokkel, best);
      return best;
    };
    const forventet = (holdt, r) => {
      const k = n - holdt.length;
      if (!k) return -Infinity; // keeping everything is "stop", covered by v0
      const nokkel = "h" + r + ":" + holdt.join(""); // many dice share the same keep: compute once
      if (memo.has(nokkel)) return memo.get(nokkel);
      let sum = 0;
      for (const [cnt, p] of UTFALL[k]) {
        const t = holdt.slice();
        for (let f = 0; f < 6; f++) for (let j = 0; j < cnt[f]; j++) t.push(f + 1);
        sum += p * verdi(sortert(t), r - 1);
      }
      memo.set(nokkel, sum);
      return sum;
    };
    const dybde = nivaa === "vanskelig" ? Math.min(kast, n === 6 ? 1 : 2) : 1;
    const t0 = sortert(terninger);
    let best = null;
    let bestV = v0(t0) + (nivaa === "vanskelig" ? 0.01 : 0.5); // stopping early needs a reason
    let kandidater = holdValg(t0);
    for (const holdt of kandidater) {
      const v = forventet(holdt, dybde);
      if (v > bestV) {
        bestV = v;
        best = holdt;
      }
    }
    return best; // null = score now
  }

  // The phone's decision after a roll: { hold: [true/false per die] } or { felt: kat }.
  function robotValg(variant, terninger, kort, kastIgjenNa, nivaa, tilfeldig) {
    const rng = tilfeldig || Math.random;
    const felt = () => ({ felt: velgFelt(variant, terninger, kort, nivaa, rng) });
    if (kastIgjenNa <= 0) return felt();
    let holdtVerdier;
    if (nivaa === "lett") {
      const c = tell(terninger);
      if (["yatzy", "stor", "liten", "full", "hus"].some((k) => VARIANTER[variant].alle.includes(k) && kort[k] == null && poeng(k, terninger) > 0)) return felt();
      let flate = 6;
      for (let f = 6; f >= 1; f--) if (c[f] > c[flate]) flate = f;
      if (rng() < 0.15) flate = 1 + Math.floor(rng() * 6);
      holdtVerdier = Array(c[flate]).fill(flate);
    } else {
      holdtVerdier = besteHold(variant, terninger, kort, nivaa, Math.min(kastIgjenNa, KAST_PER_TUR));
      if (!holdtVerdier) return felt();
    }
    // Turn the kept values into flags on the dice as they lie.
    const igjenAa = holdtVerdier.slice();
    const hold = terninger.map((v) => {
      const j = igjenAa.indexOf(v);
      if (j < 0) return false;
      igjenAa.splice(j, 1);
      return true;
    });
    if (hold.every(Boolean)) return felt();
    return { hold };
  }

  const Regler = { OVER, KAT, VARIANTER, KAST_PER_TUR, NIVAER, tell, poeng, summer, fullt, kastIgjen, sparesVed, velgFelt, robotValg, besteHold };
  window.RusjTerninga = Regler;

  const R = window.Rusj;
  if (!R || typeof R.start !== "function") return; // loaded by the unit tests

  // ---------- The game ----------

  const esc = R.esc;
  const pagar = (S) => !!(S.spill && !S.spill.ferdig);
  const VAR = (sp) => VARIANTER[sp.variant];
  const tilfeldig = () => R.nyttFro() / 4294967296;
  const nyTerning = () => 1 + Math.floor(tilfeldig() * 6);
  const nyVri = () => Math.round(Math.random() * 36 - 18); // only looks: how twisted a die lands
  const katNavn = (k, sp) => (k === "yatzy" && sp && sp.variant === "maxi" ? "Yatzy (seks like)" : KAT[k].navn);

  // The phone players (as in Brikka). Seats 0…mennesker−1 are people, the rest are the phone.
  const ROBOTER = ["Robo", "Bipp", "Bopp"];
  const NIVANAVN = { lett: "Lett", middels: "Middels", vanskelig: "Vanskelig" };
  const erRobot = (sp, i) => i >= (sp.mennesker == null ? sp.antall : sp.mennesker);
  const navnFor = (sp, i) => (erRobot(sp, i) ? ROBOTER[i - sp.mennesker] || "Robo" : R.navn(i));
  const avatarFor = (sp, i, storrelse) =>
    erRobot(sp, i) ? `<span class="avatar tg-robot ${storrelse || ""}" style="--pf: var(--p${(i % 20) + 1})" aria-hidden="true">🤖</span>` : R.avatar(i, storrelse);
  const folkIndekser = (sp) => Array.from({ length: sp.antall }, (_, i) => i).filter((i) => !erRobot(sp, i));

  let H; // the actions
  let robotTrykk = false; // true while the phone presses its own buttons
  let hoppAnim = false; // «Hopp over animasjonen»: the rest of this phone turn without waiting
  let robotId = null; // the next step of the phone's turn
  let ruller = false; // dice in the air
  let laas = false; // a box was just filled; wait for the next turn to be drawn

  function nyttSpill(S) {
    const variant = VARIANTER[S.oppsett.variant] ? S.oppsett.variant : "vanlig";
    const n = VARIANTER[variant].terninger;
    const folk = R.klamp(Number(S.antall) || 1, 1, 6);
    const roboter = R.klamp(Number(S.oppsett.roboter) || 0, 0, Math.min(3, 6 - folk));
    const antall = folk + roboter;
    S.spill = {
      variant,
      antall,
      mennesker: folk,
      nivaa: NIVAER.includes(S.oppsett.nivaa) ? S.oppsett.nivaa : "middels",
      kort: Array.from({ length: antall }, () => ({})),
      spart: Array.from({ length: antall }, () => 0),
      tur: 0,
      terninger: Array.from({ length: n }, nyTerning),
      vri: Array.from({ length: n }, nyVri),
      holdt: Array.from({ length: n }, () => false),
      kast: 0,
      angre: null,
      ferdig: false,
      yatzyer: 0,
    };
    ruller = false;
    laas = false;
    R.statistikk("start", { variant, spillere: folk, roboter });
  }

  const totalFor = (sp, i) => summer(sp.variant, sp.kort[i]).total;
  const alleFulle = (sp) => sp.kort.every((k) => fullt(sp.variant, k));
  const runde = (sp) => Math.min(VAR(sp).alle.length, 1 + Math.min(...sp.kort.map((k) => Object.keys(k).length)));
  const igjen = (sp) => kastIgjen(sp.variant, sp.kast, sp.spart[sp.tur]);

  // ---------- Dice (CSS cubes) ----------
  // A die is a cube with six faces. The pose puts the wanted face towards the viewer; whole extra
  // turns on the way make it tumble. rotateZ (applied last) is the little twist it lands with, and
  // the first two rotations tilt the whole cube so we see a bit of the top and the side.

  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const SIDE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const VIPP = "rotateX(-21deg) rotateY(12deg)";
  const KUBE = [1, 2, 3, 4, 5, 6].map((n) => `<span class="tg-side s${n}">${PIPS[n].map((p) => `<i class="p${p}"></i>`).join("")}</span>`).join("");
  const pose = (v, z, tx, ty) => `${VIPP} rotateZ(${z}deg) rotateX(${SIDE[v][0] + 360 * (tx || 0)}deg) rotateY(${SIDE[v][1] + 360 * (ty || 0)}deg)`;

  // A flat die face (score pad, rules, setup tiles).
  const PUNKT = {
    1: [[50, 50]],
    2: [[71, 29], [29, 71]],
    3: [[71, 29], [50, 50], [29, 71]],
    4: [[29, 29], [71, 29], [29, 71], [71, 71]],
    5: [[29, 29], [71, 29], [50, 50], [29, 71], [71, 71]],
    6: [[29, 27], [71, 27], [29, 50], [71, 50], [29, 73], [71, 73]],
  };
  const ansikt = (n, klasse) =>
    `<svg class="${klasse || "tg-ansikt"}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect x="7" y="7" width="86" height="86" rx="22" fill="#fffaf2" stroke="#170e2b" stroke-width="8"/>${PUNKT[n]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 13 : 9.5}" fill="${n === 1 ? "#e3364f" : "#170e2b"}"/>`)
      .join("")}</svg>`;

  function terningHtml(sp, i) {
    const v = sp.terninger[i];
    const holdt = !!sp.holdt[i] && sp.kast > 0;
    return `<button class="tg-t${holdt ? " holdt" : ""}" data-h="hold" data-v="${i}" data-stille aria-pressed="${holdt}" aria-label="Terning ${i + 1} viser ${v}${holdt ? ", holdt" : ""}">
      <span class="tg-skygge" aria-hidden="true"></span>
      <span class="tg-hopp" aria-hidden="true"><span class="tg-kube" style="transform: ${pose(v, sp.vri[i] || 0)}">${KUBE}</span></span>
      <span class="tg-holdt-merke" aria-hidden="true">Holdt</span>
    </button>`;
  }

  // Sounds: a rattle in the cup, then a woody clack (and a softer bounce) for every die that lands.
  function rasle() {
    for (let k = 0; k < 7; k++) R.lyd.stoy(k * 0.034 + Math.random() * 0.012, 0.024, 0.08 + Math.random() * 0.07, 2600 + Math.random() * 2800);
  }
  function klakk(t, styrke) {
    R.lyd.stoy(t, 0.04, 0.3 * styrke, 1300 + Math.random() * 700);
    R.lyd.tone(160 + Math.random() * 80, t, 0.07, "triangle", 0.15 * styrke, 105);
  }

  // Throw the dice with these indexes from their old faces to the new ones. Resolves when all landed.
  function animerKast(sp, indekser, fra, fraVri) {
    return new Promise((ferdig) => {
      const knapper = R.$$("#tg-brett .tg-t");
      if (!knapper.length || !indekser.length) return ferdig();
      const rolig = R.rolig() || hoppAnim;
      let lengst = 0;
      let forste = Infinity;
      indekser.forEach((i, n) => {
        const el = knapper[i];
        if (!el) return;
        const kube = el.querySelector(".tg-kube");
        const hopp = el.querySelector(".tg-hopp");
        const skygge = el.querySelector(".tg-skygge");
        const v = sp.terninger[i];
        const z = sp.vri[i] || 0;
        const slutt = pose(v, z);
        if (rolig || !kube.animate) {
          kube.style.transform = slutt;
          return;
        }
        const ms = 860 + n * 80 + Math.random() * 140;
        lengst = Math.max(lengst, ms);
        const tx = (1 + Math.floor(Math.random() * 2)) * (Math.random() < 0.5 ? -1 : 1);
        const ty = (1 + Math.floor(Math.random() * 2)) * (Math.random() < 0.5 ? -1 : 1);
        // From exactly where it rests: a little dip (scooped up), a tumbling flight, a landing and a bounce.
        const rull = kube.animate(
          [
            { transform: pose(fra[i], fraVri[i] || 0), offset: 0 },
            { transform: pose(fra[i], (fraVri[i] || 0) + (tx > 0 ? 25 : -25)), offset: 0.12, easing: "cubic-bezier(.3,.55,.3,1)" },
            { transform: pose(v, z, tx, ty), offset: 1 },
          ],
          { duration: ms, fill: "both" },
        );
        rull.onfinish = () => {
          kube.style.transform = slutt;
          rull.cancel();
        };
        const dx = Math.round((Math.random() * 2 - 1) * 22);
        const hopp1 = hopp.animate(
          [
            { transform: "translate(0, 0) scale(1)", offset: 0, easing: "ease-out" },
            { transform: `translate(${Math.round(dx * 0.3)}px, 12px) scale(.88)`, offset: 0.12, easing: "cubic-bezier(.2,.7,.4,1)" },
            { transform: `translate(${dx}px, -44px) scale(1.1)`, offset: 0.42, easing: "cubic-bezier(.6,0,.9,.5)" },
            { transform: "translate(0, 0) scale(1)", offset: 0.66, easing: "cubic-bezier(.2,.7,.4,1)" },
            { transform: "translate(0, -9px) scale(1.02)", offset: 0.82, easing: "cubic-bezier(.6,0,.9,.5)" },
            { transform: "translate(0, 0) scale(1)", offset: 1 },
          ],
          { duration: ms },
        );
        hopp1.onfinish = () => hopp1.cancel();
        if (skygge) {
          const s = skygge.animate(
            [
              { transform: "scale(1)", opacity: 1, offset: 0 },
              { transform: "scale(1.05)", opacity: 1, offset: 0.12 },
              { transform: "scale(.5)", opacity: 0.2, offset: 0.42 },
              { transform: "scale(1)", opacity: 1, offset: 0.66 },
              { transform: "scale(.85)", opacity: 0.7, offset: 0.82 },
              { transform: "scale(1)", opacity: 1, offset: 1 },
            ],
            { duration: ms },
          );
          s.onfinish = () => s.cancel();
        }
        klakk((ms * 0.66) / 1000, 1);
        klakk((ms * 0.99) / 1000, 0.45);
        forste = Math.min(forste, ms * 0.66);
      });
      if (forste < Infinity) setTimeout(() => R.vibrer([14, 60, 10, 50, 8]), forste);
      setTimeout(ferdig, rolig ? 120 : lengst + 40);
    });
  }

  // ---------- Score pad ----------

  function feltHtml(sp, kat, iOver) {
    const kort = sp.kort[sp.tur];
    const fylt = kort[kat] != null;
    const navn = katNavn(kat, sp);
    const mulig = !fylt && sp.kast > 0 ? poeng(kat, sp.terninger) : null;
    let klasse = "tg-felt";
    let verdi = "";
    let etikett = navn;
    if (fylt) {
      klasse += " fylt" + (kort[kat] === 0 ? " null" : "");
      verdi = kort[kat] === 0 ? "–" : String(kort[kat]);
      etikett += kort[kat] === 0 ? ": strøket" : `: ${kort[kat]} poeng`;
    } else if (mulig != null) {
      klasse += " mulig" + (mulig === 0 ? " null" : "");
      verdi = String(mulig);
      etikett += mulig === 0 ? ": gir 0 – trykk for å stryke" : `: gir ${mulig} poeng`;
    } else {
      klasse += " apen";
      etikett += ": ledig";
    }
    const topp = iOver ? ansikt(OVER.indexOf(kat) + 1, "tg-felt-ikon") : `<span class="tg-felt-navn">${esc(KAT[kat].kort && sp.variant === "maxi" ? KAT[kat].kort : navn)}</span>`;
    return `<button class="${klasse}" data-h="sett" data-v="${kat}" data-stille aria-label="${esc(etikett)}"${fylt ? ' aria-disabled="true"' : ""}>${topp}<span class="tg-verdi">${esc(verdi)}</span></button>`;
  }

  function blokkHtml(sp) {
    const V = VAR(sp);
    const sum = summer(sp.variant, sp.kort[sp.tur]);
    const andel = Math.min(1, sum.over / V.grense);
    const bonusTekst = sum.bonus ? `+${sum.bonus}` : sum.bonusTapt ? "Ingen bonus" : `${sum.over}/${V.grense}`;
    return `<section class="tg-blokk${sp.variant === "maxi" ? " maxi" : ""}" aria-label="Blokka til ${esc(navnFor(sp, sp.tur))}">
      <div class="tg-over">${V.over.map((k) => feltHtml(sp, k, true)).join("")}</div>
      <div class="tg-bonus${sum.bonus ? " fatt" : ""}${sum.bonusTapt ? " tapt" : ""}">
        <span class="tg-bonus-navn">Bonus ${V.bonus}</span>
        <span class="tg-bonus-spor" aria-hidden="true"><i style="width: ${Math.round(andel * 100)}%"></i></span>
        <b>${esc(bonusTekst)}</b>
      </div>
      <div class="tg-under">${V.under.map((k) => feltHtml(sp, k, false)).join("")}</div>
    </section>`;
  }

  // The whole pad for everyone (sheet and end screen).
  function tabellHtml(sp, o = {}) {
    const V = VAR(sp);
    const n = sp.antall;
    const summene = sp.kort.map((k) => summer(sp.variant, k));
    const celle = (i, k) => {
      const v = sp.kort[i][k];
      return `<td class="${i === sp.tur && !o.slutt ? "na" : ""}">${v == null ? "" : v === 0 ? "–" : v}</td>`;
    };
    const rad = (navn, celler, klasse) => `<tr class="${klasse || ""}"><th scope="row">${navn}</th>${celler}</tr>`;
    const alle = (fn) => Array.from({ length: n }, (_, i) => fn(i)).join("");
    const rader = [
      ...V.over.map((k) => rad(`${ansikt(OVER.indexOf(k) + 1, "tg-tabell-ikon")}${esc(katNavn(k, sp))}`, alle((i) => celle(i, k)))),
      rad("Sum", alle((i) => `<td class="${i === sp.tur && !o.slutt ? "na" : ""}">${summene[i].over}</td>`), "sum"),
      rad(`Bonus`, alle((i) => `<td class="${i === sp.tur && !o.slutt ? "na" : ""}">${summene[i].bonus ? summene[i].bonus : summene[i].bonusTapt ? "–" : ""}</td>`), "sum"),
      ...V.under.map((k) => rad(esc(katNavn(k, sp)), alle((i) => celle(i, k)))),
      rad("Totalt", alle((i) => `<td class="${i === sp.tur && !o.slutt ? "na" : ""}">${summene[i].total}</td>`), "total"),
    ];
    return `<div class="tg-tabell-ramme"><table class="tg-tabell${n > 3 ? " mange" : ""}${n === 1 ? " en" : ""}">
      <thead><tr><th scope="col"><span class="vh">Felt</span></th>${alle(
        (i) => `<th scope="col" class="${i === sp.tur && !o.slutt ? "na" : ""}">${avatarFor(sp, i)}<span class="tg-tabell-navn">${esc(navnFor(sp, i))}</span></th>`,
      )}</tr></thead>
      <tbody>${rader.join("")}</tbody>
    </table></div>`;
  }

  // Everyone's total as small chips (the current player first in colour).
  function stillingHtml(sp) {
    if (sp.antall < 2) return "";
    return `<ul class="tg-stilling" aria-label="Stillingen">${sp.kort
      .map(
        (_, i) =>
          `<li class="${i === sp.tur ? "na" : ""}" style="--pf: var(--p${(i % 20) + 1})"><span class="vh">${esc(navnFor(sp, i))}: </span>${avatarFor(sp, i)}<b>${totalFor(sp, i)}</b></li>`,
      )
      .join("")}</ul>`;
  }

  function hintTekst(sp) {
    if (alleFulle(sp)) return "Blokka er full!";
    const rest = igjen(sp);
    const spart = VAR(sp).spar ? sp.spart[sp.tur] || 0 : 0;
    if (sp.kast === 0) {
      if (spart) return `Du har tre kast – og ${R.flertall(spart, "spart kast", "sparte kast")} i tillegg.`;
      return sp.antall > 1 ? "Tre kast. Lykke til!" : "Du har tre kast denne runden.";
    }
    if (erRobot(sp, sp.tur)) return rest > 0 ? `${navnFor(sp, sp.tur)} velger hvilke terninger som skal holdes …` : `${navnFor(sp, sp.tur)} velger et felt …`;
    if (rest > 0) return "Trykk på terningene du vil holde";
    return "Velg et felt på blokka";
  }

  function kastKnapp(sp) {
    if (alleFulle(sp)) return R.ui.knapp("Se kåringen", "kaaring", { variant: "stor", ikon: "🏆" });
    const rest = igjen(sp);
    const spart = VAR(sp).spar ? sp.spart[sp.tur] || 0 : 0;
    const vanlige = Math.max(0, KAST_PER_TUR - sp.kast);
    const prikker = `<span class="tg-prikker" aria-hidden="true">${[0, 1, 2].map((n) => `<i class="${n < vanlige ? "pa" : ""}"></i>`).join("")}${spart ? `<b>+${spart}</b>` : ""}</span>`;
    if (rest <= 0) return R.ui.knapp("Velg et felt", "kast", { variant: "stor", av: true, tekstHtml: `Velg et felt ${prikker}` });
    const tekst = sp.kast === 0 ? "Kast terningene" : "Kast igjen";
    const etikett = `${tekst} – ${R.flertall(rest, "kast", "kast")} igjen${vanlige === 0 ? " (sparte kast)" : ""}`;
    return R.ui.knapp(tekst, "kast", { variant: "stor", id: "tg-kast", etikett, tekstHtml: `<span>${esc(tekst)}</span>${prikker}` });
  }

  function angreLenke(sp) {
    if (!sp.angre) return "";
    const a = sp.angre;
    const hvem = sp.antall > 1 ? ` for ${navnFor(sp, a.tur)}` : "";
    return `<button class="lenke" data-h="angre" id="tg-angre" aria-label="${esc(`Angre ${katNavn(a.kat, sp)}${hvem}`)}">↶ Angre ${esc(katNavn(a.kat, sp))}</button>`;
  }

  // ---------- Celebrations ----------

  function stempel(tekst, klasse) {
    const brett = R.$("#tg-brett");
    if (!brett) return;
    const gml = R.$(".tg-stempel", brett);
    if (gml) gml.remove();
    const lang = tekst.length > 9 ? " lang" : "";
    brett.insertAdjacentHTML("beforeend", `<span class="tg-stempel ${klasse || ""}${lang}" aria-hidden="true"><span class="stempel ${klasse === "liten" ? "mynte" : "aksent"}">${esc(tekst)}</span></span>`);
  }

  function feirKast(sp) {
    const t = sp.terninger;
    const kort = sp.kort[sp.tur];
    if (poeng("yatzy", t)) {
      sp.yatzyer = (sp.yatzyer || 0) + 1;
      stempel(sp.variant === "maxi" ? "Seks like!" : "Yatzy!");
      R.lyd.fanfare();
      R.konfetti();
      R.vibrer([60, 40, 60, 40, 160]);
      R.si(sp.variant === "maxi" ? "Seks like – Yatzy!" : "Yatzy!");
      return;
    }
    const fine = [
      ["full", "Full straight!"],
      ["stor", "Stor straight!"],
      ["liten", "Liten straight!"],
      ["taarn", "Tårn!"],
      ["villa", "Villa!"],
      ["hus", "Hus!"],
    ];
    for (const [k, tekst] of fine) {
      if (VAR(sp).alle.includes(k) && kort[k] == null && poeng(k, t)) {
        stempel(tekst, "liten");
        R.lyd.riktig();
        return;
      }
    }
  }

  // ---------- Records ----------

  // Only a full pad can set a record (ending early never does).
  function lagreRekord(S) {
    const sp = S.spill;
    const komplett = alleFulle(sp);
    const rader = folkIndekser(sp).map((i) => ({ i, poeng: summer(sp.variant, sp.kort[i]).total }));
    const best = rader.reduce((a, b) => (b.poeng > a.poeng ? b : a), rader[0]);
    const gml = (S.rekord || {})[sp.variant] || null;
    sp.resultat = { gml: gml ? gml.poeng : null, ny: komplett && (!gml || best.poeng > gml.poeng), best: best.poeng, komplett };
    if (sp.resultat.ny) {
      S.rekord = Object.assign({}, S.rekord, { [sp.variant]: { poeng: best.poeng, navn: R.navn(best.i).slice(0, 16) } });
    }
    if (rader.length > 1) R.kveld.registrer(rader); // the phone never takes a place in «Kveldens gjeng»
    R.statistikk("ferdig", { variant: sp.variant, spillere: rader.length, roboter: sp.antall - rader.length, poeng: best.poeng, yatzy: sp.yatzyer || 0, komplett });
  }

  // ---------- Rules sheet extra: what every box gives ----------

  const regelListe = (V) =>
    `<h3>Hva feltene gir${V.id === "maxi" ? " med seks terninger" : ""}</h3><ul class="tg-regelliste">
      <li><b>Enere–seksere</b><span>Summen av terningene med det tallet. ${V.grense} eller mer til sammen gir ${V.bonus} i bonus.</span></li>
      ${V.under
        .map((k) => `<li><b>${esc(katNavn(k, { variant: V.id }))}</b><span>${esc(k === "yatzy" ? (V.id === "maxi" ? "Seks like gir 100." : "Fem like gir 50.") : KAT[k].regel)}</span></li>`)
        .join("")}
    </ul>
    ${V.spar ? `<p class="hjelp">Kast du ikke bruker, spares til senere turer.</p>` : ""}`;
  // The rules sheet explains the variant on the screen (the kit reads ekstraHtml when it opens).
  const REGLER = {
    intro: "Kast terningene opptil tre ganger og fyll ut blokka. Flest poeng vinner.",
    steg: [
      ["Kast og hold", "Du har tre kast hver tur. Trykk på terningene du vil beholde, og kast resten på nytt."],
      ["Velg et felt", "Blokka viser hva hvert ledig felt gir. Trykk på ett – du må fylle et felt hver tur, også om det gir 0."],
      ["Flest poeng vinner", "Når blokka er full, er spillet over. 63 poeng eller mer på enere–seksere gir 50 i bonus (med seks terninger: 84 gir 100)."],
    ],
    tips: [
      "I vanlig Yatzy gir tre av hver på enere–seksere akkurat 63 – og bonusen. Med seks terninger trengs fire av hver (84).",
      "To par må være to ulike tall. Hus er tre like og to like av et annet tall.",
      "Trykket på feil felt? «Angre» tar det tilbake, helt til neste kast.",
      "Med seks terninger er det 20 felt – og kast du ikke bruker, sparer du til senere.",
    ],
    ekstraHtml: regelListe(VARIANTER.vanlig),
  };
  const visRegelvariant = (variant) => {
    REGLER.ekstraHtml = regelListe(VARIANTER[variant] || VARIANTER.vanlig);
  };

  // ---------- The phone's turn ----------
  // One step at a time from the saved state (so a reload simply carries on): roll, show which dice it
  // keeps, roll again or fill a box. Never while a sheet is open; «Hopp over animasjonen» skips the waits.

  function motMobilenHtml(S) {
    const folk = R.klamp(Number(S.antall) || 1, 1, 6);
    const maks = Math.min(3, 6 - folk);
    const r = Math.min(S.oppsett.roboter, maks);
    return `<section class="seksjon">
      <div class="seksjon-hode"><h2>Mot mobilen</h2><span class="tall">${r ? R.flertall(folk + r, "spiller", "spillere") + " i alt" : "Av"}</span></div>
      ${R.ui.seg("roboter", [[0, "Ingen"], [1, "1"], [2, "2"], [3, "3"]], r, { etikett: "Hvor mange spillere mobilen er", av: (v) => Number(v) > maks })}
      ${r ? R.ui.seg("nivaa", NIVAER.map((n) => [n, NIVANAVN[n]]), S.oppsett.nivaa, { etikett: "Hvor flink mobilen er" }) : ""}
      <p class="hjelp">${r ? `Mobilen spiller som ${esc(R.ramsOpp(ROBOTER.slice(0, r)))} 🤖 – ${{ lett: "beholder det opplagte og bommer av og til", middels: "spiller fornuftig og passer på bonusen", vanskelig: "regner på hvert kast" }[S.oppsett.nivaa]}.` : "Legg til en motspiller som mobilen styrer."}</p>
    </section>`;
  }

  // The kit's podium and scoreboard draw an animal for every row: the phone gets its robot instead.
  function robotAvatarer(sp, html) {
    for (let i = sp.mennesker; i < sp.antall; i++) {
      html = html.split(R.avatar(i, "stor")).join(avatarFor(sp, i, "stor")).split(R.avatar(i)).join(avatarFor(sp, i));
    }
    return html;
  }

  function stoppRobot() {
    clearTimeout(robotId);
    robotId = null;
  }

  // Press one of the game's own buttons as the phone.
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
    if (!sp || sp.ferdig || S.skjerm !== "spill" || !erRobot(sp, sp.tur) || alleFulle(sp)) return;
    if (ruller || laas) return; // the step that runs now calls driv() when it is done
    if (R.arkApent()) {
      robotId = setTimeout(driv, 400);
      return;
    }
    const pause = (ms) => (R.rolig() || hoppAnim ? 120 : ms);
    if (sp.kast === 0) {
      // Give a person a moment to take back the last box before the phone rolls.
      robotId = setTimeout(() => trykk("kast"), pause(sp.angre ? 1600 : 900));
      return;
    }
    const valg = robotValg(sp.variant, sp.terninger, sp.kort[sp.tur], igjen(sp), sp.nivaa, tilfeldig);
    if (valg.felt) {
      robotId = setTimeout(() => {
        const el = R.$(`#skjerm [data-h="sett"][data-v="${valg.felt}"]`);
        if (el) trykk("sett", el);
      }, pause(900));
      return;
    }
    // Show the dice it keeps one by one, then roll.
    const endringer = valg.hold.map((h, i) => (h !== !!sp.holdt[i] ? i : -1)).filter((i) => i >= 0);
    let n = 0;
    const neste = () => {
      robotId = null;
      if (R.S.skjerm !== "spill" || R.S.spill !== sp) return;
      if (n < endringer.length) {
        const i = endringer[n++];
        const el = R.$(`#skjerm [data-h="hold"][data-v="${i}"]`);
        if (el) {
          robotTrykk = true;
          H.hold(el, null, R.S);
          robotTrykk = false;
        }
        robotId = setTimeout(neste, pause(380));
        return;
      }
      robotId = setTimeout(() => trykk("kast"), pause(650));
    };
    robotId = setTimeout(neste, pause(700));
  }

  // ---------- Start ----------

  R.start({
    id: "terninga",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: Math.max(1, Math.min(6, R.felles.navn.filter((n) => String(n || "").trim()).length || 2)),
      oppsett: { variant: "vanlig", roboter: 0, nivaa: "middels" },
      rekord: {},
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ variant: "vanlig", roboter: 0, nivaa: "middels" }, S.oppsett || {});
      if (!VARIANTER[S.oppsett.variant]) S.oppsett.variant = "vanlig";
      S.oppsett.roboter = R.klamp(Number(S.oppsett.roboter) || 0, 0, 3);
      if (!NIVAER.includes(S.oppsett.nivaa)) S.oppsett.nivaa = "middels";
      if (!S.rekord || typeof S.rekord !== "object") S.rekord = {};
      S.antall = R.klamp(Number(S.antall) || 2, 1, 6);
      const sp = S.spill;
      if (sp) {
        const V = VARIANTER[sp.variant];
        const ok =
          V &&
          Number.isInteger(sp.antall) && sp.antall >= 1 && sp.antall <= 6 &&
          Array.isArray(sp.kort) && sp.kort.length === sp.antall &&
          Array.isArray(sp.terninger) && sp.terninger.length === V.terninger && sp.terninger.every((v) => Number.isInteger(v) && v >= 1 && v <= 6) &&
          Array.isArray(sp.holdt) && sp.holdt.length === V.terninger &&
          Number.isInteger(sp.tur) && sp.tur >= 0 && sp.tur < sp.antall &&
          Number.isInteger(sp.kast) && sp.kast >= 0;
        if (!ok) S.spill = null;
        else {
          if (!Array.isArray(sp.vri) || sp.vri.length !== V.terninger) sp.vri = sp.terninger.map(() => 0);
          if (!Array.isArray(sp.spart) || sp.spart.length !== sp.antall) sp.spart = sp.kort.map(() => 0);
          for (const k of sp.kort) for (const kat of Object.keys(k)) if (!V.alle.includes(kat) || typeof k[kat] !== "number") delete k[kat];
          if (sp.angre && !(V.alle.includes(sp.angre.kat) && sp.angre.tur < sp.antall)) sp.angre = null;
          if (!(Number.isInteger(sp.mennesker) && sp.mennesker >= 1 && sp.mennesker <= sp.antall)) sp.mennesker = sp.antall;
          if (!NIVAER.includes(sp.nivaa)) sp.nivaa = "middels";
        }
      }
      if (S.skjerm === "spill" && !S.spill) S.skjerm = "hjem";
      if (S.skjerm === "slutt" && !(S.spill && S.spill.ferdig)) S.skjerm = S.spill ? "spill" : "hjem";
    },

    regler: REGLER,

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis(S) {
          const sp = S.spill;
          visRegelvariant(pagar(S) ? sp.variant : S.oppsett.variant);
          const rek = ["vanlig", "maxi"].filter((v) => S.rekord[v]);
          return (
            R.ui.spillhjem({
              slagordHtml: "Fem terninger. Tre kast.<br><em>Jakten på Yatzy!</em>",
              knapperHtml: R.ui.startKnapper({
                pagar: pagar(S),
                fortsettTekst: pagar(S) ? (alleFulle(sp) ? "Fortsett · se kåringen" : `Fortsett · runde ${runde(sp)} av ${VAR(sp).alle.length}`) : "",
                ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
              }),
              merker: [],
            }) +
            (rek.length
              ? `<section class="tg-rekorder" aria-label="Rekorder på denne mobilen"><p class="etikett">Rekorder på denne mobilen</p><ul>${rek
                  .map((v) => `<li><span aria-hidden="true">🏆</span> <b>${esc(VARIANTER[v].navn)}:</b> ${S.rekord[v].poeng} poeng · ${esc(S.rekord[v].navn)}</li>`)
                  .join("")}</ul></section>`
              : "") +
            R.ui.merker([
              ["1–6", "spillere"],
              ["15", "felt"],
              ["0", "reklame"],
            ])
          );
        },
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        etter: (S) => visRegelvariant(S.oppsett.variant),
        vis: (S) => `
          <h1 id="skjerm-tittel">Gjør klart</h1>
          <section class="seksjon">
            <h2>Hvilken Yatzy?</h2>
            ${R.ui.fliser(
              "variant",
              [
                { v: "vanlig", tittel: "Yatzy", tekst: "5 terninger · 15 felt", ikon: `<span class="tg-flis-terninger">${ansikt(5)}${ansikt(3)}</span>` },
                { v: "maxi", tittel: "Seks terninger", tekst: "20 felt · spar kast du ikke bruker", ikon: `<span class="tg-flis-terninger">${ansikt(6)}${ansikt(6)}${ansikt(6)}</span>` },
              ],
              S.oppsett.variant,
            )}
          </section>
          ${R.ui.spillere({
            min: 1,
            max: 6,
            tittel: "Hvem spiller?",
            hjelp: (S.antall || 1) > 1 ? "Send mobilen videre etter hver tur." : "Alene? Jakt på din egen rekord – eller spill mot mobilen.",
          })}
          ${motMobilenHtml(S)}
          ${R.ui.dokk(R.ui.knapp("Start", "start", { variant: "stor", ikon: "🎲" }))}`,
      },

      spill: {
        tittel: (S) => (alleFulle(S.spill) ? "Blokka er full" : `Runde ${runde(S.spill)} av ${VAR(S.spill).alle.length}`),
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          visRegelvariant(sp.variant);
          const total = totalFor(sp, sp.tur);
          const ferdig = alleFulle(sp);
          return `
            <div class="tg-hode">
              ${avatarFor(sp, sp.tur, "mid")}
              <div class="tg-hvem">
                <p class="etikett">${ferdig ? "Spillet er ferdig" : erRobot(sp, sp.tur) ? `Mobilen · ${NIVANAVN[sp.nivaa]}` : sp.antall > 1 ? "Din tur" : "Ditt kast"}</p>
                <h1 id="skjerm-tittel">${esc(navnFor(sp, sp.tur))}</h1>
              </div>
              <p class="tg-total"><b>${total}</b><small>poeng</small></p>
            </div>
            ${stillingHtml(sp)}
            <div class="tg-brett${sp.kast === 0 ? " klar" : ""}${ferdig ? " ferdig" : ""}" id="tg-brett" style="--n: ${sp.terninger.length}">
              <div class="tg-terninger" role="group" aria-label="Terningene">${sp.terninger.map((_, i) => terningHtml(sp, i)).join("")}</div>
              <p class="tg-hint" id="tg-hint" aria-live="polite">${esc(hintTekst(sp))}</p>
            </div>
            ${blokkHtml(sp)}
            ${
              !ferdig && erRobot(sp, sp.tur)
                ? R.ui.dokk(
                    R.ui.knapp(`${navnFor(sp, sp.tur)} spiller …`, "kast", { variant: "stor", av: true, ikon: "🤖" }),
                    R.ui.lenkerad(angreLenke(sp), hoppAnim ? "" : R.ui.lenke("Hopp over animasjonen", "hopp-anim"), R.ui.lenke("Blokka", "blokka"), R.ui.lenke("Avslutt", "avslutt")),
                  )
                : R.ui.dokk(kastKnapp(sp), R.ui.lenkerad(angreLenke(sp), R.ui.lenke("Blokka", "blokka"), ferdig ? "" : R.ui.lenke("Avslutt", "avslutt")))
            }`;
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          ruller = false;
          laas = false;
          R.holdVaken();
          R.vedForlat(stoppRobot);
          driv();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = sp.kort.map((k, i) => ({ i, poeng: summer(sp.variant, k).total, ...(erRobot(sp, i) ? { navn: navnFor(sp, i) } : {}) }));
          const best = Math.max(...rader.map((r) => r.poeng));
          const vinnere = rader.filter((r) => r.poeng === best);
          const res = sp.resultat || {};
          const dokk = R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "endre"), '<a class="lenke" href="/">Alle spill</a>'));
          const blokk = `<section class="seksjon"><h2>Blokka</h2>${tabellHtml(sp, { slutt: true })}</section>`;
          if (sp.antall === 1) {
            const tittel = res.ny && res.gml != null ? "Ny rekord!" : best >= 250 ? "Råsterkt!" : best >= 200 ? "Godt jobba!" : "Godt kjempa!";
            const under = !res.komplett
              ? "Blokka ble ikke full denne gangen. Fyll den helt for å sette rekord!"
              : res.ny && res.gml != null
                ? `Forrige rekord var ${res.gml} poeng.`
                : res.gml == null
                  ? "Første runde på denne mobilen – nå har du en rekord å slå!"
                  : `Rekorden din er ${res.gml} poeng.`;
            return `
              <div class="banner aksent">
                ${R.figur()}
                <h1 id="skjerm-tittel">${esc(tittel)}</h1>
                <p class="tg-sluttpoeng"><b>${best}</b> poeng</p>
                <p class="ingress">${esc(under)}</p>
              </div>
              ${blokk}
              ${R.ui.flereSpill({ antall: 1 })}
              ${dokk}`;
          }
          return `
            <div class="banner aksent">
              ${vinnere.length === 1 ? `<span class="tg-vinner">${avatarFor(sp, vinnere[0].i, "gigant")}<span class="tg-krone" aria-hidden="true">👑</span></span>` : R.figur()}
              <h1 id="skjerm-tittel">${esc(R.ramsOpp(vinnere.map((r) => navnFor(sp, r.i))))} vinner!</h1>
              <p class="ingress">${vinnere.length > 1 ? `Likt med ${best} poeng hver.` : `${best} poeng${erRobot(sp, vinnere[0].i) ? " – mobilen vant denne gangen. Revansj?" : res.ny && res.gml != null ? " – ny rekord på denne mobilen!" : ""}`}</p>
            </div>
            ${robotAvatarer(sp, R.ui.pall(rader) + R.ui.poengliste(rader))}
            ${blokk}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const best = Math.max(...sp.kort.map((k) => summer(sp.variant, k).total));
          const res = sp.resultat || {};
          const folkBest = Math.max(...folkIndekser(sp).map((i) => totalFor(sp, i)));
          const mobilenVant = folkBest < best; // the phone won: warm words, no fanfare
          if (!mobilenVant && (sp.antall > 1 || (res.ny && res.gml != null) || best >= 200)) {
            R.lyd.fanfare();
            R.vibrer([40, 60, 120]);
            R.konfetti();
          } else {
            R.lyd.riktig();
            setTimeout(() => R.lyd.pling(), 260);
          }
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
      variant(el, e, S) {
        S.oppsett.variant = VARIANTER[el.dataset.v] ? el.dataset.v : "vanlig";
        R.vis();
      },
      start(el, e, S) {
        nyttSpill(S);
        R.gaTil("spill");
      },
      igjen(el, e, S) {
        S.oppsett.variant = S.spill ? S.spill.variant : S.oppsett.variant;
        S.antall = S.spill ? S.spill.antall : S.antall;
        nyttSpill(S);
        R.gaTil("spill");
      },

      roboter(el, e, S) {
        S.oppsett.roboter = R.klamp(Number(el.dataset.v) || 0, 0, 3);
        R.vis();
      },
      nivaa(el, e, S) {
        S.oppsett.nivaa = NIVAER.includes(el.dataset.v) ? el.dataset.v : "middels";
        R.vis();
      },
      "hopp-anim"(el, e, S) {
        if (!S.spill || !erRobot(S.spill, S.spill.tur)) return;
        hoppAnim = true;
        const lenke = el.closest(".lenkerad") ? el : null;
        if (lenke) lenke.remove();
        driv(); // the next step at once
      },

      hold(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || laas) return;
        if (erRobot(sp, sp.tur) && !robotTrykk) return;
        const i = Number(el.dataset.v);
        if (!(i >= 0 && i < sp.terninger.length)) return;
        if (sp.kast === 0) {
          R.toast("Kast terningene først");
          return;
        }
        if (igjen(sp) <= 0) {
          R.toast("Ingen kast igjen – velg et felt");
          return;
        }
        sp.holdt[i] = !sp.holdt[i];
        if (sp.holdt[i]) R.lyd.pop();
        else R.lyd.tone(420, 0, 0.08, "sine", 0.16, 300);
        R.vibrer(8);
        // Changed in place (no redraw), so quick taps on several dice and then «Kast» all count.
        const v = sp.terninger[i];
        el.classList.toggle("holdt", sp.holdt[i]);
        el.setAttribute("aria-pressed", String(sp.holdt[i]));
        el.setAttribute("aria-label", `Terning ${i + 1} viser ${v}${sp.holdt[i] ? ", holdt" : ""}`);
        const hint = R.$("#tg-hint");
        if (hint) hint.textContent = sp.holdt.every(Boolean) ? "Alle er holdt – velg et felt, eller slipp en terning" : hintTekst(sp);
        R.lagre();
      },

      async kast(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || laas || alleFulle(sp)) return;
        if (erRobot(sp, sp.tur) && !robotTrykk) return;
        if (igjen(sp) <= 0) return;
        const fra = sp.terninger.slice();
        const fraVri = sp.vri.slice();
        if (sp.kast === 0) sp.holdt = sp.holdt.map(() => false);
        const indekser = [];
        sp.terninger.forEach((v, i) => {
          if (sp.holdt[i]) return;
          indekser.push(i);
          sp.terninger[i] = nyTerning();
          sp.vri[i] = nyVri();
        });
        if (!indekser.length) {
          R.toast("Alle terningene er holdt – slipp én, eller velg et felt");
          return;
        }
        // A saved roll is used once the three rolls of the turn are gone (six-dice variant).
        if (sp.kast >= KAST_PER_TUR) sp.spart[sp.tur] = Math.max(0, (sp.spart[sp.tur] || 0) - 1);
        sp.kast += 1;
        sp.angre = null; // undo is possible until the next roll
        R.lagre(); // the result is saved before the dice land: a reload shows where they ended up
        ruller = true;
        const brett = R.$("#tg-brett");
        if (brett) {
          brett.classList.remove("klar");
          brett.dataset.ruller = "1"; // gone with the next redraw, when the dice have landed
        }
        R.$$('#skjerm .dokk button, #skjerm [data-h="sett"]').forEach((b) => (b.disabled = true));
        const hint = R.$("#tg-hint");
        if (hint) hint.textContent = "Terningene ruller …";
        const angre = R.$("#tg-angre");
        if (angre) angre.remove();
        rasle();
        R.vibrer(10);
        const fortsatt = R.vakt();
        await animerKast(sp, indekser, fra, fraVri);
        ruller = false;
        if (!fortsatt()) return;
        R.vis();
        R.si(`${erRobot(sp, sp.tur) ? navnFor(sp, sp.tur) + " kastet" : "Du kastet"} ${R.ramsOpp(sp.terninger.map(String))}.`);
        if (!hoppAnim) feirKast(sp);
        R.lagre();
        driv();
      },

      async sett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || laas) return;
        const kat = el.dataset.v;
        const V = VAR(sp);
        const kort = sp.kort[sp.tur];
        if (!V.alle.includes(kat) || kort[kat] != null) return;
        const robot = erRobot(sp, sp.tur);
        if (robot && !robotTrykk) return;
        if (sp.kast === 0) {
          R.toast("Kast terningene først");
          el.classList.remove("risting");
          void el.offsetWidth;
          el.classList.add("risting");
          return;
        }
        const verdi = poeng(kat, sp.terninger);
        const forBonus = summer(sp.variant, kort).bonus;
        sp.angre = {
          tur: sp.tur,
          kat,
          terninger: sp.terninger.slice(),
          vri: sp.vri.slice(),
          holdt: sp.holdt.slice(),
          kast: sp.kast,
          spart: sp.spart[sp.tur] || 0,
        };
        kort[kat] = verdi;
        sp.spart[sp.tur] = (sp.spart[sp.tur] || 0) + sparesVed(sp.variant, sp.kast);
        const fikkBonus = !forBonus && summer(sp.variant, kort).bonus;
        const navn = katNavn(kat, sp);

        // The box gets its number at once; the next turn is drawn a moment later.
        el.className = "tg-felt fylt ny" + (verdi === 0 ? " null" : "");
        const vEl = el.querySelector(".tg-verdi");
        if (vEl) vEl.textContent = verdi === 0 ? "–" : String(verdi);
        R.$$('#skjerm .dokk button, #skjerm [data-h="sett"], #skjerm [data-h="hold"]').forEach((b) => (b.disabled = true));
        const hvem = navnFor(sp, sp.tur);
        let melding;
        if (fikkBonus) {
          R.lyd.fanfare();
          melding = `Bonus! +${V.bonus} til ${hvem}`;
          R.vibrer([30, 40, 90]);
        } else if (verdi > 0) {
          R.lyd.riktig();
          melding = sp.antall > 1 ? `+${verdi} på ${navn} til ${hvem}` : `+${verdi} på ${navn}`;
          R.vibrer(20);
        } else {
          R.lyd.tone(330, 0, 0.12, "triangle", 0.09, 220);
          melding = `${navn} er strøket`;
          R.vibrer(10);
        }
        R.si(verdi > 0 ? `${verdi} poeng på ${navn}.` : `${navn} er strøket.`);

        if (robot) sp.angre = null; // only a person's own box can be taken back
        // Next turn (saved now, so a reload lands on the right player).
        if (!alleFulle(sp)) {
          sp.tur = (sp.tur + 1) % sp.antall;
          sp.kast = 0;
          sp.holdt = sp.holdt.map(() => false);
        }
        R.lagre();
        laas = true;
        const fortsatt = R.vakt();
        await R.vent(R.rolig() || hoppAnim ? 250 : 750);
        laas = false;
        if (!fortsatt()) return;
        if (!erRobot(sp, sp.tur)) hoppAnim = false; // a person's turn: the phone shows its moves again next time
        R.vis();
        R.toast(melding); // after the redraw, so it sits above the new action area
        if (alleFulle(sp)) {
          R.si("Blokka er full. Trykk på «Se kåringen».");
          R.lyd.pling();
        } else if (sp.antall > 1) {
          const hode = R.$(".tg-hode");
          if (hode) hode.classList.add("ny");
          R.lyd.pop();
          R.si(`${navnFor(sp, sp.tur)} sin tur.`);
        }
        driv();
      },

      // Take back the last box: the same player gets the same dice and rolls back.
      angre(el, e, S) {
        const sp = S.spill;
        const a = sp && sp.angre;
        if (!a || ruller || laas || sp.ferdig) return;
        delete sp.kort[a.tur][a.kat];
        sp.tur = a.tur;
        sp.terninger = a.terninger;
        sp.vri = a.vri;
        sp.holdt = a.holdt;
        sp.kast = a.kast;
        sp.spart[a.tur] = a.spart;
        sp.angre = null;
        stoppRobot();
        R.lyd.snu();
        R.toast(`Angret – ${katNavn(a.kat, sp)} er ledig igjen`);
        R.vis();
        R.si(`Angret. ${navnFor(sp, sp.tur)} velger på nytt.`);
      },

      blokka(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.ark(`
          <h2 id="ark-tittel">Blokka</h2>
          ${tabellHtml(sp)}
          ${VAR(sp).spar && sp.spart.some((n) => n) ? `<p class="hjelp">Sparte kast: ${sp.spart.map((n, i) => `${esc(navnFor(sp, i))} ${n}`).join(" · ")}</p>` : ""}
          <button class="knapp" data-h="lukk-ark">Spill videre</button>`);
      },

      kaaring(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || !alleFulle(sp) || laas) return;
        lagreRekord(S);
        sp.ferdig = true;
        sp.angre = null;
        R.gaTil("slutt");
      },

      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || laas) return;
        const fortsatt = R.vakt();
        const tom = sp.kort.every((k) => !Object.keys(k).length);
        if (tom) {
          if (!(await R.bekreft("Avslutte spillet?", sp.antall > 1 ? "Ingen har fått poeng ennå. Dere kan alltid starte et nytt." : "Du har ikke fått poeng ennå. Du kan alltid starte et nytt.", "Avslutt", "Spill videre")) || !fortsatt()) return;
          S.spill = null;
          R.gaTil("hjem");
          return;
        }
        if (!(await R.bekreft("Avslutte spillet?", "Dere går rett til kåringen med poengene så langt.", "Avslutt", "Spill videre")) || !fortsatt() || !pagar(S)) return;
        lagreRekord(S);
        sp.ferdig = true;
        sp.angre = null;
        R.gaTil("slutt");
      },
    }),
  });
})();
