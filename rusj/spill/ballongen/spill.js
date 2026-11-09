/* Ballongen — «Galgen for barn»: hangman without the gallows.
   A basket hangs under a bunch of balloons. Guess the word letter by letter; every wrong letter
   pops a balloon. Find the word before the last balloon pops and the basket sails on – if not, a
   parachute opens and the basket lands softly in the grass. Three ways to play:
   Sammen        – alone or all together, words from the shared word bank (window.RUSJ_ORD).
   Mot hverandre – take turns, one letter each; points for every letter found, a bonus for the word.
   Eget ord      – one player types a secret word on the game's own keyboard, the others guess. */
(function () {
  "use strict";

  const R = window.Rusj;
  const esc = R.esc;
  const BANK = window.RUSJ_ORD || { kategorier: [] };

  // ---------- Letters ----------

  const RADER = ["ABCDEFGH", "IJKLMNOP", "QRSTUVWX", "YZÆØÅ"];
  const ALFABET = RADER.join("").split("");
  const stor = (t) => String(t == null ? "" : t).toLocaleUpperCase("nb");
  const bokstavene = (ord) => stor(ord).replace(/[^A-ZÆØÅ]/g, "");
  const unike = (ord) => Array.from(new Set(bokstavene(ord).split("")));
  const antallI = (ord, b) => bokstavene(ord).split(b).length - 1;
  // A custom word typed in capitals is shown as «Katt» in lists.
  const pent = (ord) => {
    const t = String(ord);
    return t === stor(t) ? t.charAt(0) + t.slice(1).toLocaleLowerCase("nb") : t;
  };

  // ---------- Words from the shared word bank ----------
  // Only words that work on the board: letters (a space or hyphen between at most three parts),
  // 3–14 letters, no part longer than 13 characters, no abbreviations like USA or SFO.

  const ORD = [];
  const KAT = [];
  const LOVLIG = /^[A-ZÆØÅ]+(?:[ -][A-ZÆØÅ]+){0,2}$/;
  // Too grim for a children's game (death, disease, weapons).
  const DYSTERT = new Set(["svartedauden", "pestlege", "blod", "neseblod", "de dødes dag", "udødelighet", "våpen", "krig", "gift", "kiste"]);
  // Shown names that differ from the shared word bank (it also holds Sahara, Eiffeltårnet …).
  const KATNAVN = { land: "Steder i verden" };
  BANK.kategorier.forEach((k) => {
    let n = 0;
    k.ord.forEach((e) => {
      const o = String(e[0] || "").trim();
      const t = stor(o);
      const lengde = bokstavene(t).length;
      if (!LOVLIG.test(t) || lengde < 3 || lengde > 14 || t.split(" ").some((d) => d.length > 13)) return;
      if (o === t && lengde <= 4) return;
      if (DYSTERT.has(o.toLocaleLowerCase("nb"))) return;
      ORD.push({ k: k.id, o, n: e[1], h: String(e[2] || "").trim() });
      n += 1;
    });
    if (n) KAT.push({ id: k.id, navn: KATNAVN[k.id] || k.navn, ikon: k.ikon });
  });
  const katMedId = (id) => KAT.find((k) => k.id === id);
  const ALLE_KAT = KAT.map((k) => k.id);
  const stokk = R.kortstokk("ord", ORD.length);

  // Hints the writer can give with a custom word.
  const EGNE_KAT = [
    { id: "dyr", navn: "Et dyr", ikon: "🦊" },
    { id: "mat", navn: "Mat eller drikke", ikon: "🍕" },
    { id: "ting", navn: "En ting", ikon: "🧸" },
    { id: "sted", navn: "Et sted", ikon: "📍" },
    { id: "gjore", navn: "Noe man gjør", ikon: "🏃" },
    { id: "figur", navn: "En figur fra film eller bok", ikon: "🦸" },
    { id: "natur", navn: "Natur og vær", ikon: "🌳" },
    { id: "annet", navn: "Noe helt annet", ikon: "✨" },
  ];
  const egenKat = (id) => EGNE_KAT.find((k) => k.id === id);

  const MODUSER = [
    { v: "sammen", tittel: "Gjett sammen", tekst: "Alene eller alle sammen", ikon: "🎈" },
    { v: "tur", tittel: "Mot hverandre", tekst: "Én bokstav hver – flest poeng vinner", ikon: "🏆" },
    { v: "eget", tittel: "Eget ord", tekst: "Én lager et hemmelig ord, de andre gjetter", ikon: "✍️" },
  ];
  const NIVAER = [
    { v: 1, navn: "Lett", n: [1], tekst: "Kjente ord – fint for de minste." },
    { v: 2, navn: "Middels", n: [1, 2], tekst: "Lette og litt lurere ord." },
    { v: 3, navn: "Vanskelig", n: [2, 3], tekst: "Lengre og lurere ord – for store og små eksperter." },
  ];
  const niva = (v) => NIVAER.find((x) => x.v === v) || NIVAER[0];
  const BALLONGER = [6, 8, 10];
  const RUNDER = [3, 5, 10];
  const BONUS = 2; // for the one who finds the last letter (Mot hverandre)
  const MAKS_BOKSTAVER = 14;
  const PASSASJERER = ["🐻", "🐰", "🐱", "🐶", "🐼", "🦊", "🐸", "🐧", "🐨", "🐯", "🐵", "🐷", "🐹", "🦁"];
  const STD = { modus: "sammen", niva: 1, kat: null, runder: 5, ballonger: 8, egne: 1 };

  let H; // the actions, so one can call another
  // One-shot effects for the next draw (never replayed by a later redraw or a reload).
  let effekt = { pang: null, blas: null, ny: null, utfall: false };
  let visUtkast = false; // the writer holds the eye to see the secret word

  const pagar = (S) => !!(S.spill && !S.spill.ferdig);

  // ---------- Words and rounds ----------

  function filter(o) {
    const lov = new Set(niva(o.niva).n);
    const kat = o.kat ? new Set(o.kat) : null;
    return (i) => lov.has(ORD[i].n) && (!kat || kat.has(ORD[i].k));
  }
  function tellOrd(o) {
    const f = filter(o);
    let n = 0;
    for (let i = 0; i < ORD.length; i++) if (f(i)) n++;
    return n;
  }

  function lagRunde(sp, w) {
    const tur = sp.modus === "tur" ? (sp.start + sp.nr) % sp.antall : -1;
    return Object.assign(w, {
      gjettet: [], // letters in the order they were tried
      hvem: [], // who tried each letter (Mot hverandre), −1 otherwise
      hint: 0,
      hintB: "", // the letter the last hint showed
      tur,
      utfall: null, // "reddet" | "landet"
      angre: false, // the last letter can still be taken back
      pass: R.velg(PASSASJERER),
    });
  }
  function nyttOrd(sp) {
    const i = stokk.neste(filter(sp));
    const w = ORD[i >= 0 ? i : 0];
    return lagRunde(sp, { o: w.o, k: w.k, h: w.h, egen: false, skriver: -1 });
  }

  // «Angre» only rescues a mis-tap: once per word, within a few seconds of the tap.
  const ANGRE_MS = 3000;
  const kanAngre = (r) => !!(r && r.angre && !r.angreBrukt && r.gjettet.length && Date.now() - (r.angreTid || 0) < ANGRE_MS);
  let angreTimer = null;
  function skjulAngreSnart(S) {
    clearTimeout(angreTimer);
    const fortsatt = R.vakt();
    const r = S.spill && S.spill.r;
    const antall = r ? r.gjettet.length : 0;
    angreTimer = setTimeout(() => {
      const na = S.spill && S.spill.r;
      if (fortsatt() && na === r && na.gjettet.length === antall) R.vis();
    }, ANGRE_MS + 100);
  }
  const feil = (r) => r.gjettet.filter((b) => !antallI(r.o, b)).length;
  const vist = (r, b) => r.gjettet.includes(b) || r.hintB === b;
  const mangler = (r) => unike(r.o).filter((b) => !vist(r, b));

  function sjekkUtfall(sp, r) {
    if (!mangler(r).length) r.utfall = "reddet";
    else if (feil(r) >= sp.ballonger) r.utfall = "landet";
    else r.utfall = null;
  }

  // Hints in order: the category, a word that makes you think of it (word bank), then one letter.
  function hintListe(r) {
    if (r.egen) return [r.k ? "kat" : null, "bokstav"].filter(Boolean);
    return ["kat", r.h ? "tips" : null, "bokstav"].filter(Boolean);
  }
  const hintIgjen = (r) => hintListe(r).length - r.hint;
  function hintMulig(r) {
    if (r.utfall || hintIgjen(r) <= 0) return false;
    return hintListe(r)[r.hint] !== "bokstav" || mangler(r).length > 1;
  }

  // Points in a round (Mot hverandre): one per letter found, the bonus for the last one.
  function rundePoeng(r) {
    const p = {};
    r.gjettet.forEach((b, n) => {
      const i = r.hvem[n];
      const treff = antallI(r.o, b);
      if (treff && i >= 0) p[i] = (p[i] || 0) + treff;
    });
    if (r.utfall === "reddet") {
      const siste = r.hvem[r.hvem.length - 1];
      if (siste >= 0) p[siste] = (p[siste] || 0) + BONUS;
    }
    return p;
  }
  function poengSum(sp) {
    const sum = Array.from({ length: sp.antall }, () => 0);
    sp.logg.forEach((l) => Object.entries(l.pluss || {}).forEach(([i, p]) => (sum[i] += p)));
    if (sp.r) Object.entries(rundePoeng(sp.r)).forEach(([i, p]) => (sum[i] += p));
    return sum;
  }

  function loggRad(sp, r) {
    return {
      o: r.o,
      k: r.k,
      egen: !!r.egen,
      skriver: r.skriver,
      utfall: r.utfall || "landet",
      igjen: Math.max(0, sp.ballonger - feil(r)),
      pluss: sp.modus === "tur" ? rundePoeng(r) : {},
    };
  }

  function katInfo(r) {
    if (!r.k) return null;
    const k = r.egen ? egenKat(r.k) : katMedId(r.k);
    return k ? { ikon: k.ikon, navn: k.navn } : null;
  }

  // ---------- Sounds ----------

  function pang() {
    R.lyd.stoy(0, 0.1, 0.75, 3400, "highpass");
    R.lyd.tone(340, 0, 0.09, "square", 0.12, 90);
    R.vibrer(45);
  }
  function blasOpp() {
    R.lyd.tone(240, 0, 0.32, "sine", 0.16, 640);
  }
  function landing() {
    R.lyd.tone(880, 0, 1.1, "sine", 0.1, 330);
    R.lyd.tone(110, 1.05, 0.3, "sine", 0.25, 70);
    R.lyd.tone(1320, 1.4, 0.3, "sine", 0.1);
  }

  // ---------- The scene: balloons, basket and passenger ----------

  // Ten spots in the bunch; 6, 8 or 10 of them are used. Strings meet in a knot above the basket.
  const POS = { A: [120, 28], B: [88, 38], C: [152, 38], D: [57, 62], E: [183, 62], F: [104, 68], G: [136, 68], H: [75, 90], I: [165, 90], J: [120, 88] };
  const FARGE = { A: "#ff4f8b", B: "#ffd23f", C: "#59b9ff", D: "#3de3b0", E: "#a47bff", F: "#ff8a3d", G: "#9be15d", H: "#c9a2ff", I: "#ff6fb5", J: "#5ad1ff" };
  const OPPSETT = {
    6: ["B", "C", "D", "E", "F", "G"],
    8: ["A", "B", "C", "D", "E", "F", "G", "J"],
    10: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  };
  // Outer and lower balloons pop first, side to side, so the bunch stays balanced.
  const SPREKK = {
    6: ["D", "G", "E", "F", "B", "C"],
    8: ["D", "J", "E", "F", "G", "B", "C", "A"],
    10: ["H", "I", "D", "J", "E", "F", "G", "B", "C", "A"],
  };
  const KNUTE = [120, 124];
  const BLEKK = "#170e2b";
  const SNOR = "#cdbce9";

  function ballong(id, klasse) {
    const [x, y] = POS[id];
    return `<g class="bl-ballong ${klasse || ""}" style="--bf: ${FARGE[id]}">
      <path d="M${x} ${y - 20}C${x + 13} ${y - 20} ${x + 18} ${y - 8} ${x + 17} ${y + 2}C${x + 15} ${y + 13} ${x + 6} ${y + 19} ${x} ${y + 20}C${x - 6} ${y + 19} ${x - 15} ${y + 13} ${x - 17} ${y + 2}C${x - 18} ${y - 8} ${x - 13} ${y - 20} ${x} ${y - 20}Z" fill="${FARGE[id]}" stroke="${BLEKK}" stroke-width="2.6"/>
      <path d="M${x - 3.5} ${y + 25}L${x} ${y + 19}L${x + 3.5} ${y + 25}Z" fill="${FARGE[id]}" stroke="${BLEKK}" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="${x - 7}" cy="${y - 8}" rx="3.6" ry="6.5" fill="#fff" opacity=".55" transform="rotate(24 ${x - 7} ${y - 8})"/>
    </g>`;
  }
  function snor(id) {
    const [x, y] = POS[id];
    const [kx, ky] = KNUTE;
    const mx = (x + kx) / 2 + (x < kx ? 6 : x > kx ? -6 : 3);
    const my = (y + 25 + ky) / 2;
    return `<path d="M${x} ${y + 25}Q${mx} ${my} ${kx} ${ky}"/>`;
  }
  function smell(id) {
    const [x, y] = POS[id];
    const str = [0, 45, 90, 135, 180, 225, 270, 315]
      .map((v) => {
        const a = (v * Math.PI) / 180;
        return `M${(x + Math.cos(a) * 15).toFixed(1)} ${(y + Math.sin(a) * 15).toFixed(1)}L${(x + Math.cos(a) * 25).toFixed(1)} ${(y + Math.sin(a) * 25).toFixed(1)}`;
      })
      .join("");
    return `<g class="bl-pang"><path d="${str}" stroke="${FARGE[id]}" stroke-width="3.6" stroke-linecap="round"/><text x="${x}" y="${y + 5}" text-anchor="middle">PANG!</text></g>`;
  }

  function scene(sp, r, o = {}) {
    const sett = OPPSETT[sp.ballonger];
    const borte = new Set(SPREKK[sp.ballonger].slice(0, feil(r)));
    const igjen = sett.filter((id) => !borte.has(id)).sort((a, b) => POS[a][1] - POS[b][1]);
    const synk = r.utfall === "landet" ? 16 : Math.round((feil(r) / sp.ballonger) * 12);
    // Mot hverandre: the player whose turn it is rides in the basket (when the word is done: the last one).
    const sist = r.hvem.length ? r.hvem[r.hvem.length - 1] : -1;
    const hvem = sp.modus !== "tur" ? -1 : r.utfall ? sist : r.tur;
    const passasjer = hvem >= 0 ? R.DYR[hvem % 20] : r.pass;
    const [kx, ky] = KNUTE;
    const boble = r.utfall ? `<g class="bl-boble"><rect x="148" y="108" width="56" height="24" rx="12"/><path d="M154 128 L147 139 L162 130Z"/><text x="176" y="125" text-anchor="middle">${r.utfall === "reddet" ? "Hurra!" : "Puh!"}</text></g>` : "";
    const skjerm =
      r.utfall === "landet"
        ? `<g class="bl-fallskjerm"><path d="M100 146L80 117M140 146L160 117M110 146L100 117M130 146L140 117" stroke="${SNOR}" stroke-width="1.3" fill="none"/>
            <path d="M78 117C78 89 97 74 120 74C143 74 162 89 162 117Q151 109 141 117Q130.5 109 120 117Q109.5 109 99 117Q88.5 109 78 117Z" fill="#ff6fb5" stroke="${BLEKK}" stroke-width="2.6" stroke-linejoin="round"/>
            <path d="M99 117C100 93 108 77 120 74C132 77 140 93 141 117Q130.5 109 120 117Q109.5 109 99 117Z" fill="#fff1dd" stroke="${BLEKK}" stroke-width="2" stroke-linejoin="round"/>
            <ellipse cx="102" cy="88" rx="5" ry="3" fill="#fff" opacity=".45" transform="rotate(-35 102 88)"/></g>`
        : "";
    const klasse = ["bl-scene", r.utfall || "", r.utfall && o.animer ? "animer" : ""].join(" ");
    return `<div class="${klasse}" aria-hidden="true">
      <svg viewBox="14 0 212 210" preserveAspectRatio="xMidYMax meet" focusable="false">
        <g class="bl-himmel">
          <circle cx="22" cy="20" r="1.6"/><circle cx="212" cy="16" r="2"/><circle cx="196" cy="58" r="1.4"/><circle cx="36" cy="96" r="1.4"/><circle cx="226" cy="120" r="1.6"/><circle cx="12" cy="150" r="1.3"/>
          <g class="bl-sky bl-sky1"><ellipse cx="30" cy="58" rx="20" ry="7"/><ellipse cx="40" cy="52" rx="11" ry="8"/></g>
          <g class="bl-sky bl-sky2"><ellipse cx="206" cy="150" rx="22" ry="7"/><ellipse cx="196" cy="144" rx="12" ry="8"/></g>
        </g>
        <path class="bl-bakke" d="M-400 200C-300 186 -120 196 0 199C40 186 84 190 120 193S196 184 240 194C330 204 520 186 640 196V210H-400Z"/>
        <path class="bl-gress" d="M22 192l3-7 2 7M58 188l2-6 3 6M178 188l3-7 2 7M214 191l2-6 3 6M-30 196l2-6 3 6M268 196l3-7 2 7"/>
        <g class="bl-blomst"><circle cx="40" cy="194" r="3"/><circle cx="200" cy="191" r="3"/></g>
        <g transform="translate(0 ${synk})">
          <g class="bl-fly">
            <g class="bl-bunt">
              <g class="bl-snorer" fill="none" stroke="${SNOR}" stroke-width="1.4" stroke-linecap="round" opacity=".8">${igjen.map(snor).join("")}</g>
              ${igjen.map((id) => ballong(id, id === o.blas ? "bl-blas" : "")).join("")}
              ${o.pang ? smell(o.pang) : ""}
            </g>
            ${skjerm}
            <path d="M${kx} ${ky}L100 146M${kx} ${ky}L140 146" fill="none" stroke="${SNOR}" stroke-width="1.7" stroke-linecap="round"/>
            <text class="bl-passasjer" x="120" y="147" text-anchor="middle">${passasjer}</text>
            <path d="M98 150H142L137 176Q120 181 103 176Z" fill="#c98a4b" stroke="${BLEKK}" stroke-width="2.6" stroke-linejoin="round"/>
            <path d="M104 159H136M105 167H135M111 151L109 177M120 151V179M129 151L131 177" fill="none" stroke="#8a5a2b" stroke-width="1.6" stroke-linecap="round"/>
            <rect x="95" y="145" width="50" height="8" rx="4" fill="#a8703a" stroke="${BLEKK}" stroke-width="2.4"/>
            ${boble}
          </g>
        </g>
      </svg>
    </div>`;
  }

  // ---------- Pieces ----------

  // The word as tiles. Words wrap between parts, never inside one.
  function ordRuter(r, o = {}) {
    const deler = stor(r.o).split(" ");
    const lengst = Math.max(6, ...deler.map((d) => d.length));
    const tapt = r.utfall === "landet";
    const beskrivelse = [];
    const html = deler
      .map(
        (del) =>
          `<span class="bl-del">${del
            .split("")
            .map((b) => {
              if (b === "-") {
                beskrivelse.push("bindestrek");
                return `<span class="bl-rute tegn">-</span>`;
              }
              const synlig = vist(r, b);
              beskrivelse.push(synlig || tapt ? b : "tom");
              const ny = synlig && o.ny === b ? " ny" : "";
              if (synlig) return `<span class="bl-rute vist${r.hintB === b ? " hint" : ""}${ny}">${esc(b)}</span>`;
              if (tapt) return `<span class="bl-rute mistet">${esc(b)}</span>`;
              return `<span class="bl-rute"></span>`;
            })
            .join("")}</span>`,
      )
      .join("");
    const antall = bokstavene(r.o).length;
    return `<div class="bl-ord" style="--n: ${lengst}" role="img" aria-label="Ordet har ${antall} bokstaver: ${esc(beskrivelse.join(", "))}">${html}</div>`;
  }

  function tast(b, r) {
    const provd = r.gjettet.includes(b);
    const hint = r.hintB === b;
    const treff = antallI(r.o, b) > 0;
    const klasse = hint ? "hint" : provd ? (treff ? "riktig" : "feil") : "";
    const etikett = hint ? `${b}, vist med hint` : provd ? `${b}, ${treff ? "finnes i ordet" : "finnes ikke"}` : "";
    // aria-disabled, not disabled: a used key keeps keyboard focus (the handler ignores it).
    return `<button class="bl-tast ${klasse}" data-h="bokstav" data-v="${b}" data-stille${provd || hint || r.utfall ? ' aria-disabled="true"' : ""}${etikett ? ` aria-label="${esc(etikett)}"` : ""}>${b}</button>`;
  }

  function tastatur(r) {
    const rader = RADER.map((rad, n) => {
      let html = rad
        .split("")
        .map((b) => tast(b, r))
        .join("");
      if (n === 3) {
        const igjen = hintIgjen(r);
        html += `<button class="bl-tast vid3 bl-hintknapp" data-h="hint"${hintMulig(r) ? "" : ' aria-disabled="true"'} aria-label="${igjen > 0 ? `Hint, ${igjen} igjen` : "Ingen flere hint"}"><span aria-hidden="true">💡</span> Hint${igjen > 0 ? `<i aria-hidden="true">${igjen}</i>` : ""}</button>`;
      }
      return `<div class="bl-rad">${html}</div>`;
    });
    return `<div class="bl-tastatur" role="group" aria-label="Bokstaver">${rader.join("")}</div>`;
  }

  // The writer's keyboard: letters, space and delete. All keys are one action ("skriv"), so fast
  // typing is never mistaken for a ghost tap.
  function skriveTastatur(sp) {
    const tekst = sp.utkast || "";
    const fullt = bokstavene(tekst).length >= MAKS_BOKSTAVER;
    const rader = RADER.map((rad, n) => {
      let html = rad
        .split("")
        .map((b) => `<button class="bl-tast" data-h="skriv" data-v="${b}"${fullt ? " disabled" : ""}>${b}</button>`)
        .join("");
      if (n === 3) {
        const kanMellomrom = tekst && !tekst.endsWith(" ") && tekst.split(" ").length < 3 && !fullt;
        html += `<button class="bl-tast vid" data-h="skriv" data-v="mellomrom"${kanMellomrom ? "" : " disabled"}>Mellomrom</button>`;
        html += `<button class="bl-tast" data-h="skriv" data-v="slett" aria-label="Slett siste bokstav"${tekst ? "" : " disabled"}>⌫</button>`;
      }
      return `<div class="bl-rad">${html}</div>`;
    });
    return `<div class="bl-tastatur" role="group" aria-label="Bokstaver">${rader.join("")}</div>`;
  }

  function utkastHtml(sp) {
    const tekst = sp.utkast || "";
    if (!tekst) return `<span class="bl-utkast-tom">Trykk på bokstavene nedenfor</span>`;
    return tekst
      .split(" ")
      .map((del) => `<span class="bl-del">${del.split("").map((b) => `<span class="bl-prikk">${visUtkast ? esc(b) : "●"}</span>`).join("")}</span>`)
      .join("");
  }
  function tegnUtkast() {
    const el = R.$(".bl-utkast");
    if (el && R.S.spill) el.innerHTML = utkastHtml(R.S.spill);
  }

  // Who is playing right now (Mot hverandre) or who wrote the word (Eget ord).
  function hvemRad(sp, r) {
    if (sp.modus === "tur") {
      const p = poengSum(sp)[r.tur] || 0;
      return `<p class="bl-hvem">${R.avatar(r.tur)}<span><b>${esc(R.navn(r.tur))}</b> sin tur</span><span class="bl-hvem-poeng">${p} p</span></p>`;
    }
    if (sp.modus === "eget" && r.skriver >= 0) return `<p class="bl-hvem">${R.avatar(r.skriver)}<span>Ord fra <b>${esc(R.navn(r.skriver))}</b></span></p>`;
    return "";
  }

  function hintRad(r) {
    const deler = [];
    const k = katInfo(r);
    const liste = hintListe(r);
    for (let n = 0; n < r.hint; n++) {
      if (liste[n] === "kat" && k) deler.push(`<span class="bl-hintbrikke"><span aria-hidden="true">${k.ikon}</span>${esc(k.navn)}</span>`);
      if (liste[n] === "tips") deler.push(`<span class="bl-hintbrikke tips"><span aria-hidden="true">💭</span>Tenk på: <b>${esc(r.h)}</b></span>`);
    }
    return deler.length ? `<div class="bl-hintrad" aria-live="polite">${deler.join("")}</div>` : "";
  }

  const TEKST_REDDET = ["Kurven seiler videre!", "Hurra – kurven er reddet!", "Høyt over trærne!", "Rett til værs!", "Det gikk som en lek!"];
  const TEKST_LANDET = ["Fallskjermen tok kurven – myk landing!", "Puh! Kurven landet mykt i gresset.", "Ingen fare – kurven har fallskjerm!", "Myk landing – neste ord klarer dere!"];

  function utfallTekst(sp, r) {
    const liste = r.utfall === "reddet" ? TEKST_REDDET : TEKST_LANDET;
    let tekst = liste[R.hash(r.o + sp.nr) % liste.length];
    if (r.utfall === "reddet") {
      const igjen = sp.ballonger - feil(r);
      tekst += ` ${igjen === sp.ballonger ? "Ikke én eneste ballong sprakk!" : `${R.flertall(igjen, "ballong", "ballonger")} igjen.`}`;
    }
    return tekst;
  }

  // ---------- The game ----------

  R.start({
    id: "ballongen",
    versjon: 1,
    pagar, // a game is running until «Kåringen» (front-page badge, wake lock)

    tilstand: () => ({
      antall: R.klamp(R.felles.navn.filter((n) => String(n || "").trim()).length || 2, 2, 6),
      oppsett: Object.assign({}, STD),
      spill: null,
    }),

    // Repair saved settings and drop a saved game that doesn't fit this version.
    lastet(S) {
      const o = (S.oppsett = Object.assign({}, STD, S.oppsett && typeof S.oppsett === "object" ? S.oppsett : {}));
      if (!MODUSER.some((m) => m.v === o.modus)) o.modus = "sammen";
      if (![1, 2, 3].includes(o.niva)) o.niva = 1;
      if (!BALLONGER.includes(o.ballonger)) o.ballonger = 8;
      if (!RUNDER.includes(o.runder)) o.runder = 5;
      if (![1, 2].includes(o.egne)) o.egne = 1;
      if (o.kat != null) {
        o.kat = Array.isArray(o.kat) ? o.kat.filter((id) => katMedId(id)) : null;
        if (o.kat && (!o.kat.length || o.kat.length === KAT.length)) o.kat = null;
      }
      S.antall = R.klamp(Number(S.antall) || 2, 2, 6);
      const sp = S.spill;
      const godRunde = (r) =>
        r && typeof r.o === "string" && bokstavene(r.o).length >= 2 && Array.isArray(r.gjettet) && Array.isArray(r.hvem) && r.gjettet.length === r.hvem.length && Number.isInteger(r.hint);
      const ok =
        sp &&
        MODUSER.some((m) => m.v === sp.modus) &&
        BALLONGER.includes(sp.ballonger) &&
        Number.isInteger(sp.antall) &&
        sp.antall >= 1 &&
        Number.isInteger(sp.nr) &&
        sp.nr < sp.runder &&
        Array.isArray(sp.logg) &&
        (sp.r === null ? sp.modus === "eget" || (sp.ferdig && sp.logg.length > 0) : godRunde(sp.r));
      if (sp && !ok) S.spill = null;
      if (!S.spill && !["hjem", "oppsett", null, undefined].includes(S.skjerm)) S.skjerm = "hjem";
      if (S.spill && S.skjerm === "gjett" && !S.spill.r) S.skjerm = "gi";
    },

    regler: {
      intro: "Gjett ordet bokstav for bokstav. Hver feil bokstav får en ballong til å sprekke – men ingen fare: kurven har fallskjerm!",
      steg: [
        ["Trykk på en bokstav", "Finnes den i ordet, dukker den opp. Hvis ikke, sprekker en ballong."],
        ["Bruk hint", "Står dere fast? Hint-knappen viser kategorien, et tips og til slutt en bokstav."],
        ["Redd kurven", "Finn hele ordet før alle ballongene har sprukket. Da seiler kurven videre!"],
      ],
      tips: [
        "Begynn med vokaler – A, E, I og O finnes i nesten alle ord.",
        "Mot hverandre: én bokstav hver. Hver riktig bokstav gir poeng – og den som fullfører ordet, får to ekstra.",
        "Eget ord: den som lager ordet, holder fingeren på øye-knappen 👁 for å se det. De andre ser bort så lenge.",
        "Flere ballonger gjør det lettere. Velg 10 når de minste er med.",
        "Trykket feil? «Angre» under tastaturet tar tilbake bokstaven – rett etterpå, én gang per ord.",
      ],
    },

    skjermer: {
      hjem: {
        tilbake: "portal",
        vis: (S) =>
          R.ui.spillhjem({
            slagordHtml: "Gjett ordet bokstav for bokstav.<br><em>Før ballongene sprekker!</em>",
            knapperHtml: R.ui.startKnapper({
              pagar: pagar(S),
              fortsettTekst: pagar(S) ? `Fortsett · ord ${S.spill.nr + 1} av ${S.spill.runder}` : "",
              ekstraHtml: R.ui.lenke("Slik spiller du", "regler"),
            }),
            merker: [
              ["1–6", "spillere"],
              [R.tall(ORD.length), "ord"],
              [String(KAT.length), "kategorier"],
            ],
          }),
      },

      oppsett: {
        tittel: "Nytt spill",
        tilbake: "hjem",
        vis(S) {
          const o = S.oppsett;
          const n = tellOrd(o);
          const ordValg =
            o.modus === "eget"
              ? `<section class="seksjon">
                  <h2>Hvor mange ord?</h2>
                  ${R.ui.seg("egne", [[1, "Ett hver"], [2, "To hver"]], o.egne, { etikett: "Ord per spiller" })}
                  <p class="hjelp">Alle bytter på å lage et hemmelig ord. De andre gjetter sammen.</p>
                </section>`
              : `<section class="seksjon">
                  <div class="seksjon-hode"><h2>Ordene</h2><span class="tall">${R.tall(n)} ord</span></div>
                  ${R.ui.seg("niva", NIVAER.map((x) => [x.v, x.navn]), o.niva, { etikett: "Vanskelighet" })}
                  <p class="hjelp">${esc(niva(o.niva).tekst)}</p>
                  <button class="bl-katknapp" data-h="kategorier"><span class="bl-kat-ikoner" aria-hidden="true">${(o.kat || ALLE_KAT)
                    .slice(0, 4)
                    .map((id) => katMedId(id).ikon)
                    .join("")}</span><span class="bl-kat-tekst"><small>Kategorier</small><b>${esc(katOppsummering(o))}</b></span><span class="bl-kat-endre">Endre</span></button>
                </section>
                <section class="seksjon">
                  <h2>Antall ord</h2>
                  ${R.ui.seg("runder", RUNDER.map((x) => [x, `${x} ord`]), o.runder, { etikett: "Antall ord" })}
                </section>`;
          return `
            <h1 id="skjerm-tittel">Gjør klart</h1>
            <section class="seksjon">
              <h2>Hvordan vil dere spille?</h2>
              ${R.ui.fliser("modus", MODUSER, o.modus)}
            </section>
            ${o.modus === "sammen" ? "" : R.ui.spillere({ min: 2, max: 6, hjelp: o.modus === "tur" ? "Dere bytter på å velge én bokstav hver." : "Mobilen går rundt – alle lager et ord." })}
            ${ordValg}
            <section class="seksjon">
              <h2>Ballonger</h2>
              ${R.ui.seg("ballonger", BALLONGER.map((x) => [x, `🎈 ${x}`]), o.ballonger, { etikett: "Antall ballonger" })}
              <p class="hjelp">Flere ballonger gjør det lettere. ${o.ballonger === 10 ? "Perfekt når de minste er med!" : ""}</p>
            </section>
            ${R.ui.dokk(o.modus !== "eget" && !n ? `<p class="feil">Velg minst én kategori for å starte.</p>` : "", R.ui.knapp("Start", "start", { av: o.modus !== "eget" && !n, ikon: "🎈" }))}`;
        },
      },

      // Eget ord: pass the phone to the one who makes the next word.
      gi: {
        tittel: (S) => `Ord ${S.spill.nr + 1} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const i = sp.nr % sp.antall;
          return R.ui.giTil({
            i,
            h: "lag-ord",
            tekst: sp.nr === 0 ? "Først ut med et hemmelig ord" : "Neste som lager et ord",
            knapp: `Jeg er ${R.navn(i)}`,
            prikker: [sp.antall, i],
            advarsel: "De andre ser bort",
          });
        },
        inn(S) {
          R.holdVaken();
          if (S.spill) S.spill.skjerm = "gi";
        },
      },

      // Eget ord: the writer types a secret word on the game's own keyboard (shown as dots).
      skriv: {
        tittel: "Hemmelig ord",
        tilbake: "gi",
        gjenoppta: "gi", // after a reload the phone goes through «Gi mobilen til …» again
        vis(S) {
          const sp = S.spill;
          const k = egenKat(sp.ekat);
          const antall = bokstavene(sp.utkast || "").length;
          return `
            <div class="bl-skriv-midt">
              <div class="bl-skriv-hode">
                <p class="bl-skriver">${R.avatar(sp.nr % sp.antall)}<span>${esc(R.navn(sp.nr % sp.antall))}</span></p>
                <h1 id="skjerm-tittel">Lag et hemmelig ord</h1>
                <p class="hjelp">Bare du skal se det. Trykk på bokstavene.</p>
              </div>
              <div class="bl-hemmelig">
                <div class="bl-utkast" aria-live="off">${utkastHtml(sp)}</div>
                <button class="bl-oye" type="button" aria-pressed="false" aria-label="Hold for å se ordet ditt"><span aria-hidden="true">👁</span><small>Hold for å se</small></button>
              </div>
              <p class="bl-teller">${antall ? `${R.flertall(antall, "bokstav", "bokstaver")} · maks ${MAKS_BOKSTAVER}` : `Ett ord – eller opptil tre korte ord`}</p>
              <div class="bl-velg-hint">${
                k
                  ? `<span class="bl-hintbrikke"><span aria-hidden="true">${k.ikon}</span>Hint: ${esc(k.navn)}</span>${R.ui.lenke("Endre", "velg-hint")}`
                  : R.ui.lenke("Velg et hint til de andre (valgfritt)", "velg-hint")
              }</div>
              <p class="feil" id="bl-feil" aria-live="assertive"></p>
            </div>
            ${R.ui.dokk(skriveTastatur(sp), R.ui.knapp("Ferdig", "ferdig", { av: antall < 2, ikon: "✓" }))}`;
        },
        etter(S, rot) {
          // Hold the eye to see the word (pointer or Space/Enter); it hides again when let go.
          const oye = rot.querySelector(".bl-oye");
          if (!oye) return;
          const vis = (pa) => {
            if (visUtkast === pa) return;
            visUtkast = pa;
            oye.setAttribute("aria-pressed", String(pa));
            tegnUtkast();
          };
          oye.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            try {
              oye.setPointerCapture(e.pointerId);
            } catch (feil) {
              /* not all pointers can be captured */
            }
            vis(true);
          });
          ["pointerup", "pointercancel", "lostpointercapture", "blur"].forEach((t) => oye.addEventListener(t, () => vis(false)));
          oye.addEventListener("keydown", (e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              vis(true);
            }
          });
          oye.addEventListener("keyup", (e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              vis(false);
            }
          });
          oye.addEventListener("contextmenu", (e) => e.preventDefault());
        },
        inn(S) {
          visUtkast = false;
          S.spill.skjerm = "skriv";
        },
        ut() {
          visUtkast = false;
        },
      },

      // The play screen, and the result of the word in place when it is found (or the basket lands).
      gjett: {
        tittel: (S) => `Ord ${S.spill.nr + 1} av ${S.spill.runder}`,
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const r = sp.r;
          const fx = effekt; // one-shot animations for this draw only
          effekt = { pang: null, blas: null, ny: null, utfall: false };
          const igjen = sp.ballonger - feil(r);
          const sceneHtml = scene(sp, r, { pang: fx.pang, blas: fx.blas, animer: fx.utfall });
          if (!r.utfall) {
            const forste = sp.nr === 0 && !r.gjettet.length && !r.hint;
            return `
              <h1 class="vh" id="skjerm-tittel">Gjett ordet</h1>
              <div class="bl-spill">
                ${hvemRad(sp, r)}
                <div class="bl-midt">
                  ${sceneHtml}
                  <p class="bl-igjen${igjen <= 2 ? " fare" : ""}"><span aria-hidden="true">🎈</span> ${R.flertall(igjen, "ballong", "ballonger")} igjen</p>
                </div>
                ${hintRad(r)}
                ${ordRuter(r, { ny: fx.ny })}
                ${forste ? `<p class="bl-start-tips">Trykk på en bokstav <span aria-hidden="true">👇</span></p>` : ""}
              </div>
              ${R.ui.dokk(tastatur(r), R.ui.lenkerad(kanAngre(r) ? R.ui.lenke("Angre", "angre") : "", R.ui.lenke("Avslutt", "avslutt")))}`;
          }
          // The word is done: the answer, the points and the way on.
          const reddet = r.utfall === "reddet";
          const siste = sp.nr + 1 >= sp.runder;
          const k = katInfo(r);
          let poeng = "";
          if (sp.modus === "tur") {
            const pluss = rundePoeng(r);
            const sum = poengSum(sp);
            const fullforte = reddet ? r.hvem[r.hvem.length - 1] : -1;
            poeng = `<div class="bl-poeng">${fullforte >= 0 ? `<p class="bl-bonus"><b>${esc(R.navn(fullforte))}</b> fant den siste bokstaven: +${BONUS} ekstra!</p>` : ""}
              ${R.ui.poengliste(sum.map((p, i) => ({ i, poeng: p, pluss: pluss[i] })))}</div>`;
          }
          return `
            <div class="bl-svar">
              <div class="stempel-sted"><h1 id="skjerm-tittel" class="stempel ${reddet ? "mynte" : "lampe"}">${reddet ? "Reddet!" : "Myk landing"}</h1></div>
              ${sceneHtml}
              ${ordRuter(r)}
              ${k ? `<p class="bl-svar-kat"><span aria-hidden="true">${k.ikon}</span> ${esc(k.navn)}${r.egen && r.skriver >= 0 ? ` · fra ${esc(R.navn(r.skriver))}` : ""}</p>` : r.egen && r.skriver >= 0 ? `<p class="bl-svar-kat">Ord fra ${esc(R.navn(r.skriver))}</p>` : ""}
              <p class="bl-svar-tekst">${esc(utfallTekst(sp, r))}</p>
            </div>
            ${poeng}
            ${R.ui.dokk(
              R.ui.knapp(siste ? "Se resultatet" : sp.modus === "eget" ? `Neste: ${R.navn((sp.nr + 1) % sp.antall)}` : "Neste ord", "neste", { ikon: siste ? "🏆" : "🎈" }),
              R.ui.lenkerad(kanAngre(r) ? R.ui.lenke("Angre", "angre") : "", siste ? "" : R.ui.lenke("Avslutt", "avslutt")),
            )}`;
        },
        etter(S, rot) {
          rot.classList.toggle("bl-ferdig", !!(S.spill.r && S.spill.r.utfall));
        },
        inn(S) {
          R.holdVaken();
          S.spill.skjerm = "gjett";
        },
      },

      slutt: {
        tittel: "Kåringen",
        tilbake: "hjem",
        vis(S) {
          const sp = S.spill;
          const reddet = sp.logg.filter((l) => l.utfall === "reddet").length;
          const totalt = sp.logg.length;
          const ordliste = `<section class="seksjon">
              <h2 class="etikett">Ordene</h2>
              <ol class="bl-logg">${sp.logg
                .map((l) => {
                  const k = l.egen ? egenKat(l.k) : katMedId(l.k);
                  return `<li class="${l.utfall}"><span class="bl-logg-merke" aria-hidden="true">${l.utfall === "reddet" ? "🎈" : "🪂"}</span><b>${esc(pent(l.o))}</b><span>${
                    l.egen && l.skriver >= 0 ? `fra ${esc(R.navn(l.skriver))}` : k ? `${k.ikon} ${esc(k.navn)}` : ""
                  }</span><span class="vh">${l.utfall === "reddet" ? "reddet" : "landet"}</span></li>`;
                })
                .join("")}</ol>
            </section>`;
          const dokk = `${R.ui.flereSpill(sp.modus === "sammen" ? {} : { antall: sp.antall })}
            ${R.ui.dokk(R.ui.knapp("Spill igjen", "igjen"), R.ui.lenkerad(R.ui.lenke("Endre oppsett", "nytt"), '<a class="lenke" href="/">Alle spill</a>'))}`;
          if (sp.modus === "tur") {
            const sum = poengSum(sp);
            const maks = Math.max(...sum);
            const vinnere = maks > 0 ? sum.map((p, i) => (p === maks ? i : -1)).filter((i) => i >= 0) : [];
            const rader = sum.map((poeng, i) => ({ i, poeng }));
            const figur =
              vinnere.length === 1
                ? `<span class="bl-vinner">${R.avatar(vinnere[0], "gigant")}<span class="bl-krone" aria-hidden="true">🎈</span></span>`
                : vinnere.length > 1
                  ? `<span class="bl-delt">${vinnere.slice(0, 4).map((i) => R.avatar(i, "stor")).join("")}</span>`
                  : R.figur();
            return `
              <div class="banner aksent">
                ${figur}
                <p class="etikett">${vinnere.length > 1 ? "Delt seier" : vinnere.length ? `${maks} poeng` : "Ingen poeng"}</p>
                <h1 id="skjerm-tittel">${esc(vinnere.length ? `${R.ramsOpp(vinnere.map((i) => R.navn(i)))} vinner!` : "Uavgjort!")}</h1>
                <p class="ingress">${reddet} av ${totalt} ${totalt === 1 ? "kurv" : "kurver"} ble reddet.</p>
              </div>
              ${maks > 0 ? R.ui.pall(rader) : ""}
              ${R.ui.poengliste(rader)}
              ${ordliste}
              ${dokk}`;
          }
          const andel = totalt ? reddet / totalt : 0;
          const [tittel, tekst] =
            totalt && andel === 1
              ? ["Ballongmestere!", "Hver eneste kurv seilte videre. Godt jobba!"]
              : andel >= 0.6
                ? ["Høyt og trygt!", "De fleste kurvene seilte videre. Godt jobba!"]
                : andel > 0
                  ? ["Godt jobba!", "Noen kurver seilte videre, og resten landet mykt."]
                  : ["Myke landinger", "Fallskjermen tok hver eneste kurv. Neste gang går det til værs!"];
          return `
            <div class="banner aksent">
              ${R.figur()}
              <p class="etikett">${reddet} av ${totalt} ${totalt === 1 ? "kurv" : "kurver"} reddet</p>
              <h1 id="skjerm-tittel">${esc(tittel)}</h1>
              <p class="ingress">${esc(tekst)}</p>
              <p class="bl-stjerner" aria-hidden="true">${sp.logg.map((l) => (l.utfall === "reddet" ? "🎈" : "🪂")).join("")}</p>
            </div>
            ${ordliste}
            ${dokk}`;
        },
        inn(S) {
          const sp = S.spill;
          const forste = !sp.feiret;
          sp.ferdig = true;
          sp.feiret = true;
          sp.skjerm = "slutt";
          R.slippVaken();
          R.lagre();
          if (!forste) return;
          const reddet = sp.logg.filter((l) => l.utfall === "reddet").length;
          R.statistikk("ferdig", { modus: sp.modus, ord: sp.logg.length, reddet });
          if (sp.modus === "tur") {
            const sum = poengSum(sp);
            R.kveld.registrer(sum.map((poeng, i) => ({ i, poeng })));
            if (Math.max(...sum) > 0) {
              R.lyd.fanfare();
              R.konfetti();
            } else R.lyd.pling();
          } else if (sp.logg.length && reddet / sp.logg.length >= 0.6) {
            R.lyd.fanfare();
            R.konfetti();
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
        const sp = S.spill;
        if (!pagar(S)) return;
        R.holdVaken();
        R.gaTil(sp.r ? "gjett" : "gi");
      },
      modus(el, e, S) {
        S.oppsett.modus = el.dataset.v;
        R.vis();
      },
      niva(el, e, S) {
        S.oppsett.niva = Number(el.dataset.v);
        R.vis();
      },
      runder(el, e, S) {
        S.oppsett.runder = Number(el.dataset.v);
        R.vis();
      },
      egne(el, e, S) {
        S.oppsett.egne = Number(el.dataset.v) === 2 ? 2 : 1;
        R.vis();
      },
      ballonger(el, e, S) {
        S.oppsett.ballonger = Number(el.dataset.v);
        R.vis();
      },
      kategorier(el, e, S) {
        R.ark(`
          <h2 id="ark-tittel">Kategorier</h2>
          <p class="ingress">Ordene trekkes fra kategoriene dere velger.</p>
          <div id="bl-kat">${katBrikker(S)}</div>
          <button class="knapp" data-h="lukk-ark">Ferdig</button>`);
      },
      kat(el, e, S) {
        const o = S.oppsett;
        const v = el.dataset.v;
        let valgt = o.kat ? o.kat.slice() : ALLE_KAT.slice();
        if (v === "*") valgt = valgt.length === ALLE_KAT.length ? [] : ALLE_KAT.slice();
        else valgt = valgt.includes(v) ? valgt.filter((x) => x !== v) : ALLE_KAT.filter((x) => x === v || valgt.includes(x));
        o.kat = valgt.length === ALLE_KAT.length ? null : valgt;
        const boks = R.$("#bl-kat");
        if (boks) {
          boks.innerHTML = katBrikker(S);
          const ny = boks.querySelector(`[data-v="${CSS.escape(v)}"]`);
          if (ny) ny.focus({ preventScroll: true });
        }
        R.vis();
      },

      async start(el, e, S) {
        const o = S.oppsett;
        if (o.modus !== "eget" && !tellOrd(o)) return;
        const fortsatt = R.vakt();
        if (!(await R.bekreftNytt(pagar(S))) || !fortsatt()) return;
        const antall = o.modus === "sammen" ? 1 : R.klamp(S.antall, 2, 6);
        const sp = {
          modus: o.modus,
          niva: o.niva,
          kat: o.kat ? o.kat.slice() : null,
          ballonger: o.ballonger,
          antall,
          runder: o.modus === "eget" ? antall * o.egne : o.runder,
          nr: 0,
          start: o.modus === "tur" ? R.heltall(0, antall - 1) : 0,
          logg: [],
          r: null,
          utkast: "",
          ekat: "",
          ferdig: false,
        };
        S.spill = sp;
        R.statistikk("start", { modus: sp.modus, ord: sp.runder, ballonger: sp.ballonger });
        R.holdVaken();
        if (sp.modus === "eget") {
          R.gaTil("gi");
          return;
        }
        sp.r = nyttOrd(sp);
        R.gaTil("gjett");
      },
      igjen(el, e, S) {
        S.spill = null;
        H.start(el, e, S);
      },

      // ---------- Guessing ----------

      bokstav(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.r;
        const b = el.dataset.v;
        if (!r || r.utfall || S.skjerm !== "gjett" || !ALFABET.includes(b) || vist(r, b)) return;
        const feilFor = feil(r);
        r.gjettet.push(b);
        r.hvem.push(sp.modus === "tur" ? r.tur : -1);
        r.angre = true;
        r.angreTid = Date.now();
        const treff = antallI(r.o, b);
        if (treff) {
          effekt.ny = b;
          R.lyd.riktig();
          R.vibrer(20);
          R.si(`Riktig! ${b} er med${treff > 1 ? ` ${treff} ganger` : ""}.`);
        } else {
          effekt.pang = SPREKK[sp.ballonger][feilFor];
          pang();
          R.si(`Ingen ${b}. ${R.flertall(sp.ballonger - feilFor - 1, "ballong", "ballonger")} igjen.`);
        }
        if (sp.modus === "tur") r.tur = (r.tur + 1) % sp.antall;
        sjekkUtfall(sp, r);
        if (r.utfall) {
          effekt.utfall = true;
          if (r.utfall === "reddet") {
            R.lyd.fanfare();
            R.konfetti();
            R.vibrer([30, 40, 60]);
          } else landing();
        }
        R.vis();
        skjulAngreSnart(S);
        if (r.utfall) window.scrollTo(0, 0);
      },

      hint(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.r;
        if (!r || !hintMulig(r)) return; // also when the key is aria-disabled
        const type = hintListe(r)[r.hint];
        if (type === "bokstav") {
          // The letter that shows the most; never the very last one (the word is the players' to find).
          const igjen = mangler(r);
          const flest = Math.max(...igjen.map((b) => antallI(r.o, b)));
          r.hintB = R.velg(igjen.filter((b) => antallI(r.o, b) === flest));
          effekt.ny = r.hintB;
          R.si(`Hint: ordet har bokstaven ${r.hintB}.`);
        } else if (type === "kat") {
          const k = katInfo(r);
          if (k) R.si(`Hint: ${k.navn}.`);
        } else R.si(`Hint: tenk på ${r.h}.`);
        r.hint += 1;
        R.lyd.pling();
        R.vibrer(15);
        R.vis();
      },

      // Take back the last letter (until the next one is tried).
      angre(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.r;
        if (!kanAngre(r)) return;
        const b = r.gjettet.pop();
        const hvem = r.hvem.pop();
        if (sp.modus === "tur" && hvem >= 0) r.tur = hvem;
        r.utfall = null;
        r.angre = false;
        r.angreBrukt = true;
        if (!antallI(r.o, b)) {
          effekt.blas = SPREKK[sp.ballonger][feil(r)];
          blasOpp();
        } else R.lyd.snu();
        R.stoppKonfetti();
        R.si(`Angret ${b}.`);
        R.vis();
      },

      neste(el, e, S) {
        const sp = S.spill;
        const r = sp && sp.r;
        if (!r || !r.utfall) return;
        sp.logg.push(loggRad(sp, r));
        sp.logg = sp.logg.slice(-40);
        sp.r = null;
        if (sp.nr + 1 >= sp.runder) {
          sp.ferdig = true;
          R.gaTil("slutt");
          return;
        }
        sp.nr += 1;
        if (sp.modus === "eget") {
          sp.utkast = "";
          sp.ekat = "";
          R.gaTil("gi");
          return;
        }
        sp.r = nyttOrd(sp);
        R.gaTil("gjett");
      },

      async avslutt(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const ferdige = sp.logg.length + (sp.r && sp.r.utfall ? 1 : 0);
        const fortsatt = R.vakt();
        const ja = await R.bekreft("Avslutte spillet?", ferdige ? "Dere ser resultatet så langt." : "Ingen ord er ferdige ennå.", "Avslutt", "Spill videre");
        if (!ja || !fortsatt() || S.spill !== sp) return;
        if (sp.r && sp.r.utfall) sp.logg.push(loggRad(sp, sp.r));
        sp.r = null;
        if (!sp.logg.length) {
          S.spill = null;
          R.slippVaken();
          R.gaTil("hjem");
          return;
        }
        sp.ferdig = true;
        R.gaTil("slutt");
      },

      // ---------- Eget ord ----------

      "lag-ord"(el, e, S) {
        const sp = S.spill;
        if (!sp || sp.r) return;
        R.gaTil("skriv");
      },
      // One key on the writer's keyboard: a letter, "mellomrom" or "slett".
      skriv(el, e, S) {
        const sp = S.spill;
        const v = el.dataset.v;
        if (!sp || S.skjerm !== "skriv") return;
        const tekst = sp.utkast || "";
        if (v === "slett") {
          if (!tekst) return;
          sp.utkast = tekst.slice(0, -1);
        } else if (v === "mellomrom") {
          if (!tekst || tekst.endsWith(" ") || tekst.split(" ").length >= 3 || bokstavene(tekst).length >= MAKS_BOKSTAVER) return;
          sp.utkast = tekst + " ";
        } else {
          const deler = tekst.split(" ");
          if (!ALFABET.includes(v) || bokstavene(tekst).length >= MAKS_BOKSTAVER || deler[deler.length - 1].length >= 13) return;
          sp.utkast = tekst + v;
        }
        R.vis();
      },
      async "velg-hint"(el, e, S) {
        const sp = S.spill;
        if (!sp) return;
        const fortsatt = R.vakt();
        const valg = await R.velgIArk(
          "Hva slags ord er det?",
          [...EGNE_KAT.map((k) => ({ v: k.id, tekst: `${k.ikon} ${k.navn}` })), { v: "-", tekst: "Ingen hint" }],
          "De andre ser dette som det første hintet.",
        );
        if (!fortsatt() || valg == null) return;
        sp.ekat = valg === "-" ? "" : valg;
        R.vis();
      },
      ferdig(el, e, S) {
        const sp = S.spill;
        if (!sp || S.skjerm !== "skriv") return;
        const tekst = (sp.utkast || "").trim();
        const vis = (melding) => {
          const f = R.$("#bl-feil");
          if (f) f.textContent = melding;
          const u = R.$(".bl-hemmelig");
          if (u && !R.rolig()) {
            u.classList.remove("risting");
            void u.offsetWidth;
            u.classList.add("risting");
          }
          R.lyd.feil();
        };
        if (bokstavene(tekst).length < 2) return vis("Ordet må ha minst to bokstaver.");
        const skriver = sp.nr % sp.antall;
        sp.r = lagRunde(sp, { o: tekst, k: sp.ekat || null, h: "", egen: true, skriver });
        sp.utkast = "";
        sp.ekat = "";
        R.lyd.pop();
        R.gaTil("gjett");
        R.si("Ordet er klart. Nå gjetter de andre!");
      },
    }),
  });

  // ---------- Setup helpers (used above, hoisted) ----------

  function katOppsummering(o) {
    const valgt = o.kat || ALLE_KAT;
    if (valgt.length === ALLE_KAT.length) return "Alle kategorier";
    if (!valgt.length) return "Ingen valgt";
    const navn = valgt.map((id) => katMedId(id).navn);
    return navn.length <= 2 ? navn.join(" · ") : `${navn.slice(0, 2).join(" · ")} + ${navn.length - 2}`;
  }
  function katBrikker(S) {
    const o = S.oppsett;
    const lov = niva(o.niva).n;
    return R.ui.brikker(
      "kat",
      KAT.map((k) => ({ v: k.id, tekst: k.navn, ikon: k.ikon, antall: ORD.filter((w) => w.k === k.id && lov.includes(w.n)).length })),
      o.kat || ALLE_KAT,
      { alle: true, etikett: "Kategorier" },
    );
  }

  // ---------- A real keyboard works too (letters, and Backspace/Enter when making a word) ----------

  document.addEventListener("keydown", (e) => {
    const S = R.S;
    if (!S || !S.spill || e.metaKey || e.ctrlKey || e.altKey || R.arkApent()) return;
    const mal = e.target;
    if (mal && mal.closest && mal.closest("input, textarea")) return;
    const iKnapp = mal && mal.closest && mal.closest("button, a");
    const b = e.key && e.key.length === 1 ? stor(e.key) : "";
    if (S.skjerm === "gjett") {
      if (!ALFABET.includes(b)) return;
      const knapp = R.$(`.bl-tast[data-h="bokstav"][data-v="${b}"]`);
      if (!knapp || knapp.disabled) return;
      e.preventDefault();
      R.lyd.lasOpp();
      H.bokstav(knapp, e, S);
    } else if (S.skjerm === "skriv") {
      if (ALFABET.includes(b)) {
        e.preventDefault();
        H.skriv({ dataset: { v: b } }, e, S);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        H.skriv({ dataset: { v: "slett" } }, e, S);
      } else if (e.key === " " && !iKnapp) {
        e.preventDefault();
        H.skriv({ dataset: { v: "mellomrom" } }, e, S);
      } else if (e.key === "Enter" && !iKnapp) {
        e.preventDefault();
        H.ferdig(null, e, S);
      }
    }
  });
})();
