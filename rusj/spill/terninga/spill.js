/* Terninga — Yatzy with Scandinavian rules, plus Maxi-Yatzy.
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
      navn: "Maxi-Yatzy",
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

  // How many rolls are left this turn (Maxi-Yatzy adds the rolls saved from earlier turns).
  const kastIgjen = (variant, kast, spart) => Math.max(0, KAST_PER_TUR - kast) + (VARIANTER[variant].spar ? spart || 0 : 0);
  // Rolls saved when a box is filled after `kast` rolls (Maxi only).
  const sparesVed = (variant, kast) => (VARIANTER[variant].spar ? Math.max(0, KAST_PER_TUR - kast) : 0);

  const Regler = { OVER, KAT, VARIANTER, KAST_PER_TUR, tell, poeng, summer, fullt, kastIgjen, sparesVed };
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
  const katNavn = (k, sp) => (k === "yatzy" && sp && sp.variant === "maxi" ? "Maxi-Yatzy" : KAT[k].navn);

  let H; // the actions
  let ruller = false; // dice in the air
  let laas = false; // a box was just filled; wait for the next turn to be drawn

  function nyttSpill(S) {
    const variant = VARIANTER[S.oppsett.variant] ? S.oppsett.variant : "vanlig";
    const n = VARIANTER[variant].terninger;
    const antall = R.klamp(Number(S.antall) || 1, 1, 6);
    S.spill = {
      variant,
      antall,
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
    R.statistikk("start", { variant, spillere: antall });
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
      const rolig = R.rolig();
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
    return `<section class="tg-blokk${sp.variant === "maxi" ? " maxi" : ""}" aria-label="Blokka til ${esc(R.navn(sp.tur))}">
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
        (i) => `<th scope="col" class="${i === sp.tur && !o.slutt ? "na" : ""}">${R.avatar(i)}<span class="tg-tabell-navn">${esc(R.navn(i))}</span></th>`,
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
          `<li class="${i === sp.tur ? "na" : ""}" style="--pf: var(--p${(i % 20) + 1})"><span class="vh">${esc(R.navn(i))}: </span>${R.avatar(i)}<b>${totalFor(sp, i)}</b></li>`,
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
    const hvem = sp.antall > 1 ? ` for ${R.navn(a.tur)}` : "";
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
      stempel(sp.variant === "maxi" ? "Maxi-Yatzy!" : "Yatzy!");
      R.lyd.fanfare();
      R.konfetti();
      R.vibrer([60, 40, 60, 40, 160]);
      R.si(sp.variant === "maxi" ? "Maxi-Yatzy!" : "Yatzy!");
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
    const rader = sp.kort.map((k, i) => ({ i, poeng: summer(sp.variant, k).total }));
    const best = rader.reduce((a, b) => (b.poeng > a.poeng ? b : a), rader[0]);
    const gml = (S.rekord || {})[sp.variant] || null;
    sp.resultat = { gml: gml ? gml.poeng : null, ny: komplett && (!gml || best.poeng > gml.poeng), best: best.poeng, komplett };
    if (sp.resultat.ny) {
      S.rekord = Object.assign({}, S.rekord, { [sp.variant]: { poeng: best.poeng, navn: R.navn(best.i).slice(0, 16) } });
    }
    if (sp.antall > 1) R.kveld.registrer(rader);
    R.statistikk("ferdig", { variant: sp.variant, spillere: sp.antall, poeng: best.poeng, yatzy: sp.yatzyer || 0, komplett });
  }

  // ---------- Rules sheet extra: what every box gives ----------

  const regelListe = (V) =>
    `<h3>Hva feltene gir${V.id === "maxi" ? " i Maxi-Yatzy" : ""}</h3><ul class="tg-regelliste">
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
      ["Flest poeng vinner", "Når blokka er full, er spillet over. 63 poeng eller mer på enere–seksere gir 50 i bonus (i Maxi-Yatzy: 84 gir 100)."],
    ],
    tips: [
      "I vanlig Yatzy gir tre av hver på enere–seksere akkurat 63 – og bonusen. I Maxi-Yatzy trengs fire av hver (84).",
      "To par må være to ulike tall. Hus er tre like og to like av et annet tall.",
      "Trykket på feil felt? «Angre» tar det tilbake, helt til neste kast.",
      "Maxi-Yatzy har seks terninger og 20 felt – og kast du ikke bruker, sparer du til senere.",
    ],
    ekstraHtml: regelListe(VARIANTER.vanlig),
  };
  const visRegelvariant = (variant) => {
    REGLER.ekstraHtml = regelListe(VARIANTER[variant] || VARIANTER.vanlig);
  };

  // ---------- Start ----------

  R.start({
    id: "terninga",
    versjon: 1,
    pagar,

    tilstand: () => ({
      antall: Math.max(1, Math.min(6, R.felles.navn.filter((n) => String(n || "").trim()).length || 2)),
      oppsett: { variant: "vanlig" },
      rekord: {},
      spill: null,
    }),

    lastet(S) {
      S.oppsett = Object.assign({ variant: "vanlig" }, S.oppsett || {});
      if (!VARIANTER[S.oppsett.variant]) S.oppsett.variant = "vanlig";
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
                { v: "maxi", tittel: "Maxi-Yatzy", tekst: "6 terninger · 20 felt · spar kast", ikon: `<span class="tg-flis-terninger">${ansikt(6)}${ansikt(6)}${ansikt(6)}</span>` },
              ],
              S.oppsett.variant,
            )}
          </section>
          ${R.ui.spillere({
            min: 1,
            max: 6,
            tittel: "Hvem spiller?",
            hjelp: (S.antall || 1) > 1 ? "Send mobilen videre etter hver tur." : "Alene? Jakt på din egen rekord – eller legg til flere.",
          })}
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
              ${R.avatar(sp.tur, "mid")}
              <div class="tg-hvem">
                <p class="etikett">${ferdig ? "Spillet er ferdig" : sp.antall > 1 ? "Din tur" : "Ditt kast"}</p>
                <h1 id="skjerm-tittel">${esc(R.navn(sp.tur))}</h1>
              </div>
              <p class="tg-total"><b>${total}</b><small>poeng</small></p>
            </div>
            ${stillingHtml(sp)}
            <div class="tg-brett${sp.kast === 0 ? " klar" : ""}${ferdig ? " ferdig" : ""}" id="tg-brett" style="--n: ${sp.terninger.length}">
              <div class="tg-terninger" role="group" aria-label="Terningene">${sp.terninger.map((_, i) => terningHtml(sp, i)).join("")}</div>
              <p class="tg-hint" id="tg-hint" aria-live="polite">${esc(hintTekst(sp))}</p>
            </div>
            ${blokkHtml(sp)}
            ${R.ui.dokk(kastKnapp(sp), R.ui.lenkerad(angreLenke(sp), R.ui.lenke("Blokka", "blokka"), ferdig ? "" : R.ui.lenke("Avslutt", "avslutt")))}`;
        },
        inn(S) {
          if (!S.spill) return R.gaTil("hjem");
          ruller = false;
          laas = false;
          R.holdVaken();
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        gjenoppta: "hjem",
        vis(S) {
          const sp = S.spill;
          const rader = sp.kort.map((k, i) => ({ i, poeng: summer(sp.variant, k).total }));
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
              ${vinnere.length === 1 ? `<span class="tg-vinner">${R.avatar(vinnere[0].i, "gigant")}<span class="tg-krone" aria-hidden="true">👑</span></span>` : R.figur()}
              <h1 id="skjerm-tittel">${esc(R.ramsOpp(vinnere.map((r) => R.navn(r.i))))} vinner!</h1>
              <p class="ingress">${vinnere.length > 1 ? `Likt med ${best} poeng hver.` : `${best} poeng${res.ny && res.gml != null ? " – ny rekord på denne mobilen!" : ""}`}</p>
            </div>
            ${R.ui.pall(rader)}
            ${R.ui.poengliste(rader)}
            ${blokk}
            ${R.ui.flereSpill({ antall: sp.antall })}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          if (!sp) return;
          const best = Math.max(...sp.kort.map((k) => summer(sp.variant, k).total));
          const res = sp.resultat || {};
          if (sp.antall > 1 || (res.ny && res.gml != null) || best >= 200) {
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

      hold(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || laas) return;
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
        // A saved roll is used once the three rolls of the turn are gone (Maxi-Yatzy).
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
        R.si(`Du kastet ${R.ramsOpp(sp.terninger.map(String))}.`);
        feirKast(sp);
        R.lagre();
      },

      async sett(el, e, S) {
        const sp = S.spill;
        if (!pagar(S) || ruller || laas) return;
        const kat = el.dataset.v;
        const V = VAR(sp);
        const kort = sp.kort[sp.tur];
        if (!V.alle.includes(kat) || kort[kat] != null) return;
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
        const hvem = R.navn(sp.tur);
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

        // Next turn (saved now, so a reload lands on the right player).
        if (!alleFulle(sp)) {
          sp.tur = (sp.tur + 1) % sp.antall;
          sp.kast = 0;
          sp.holdt = sp.holdt.map(() => false);
        }
        R.lagre();
        laas = true;
        const fortsatt = R.vakt();
        await R.vent(R.rolig() ? 250 : 750);
        laas = false;
        if (!fortsatt()) return;
        R.vis();
        R.toast(melding); // after the redraw, so it sits above the new action area
        if (alleFulle(sp)) {
          R.si("Blokka er full. Trykk på «Se kåringen».");
          R.lyd.pling();
        } else if (sp.antall > 1) {
          const hode = R.$(".tg-hode");
          if (hode) hode.classList.add("ny");
          R.lyd.pop();
          R.si(`${R.navn(sp.tur)} sin tur.`);
        }
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
        R.lyd.snu();
        R.toast(`Angret – ${katNavn(a.kat, sp)} er ledig igjen`);
        R.vis();
        R.si(`Angret. ${R.navn(sp.tur)} velger på nytt.`);
      },

      blokka(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        R.ark(`
          <h2 id="ark-tittel">Blokka</h2>
          ${tabellHtml(sp)}
          ${VAR(sp).spar && sp.spart.some((n) => n) ? `<p class="hjelp">Sparte kast: ${sp.spart.map((n, i) => `${esc(R.navn(i))} ${n}`).join(" · ")}</p>` : ""}
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
