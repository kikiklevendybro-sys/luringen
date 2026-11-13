/* rusj-gjengen: one mascot per game, all drawn the same way (round head, thick ink outline,
   big eyes) so every game is recognisable as part of rusj.
   Classic script in the browser (window.RusjGjengen) and CommonJS in Node (used by the build). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RusjGjengen = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const B = "#170e2b"; // ink
  const P = "#fff1dd"; // paper
  const ROSA = "#ff4f8b";
  const LAMPE = "#ffd23f";
  const KINN = "rgba(255, 79, 139, 0.32)";

  // ---------- Building blocks (viewBox 0 0 120 120, head centre 60,64, radius 48) ----------

  const hode = (f) => `<circle cx="60" cy="64" r="48" fill="${f}" stroke="${B}" stroke-width="5"/>`;
  const kinn = (y = 78) => `<ellipse cx="30" cy="${y}" rx="8" ry="5" fill="${KINN}"/><ellipse cx="90" cy="${y}" rx="8" ry="5" fill="${KINN}"/>`;

  // Round eyes. dx/dy move the pupils (where the character looks).
  function oyne(o = {}) {
    const { y = 56, x1 = 40, x2 = 80, r = 12, dx = 0, dy = 0, pr = 5.5, dx2 = dx, dy2 = dy } = o;
    return `<g class="g-oyne" style="transform-origin:60px ${y}px">
      <circle cx="${x1}" cy="${y}" r="${r}" fill="${P}" stroke="${B}" stroke-width="4.5"/>
      <circle cx="${x2}" cy="${y}" r="${r}" fill="${P}" stroke="${B}" stroke-width="4.5"/>
      <circle cx="${x1 + dx}" cy="${y + dy}" r="${pr}" fill="${B}"/>
      <circle cx="${x2 + dx2}" cy="${y + dy2}" r="${pr}" fill="${B}"/>
      <circle cx="${x1 + dx - 2}" cy="${y + dy - 2.2}" r="1.7" fill="${P}"/>
      <circle cx="${x2 + dx2 - 2}" cy="${y + dy2 - 2.2}" r="1.7" fill="${P}"/>
    </g>`;
  }
  const gladeOyne = (y = 58) =>
    `<path d="M29 ${y} Q40 ${y - 13} 51 ${y}M69 ${y} Q80 ${y - 13} 91 ${y}" fill="none" stroke="${B}" stroke-width="5.5" stroke-linecap="round"/>`;
  const strek = (d, w = 5, farge = B) => `<path d="${d}" fill="none" stroke="${farge}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const smil = (y = 88, b = 16) => strek(`M${60 - b} ${y} Q60 ${y + 14} ${60 + b} ${y}`);
  // The few words drawn into a mascot, per edition (rusj/SPRAK.md): valg.sprak in the build, the
  // page's window.RUSJ_SPRAK in the browser. Three letters for the tiles, short words for signs.
  const ORD = {
    ugle: { nb: "ORD", en: "OWL", da: "ORD" },
    kryss: { nb: "ORD", en: "ABC", da: "ORD" },
    ja: { nb: "JA", en: "YES", da: "JA" },
    fest: { nb: "FEST", en: "PARTY", da: "FEST" },
  };
  const ordFor = (valg, k) => {
    const sprak = (valg && valg.sprak) || (typeof window !== "undefined" && window.RUSJ_SPRAK) || "nb";
    return ORD[k][sprak] || ORD[k].nb;
  };
  const tekst = (x, y, t, s = 16, f = B, rot = 0) =>
    `<text x="${x}" y="${y}" font-family="ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold',system-ui,sans-serif" font-weight="900" font-size="${s}" text-anchor="middle" fill="${f}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}>${t}</text>`;

  // ---------- More building blocks (used by the newer members of the gang) ----------

  const HUD = "#ffd9b3"; // skin
  const ROD = "#ff5a4e";
  const HIMMEL = "#59b9ff";
  const MYNT = "#3de3b0";
  const METALL = "#b8c2d6";
  const MESSING = "#f0bd4f"; // brass
  const n1 = (v) => Math.round(v * 10) / 10;

  // A filled shape with the ink outline.
  const form = (d, farge, w = 4.5) => `<path d="${d}" fill="${farge}" stroke="${B}" stroke-width="${w}" stroke-linejoin="round"/>`;
  // Light shine on glossy things.
  const glans = (d, w = 5) => strek(d, w, "rgba(255,241,221,.75)");
  // A light stroke with the ink outline (sticks, strings and poles that must show on the dark background).
  const pinne = (d, farge, w = 3.5) => strek(d, w + 4.5) + strek(d, w, farge);
  // Hand-drawn eyes blink like oyne(): wrap them (transform-origin between the eyes).
  const blunk = (y, innhold, x = 60) => `<g class="g-oyne" style="transform-origin:${x}px ${y}px">${innhold}</g>`;
  // Four-pointed sparkle.
  const glimt = (x, y, r, farge = LAMPE) =>
    `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="${farge}"/>`;
  // Card suits centred on x,y (s ≈ half the height).
  const hjerte = (x, y, s, farge = ROD) =>
    `<path d="M${x} ${y + s} C${x - s * 1.6} ${y - s * 0.1} ${x - s * 1.1} ${y - s * 1.3} ${x} ${y - s * 0.45} C${x + s * 1.1} ${y - s * 1.3} ${x + s * 1.6} ${y - s * 0.1} ${x} ${y + s}Z" fill="${farge}"/>`;
  const spar = (x, y, s, farge = B) =>
    `<path d="M${x} ${y - s} C${x - s * 1.6} ${y + s * 0.1} ${x - s * 1.1} ${y + s * 1.2} ${x} ${y + s * 0.4} C${x + s * 1.1} ${y + s * 1.2} ${x + s * 1.6} ${y + s * 0.1} ${x} ${y - s}Z M${x} ${y + s * 0.2} L${x + s * 0.5} ${y + s * 1.3} H${x - s * 0.5}Z" fill="${farge}"/>`;
  // A fan of playing cards turned around a common pivot px,py. kort: [[degrees, content, colour], ...];
  // content is drawn in the unturned card (centre px, py - 20).
  const vifte = (px, py, kort) =>
    kort
      .map(
        ([rot, innhold = "", farge = P]) =>
          `<g transform="rotate(${rot} ${px} ${py})"><rect x="${px - 12}" y="${py - 37}" width="24" height="33" rx="4" fill="${farge}" stroke="${B}" stroke-width="3.5"/>${innhold}</g>`,
      )
      .join("");
  // Letter tile (word games).
  const flis = (x, y, bokstav, farge, rot = 0) =>
    `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 11}" y="${y - 11}" width="22" height="22" rx="4.5" fill="${farge}" stroke="${B}" stroke-width="4"/>${tekst(x, y + 5.5, bokstav, 15)}</g>`;
  // Music notes: a single eighth note and a beamed pair, note head at x,y.
  const note = (x, y, farge, rot = 0) => {
    const d = `M${x + 5} ${y - 1} V${y - 21} Q${x + 13} ${y - 16} ${x + 13} ${y - 8}`;
    return `<g transform="rotate(${rot} ${x} ${y})">${pinne(d, farge, 3)}<ellipse cx="${x}" cy="${y}" rx="6.5" ry="5" fill="${farge}" stroke="${B}" stroke-width="2.5" transform="rotate(-20 ${x} ${y})"/></g>`;
  };
  const noter = (x, y, farge, rot = 0) => {
    const d = `M${x + 5} ${y - 1} V${y - 21} L${x + 21} ${y - 25} V${y - 5}`;
    return `<g transform="rotate(${rot} ${x} ${y})">${pinne(d, farge, 3.5)}<ellipse cx="${x}" cy="${y}" rx="6.5" ry="5" fill="${farge}" stroke="${B}" stroke-width="2.5" transform="rotate(-20 ${x} ${y})"/><ellipse cx="${x + 16}" cy="${y - 4}" rx="6.5" ry="5" fill="${farge}" stroke="${B}" stroke-width="2.5" transform="rotate(-20 ${x + 16} ${y - 4})"/></g>`;
  };
  // A die seen from above at an angle: x,y is the corner where the three faces meet, a the edge.
  function terning(x, y, a, rot = 0, farger = ["#ff8577", ROD, "#d9453c"], prikk = P) {
    const k = 0.87 * a;
    const h = a / 2;
    const p = (px, py, skraa) =>
      `<ellipse cx="${n1(px)}" cy="${n1(py)}" rx="${n1(a * 0.11)}" ry="${n1(a * 0.14)}" fill="${prikk}" transform="rotate(${skraa} ${n1(px)} ${n1(py)})"/>`;
    const venstre = (u, v) => p(x - k + k * u, y - h + h * u + a * v, -30);
    const hoyre = (u, v) => p(x + k * u, y - h * u + a * v, 30);
    return `<g transform="rotate(${rot} ${x} ${y})">
      ${form(`M${x} ${y} L${x + k} ${y - h} L${x} ${y - a} L${x - k} ${y - h}Z`, farger[0], 3.5)}
      ${form(`M${x - k} ${y - h} L${x} ${y} V${y + a} L${x - k} ${y + h}Z`, farger[1], 3.5)}
      ${form(`M${x} ${y} L${x + k} ${y - h} V${y + h} L${x} ${y + a}Z`, farger[2], 3.5)}
      <ellipse cx="${x}" cy="${y - h}" rx="${n1(a * 0.17)}" ry="${n1(a * 0.1)}" fill="${prikk}"/>
      ${venstre(0.3, 0.3)}${venstre(0.7, 0.7)}${hoyre(0.25, 0.25)}${hoyre(0.5, 0.5)}${hoyre(0.75, 0.75)}
    </g>`;
  }
  // Points around the head centre (60,64): radius r at angle g (degrees, 0 = right, 90 = down).
  const rundt = (r, g) => [n1(60 + Math.cos((g * Math.PI) / 180) * r), n1(64 + Math.sin((g * Math.PI) / 180) * r)];
  // Stronger blush for green, teal and blue heads (the standard one turns grey on them).
  const rodme = (y = 78, x1 = 30, x2 = 90, rx = 8, ry = 5) =>
    `<ellipse cx="${x1}" cy="${y}" rx="${rx}" ry="${ry}" fill="rgba(255,79,139,.66)"/><ellipse cx="${x2}" cy="${y}" rx="${rx}" ry="${ry}" fill="rgba(255,79,139,.66)"/>`;

  // ---------- The gang ----------

  const FIGURER = {
    luringen: {
      farge: ROSA,
      tegn: () => `
        ${hode(ROSA)}
        <circle cx="40" cy="54" r="12.5" fill="${P}"/><circle cx="80" cy="54" r="12.5" fill="${P}"/>
        <g class="g-pupiller"><circle cx="44" cy="56" r="5.5" fill="${B}"/><circle cx="84" cy="56" r="5.5" fill="${B}"/></g>
        <g fill="none" stroke="${B}" stroke-linecap="round">
          <circle cx="40" cy="54" r="15" stroke-width="6"/><circle cx="80" cy="54" r="15" stroke-width="6"/>
          <path d="M55 52 Q60 47 65 52" stroke-width="5"/>
          <path d="M24 32 Q37 18 53 29" stroke-width="7"/><path d="M67 36 Q80 31 96 36" stroke-width="7"/>
          <path d="M57 99 Q69 104 79 95" stroke-width="4.5"/>
        </g>
        <ellipse cx="60" cy="74" rx="11" ry="9" fill="#ffb08a" stroke="${B}" stroke-width="4"/>
        <path d="M60 82 C53 78 42 79 36 86 C32 90 26 90 23 86 C25 96 41 99 51 91 C55 88 58 87 60 87 C62 87 65 88 69 91 C79 99 95 96 97 86 C94 90 88 90 84 86 C78 79 67 78 60 82 Z" fill="${B}"/>`,
    },

    spionen: {
      farge: "#59b9ff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(84)}
        <rect x="21" y="45" width="35" height="22" rx="10" fill="${B}"/>
        <rect x="64" y="45" width="35" height="22" rx="10" fill="${B}"/>
        ${strek("M54 52 Q60 48 66 52", 5)}
        ${strek("M28 51 L36 51", 3, "rgba(255,241,221,.75)")}${strek("M71 51 L79 51", 3, "rgba(255,241,221,.75)")}
        ${strek("M50 92 Q64 99 78 88", 5)}
        <path d="M4 31 Q60 13 116 31 Q60 45 4 31Z" fill="${B}"/>
        <path d="M29 29 C27 2 93 2 91 29 Q60 21 29 29Z" fill="${B}"/>
        <path d="M30.5 21 Q60 13 89.5 21 L90.6 28.6 Q60 20.8 29.4 28.6Z" fill="${LAMPE}"/>`,
    },

    sladrehanken: {
      farge: "#ff8a3d",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 54, dx: 5, dy: -1 })}
        ${strek("M26 32 Q38 22 50 30M70 30 Q82 22 94 32", 6)}
        <ellipse cx="62" cy="92" rx="12" ry="11" fill="${B}"/>
        <ellipse cx="62" cy="97" rx="7" ry="4.5" fill="${ROSA}"/>
        <path d="M80 86 Q80 74 92 74 L106 76 Q114 78 112 88 L108 108 Q106 116 96 114 L86 110 Q80 106 80 98Z" fill="#ffd9b3" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        ${strek("M88 84 L108 86M86 93 L107 95M86 102 L105 104", 3.2)}
        ${strek("M118 76 l7 -5M120 89 h9M118 102 l7 5", 4.5, LAMPE)}`,
    },

    pekefingeren: {
      farge: LAMPE,
      tegn: (f) => `
        ${hode(f)}
        ${kinn(76)}
        <circle cx="40" cy="54" r="12" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        <circle cx="41" cy="56" r="5.5" fill="${B}"/>
        <path d="M68 54 Q80 47 92 54 Q80 63 68 54Z" fill="${P}" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        <circle cx="81" cy="55" r="4" fill="${B}"/>
        ${strek("M26 34 Q40 24 54 32", 6)}${strek("M68 42 Q80 38 94 42", 6)}
        ${strek("M48 82 Q58 79 70 84", 5)}
        <path d="M86 84 Q84 70 94 70 Q100 70 100 80" fill="#ffd9b3" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        <rect x="80" y="80" width="38" height="36" rx="13" fill="#ffd9b3" stroke="${B}" stroke-width="4.5"/>
        <rect x="22" y="94" width="66" height="16" rx="8" fill="#ffd9b3" stroke="${B}" stroke-width="4.5"/>
        <rect x="78" y="96.5" width="12" height="11" fill="#ffd9b3"/>
        ${strek("M90 98 h20M90 106 h18", 3.5)}
        ${strek("M30 99 Q27 102 30 105", 3)}`,
    },

    vaghalsen: {
      farge: "#ff5a4e",
      tegn: (f) => `
        ${hode(f)}
        ${oyne({ y: 64, r: 11, dy: 1 })}
        ${strek("M27 50 L50 56M93 50 L70 56", 6)}
        <path d="M37 84 H83 Q81 106 60 106 Q39 106 37 84Z" fill="${P}" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        ${strek("M38 92 H82M50 84 V92M60 84 V92M70 84 V92", 3)}
        <path d="M13 44 Q60 18 107 44 L105 56 Q60 33 15 56Z" fill="${LAMPE}" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M104 46 L122 34 L118 50Z M104 50 L120 60 L106 63Z" fill="${LAMPE}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <rect x="80" y="74" width="20" height="9" rx="3.5" fill="#ffd9b3" stroke="${B}" stroke-width="3" transform="rotate(-25 90 78)"/>`,
    },

    vinglepetter: {
      farge: "#3de3b0",
      tegn: () => `
        <path d="M60 16 A48 48 0 0 0 60 112 C66 100 52 92 60 80 C68 66 50 52 60 40 C66 32 56 22 60 16Z" fill="#3de3b0"/>
        <path d="M60 16 A48 48 0 0 1 60 112 C66 100 52 92 60 80 C68 66 50 52 60 40 C66 32 56 22 60 16Z" fill="#a47bff"/>
        ${strek("M60 16 C56 22 66 32 60 40 C50 52 68 66 60 80 C52 92 66 100 60 112", 3)}
        <circle cx="60" cy="64" r="48" fill="none" stroke="${B}" stroke-width="5"/>
        ${oyne({ y: 56, dx: -5, dy: 2, dx2: 5, dy2: -3 })}
        ${strek("M26 38 Q38 30 50 36M70 32 Q82 38 94 34", 6)}
        ${strek("M40 92 l6.5 -6 l6.5 6 l6.5 -6 l6.5 6 l6.5 -6 l6.5 6", 4.5)}
        ${tekst(10, 26, "?", 26, LAMPE, -14)}${tekst(112, 24, "?", 22, ROSA, 12)}`,
    },

    skravla: {
      farge: "#a47bff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(70)}
        ${gladeOyne(54)}
        ${strek("M26 36 Q38 28 50 34M70 34 Q82 28 94 36", 6)}
        <path d="M33 74 Q60 124 87 74 Z" fill="${B}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M38 76 H82 L80 82 H40Z" fill="${P}"/>
        <path d="M46 98 Q60 88 74 98 Q60 108 46 98Z" fill="${ROSA}"/>
        <path d="M84 2 h30 a8 8 0 0 1 8 8 v12 a8 8 0 0 1 -8 8 h-14 l-9 9 v-9 h-7 a8 8 0 0 1 -8 -8 v-12 a8 8 0 0 1 8 -8z" fill="${P}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="90" cy="16" r="3" fill="${B}"/><circle cx="99" cy="16" r="3" fill="${B}"/><circle cx="108" cy="16" r="3" fill="${B}"/>
        ${strek("M4 70 l-8 -3M3 82 h-9M4 94 l-8 3", 4.5, LAMPE)}`,
    },

    panna: {
      farge: "#9be15d",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(82)}
        ${oyne({ y: 62, dx: 0, dy: -5 })}
        ${strek("M28 44 Q40 38 52 44M68 44 Q80 38 92 44", 5.5)}
        <ellipse cx="60" cy="94" rx="7" ry="8" fill="${B}"/>
        <g transform="rotate(-7 60 22)">
          <rect x="34" y="4" width="52" height="34" rx="7" fill="${P}" stroke="${B}" stroke-width="4.5"/>
          ${tekst(60, 31, "?", 28, ROSA)}
        </g>`,
    },

    kodeknekkeren: {
      farge: "#2ed3c6",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(82)}
        ${oyne({ y: 60, dx: 1, dy: 1 })}
        ${strek("M27 44 L52 48M93 44 L68 48", 6)}
        ${strek("M48 92 Q60 100 72 92", 5)}
        ${strek("M15 58 C14 2 106 2 105 58", 8)}
        <rect x="4" y="46" width="18" height="32" rx="8" fill="${B}"/>
        <rect x="98" y="46" width="18" height="32" rx="8" fill="${B}"/>
        ${strek("M12 78 Q16 102 40 100", 4.5)}
        <circle cx="42" cy="100" r="5.5" fill="${B}"/>
        <rect x="88" y="84" width="30" height="30" rx="5" fill="${P}" stroke="${B}" stroke-width="4"/>
        <rect x="93" y="89" width="8" height="8" rx="1.5" fill="${ROSA}"/><rect x="105" y="89" width="8" height="8" rx="1.5" fill="#59b9ff"/>
        <rect x="93" y="101" width="8" height="8" rx="1.5" fill="#59b9ff"/><rect x="105" y="101" width="8" height="8" rx="1.5" fill="${B}"/>`,
    },

    bedreviteren: {
      farge: "#6f8bff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        <circle cx="40" cy="60" r="14" fill="rgba(255,241,221,.28)" stroke="${B}" stroke-width="4.5"/>
        <circle cx="80" cy="60" r="14" fill="rgba(255,241,221,.28)" stroke="${B}" stroke-width="4.5"/>
        ${strek("M54 58 Q60 54 66 58", 4.5)}
        ${strek("M33 62 Q40 56 47 62M73 62 Q80 56 87 62", 4.5)}
        ${strek("M44 90 Q62 102 78 86", 5)}
        <path d="M32 26 V38 Q60 48 88 38 V26Z" fill="${B}"/>
        <path d="M60 2 L114 20 L60 36 L6 20Z" fill="${B}"/>
        ${strek("M60 19 L100 28 V46", 3.5, LAMPE)}
        <rect x="96" y="44" width="8" height="12" rx="2" fill="${LAMPE}"/>`,
    },

    detektiven: {
      farge: "#e8a25c",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(84)}
        <circle cx="40" cy="60" r="10" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        <circle cx="42" cy="61" r="4.5" fill="${B}"/>
        ${strek("M28 46 L52 52", 6)}
        ${strek("M48 94 Q56 90 64 94", 5)}
        ${strek("M96 76 L114 100", 10)}
        <circle cx="80" cy="60" r="21" fill="rgba(190,232,255,.42)" stroke="${B}" stroke-width="6"/>
        <circle cx="80" cy="60" r="13" fill="${P}" stroke="${B}" stroke-width="4"/>
        <circle cx="78" cy="61" r="7" fill="${B}"/><circle cx="75.5" cy="58" r="2.4" fill="${P}"/>
        ${strek("M68 48 Q72 44 77 44", 3, "rgba(255,255,255,.8)")}
        <path d="M14 38 C14 2 106 2 106 38 Q60 26 14 38Z" fill="#8a5a3b" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        ${strek("M30 22 L44 34M46 12 L62 30M66 10 L80 30M84 16 L94 30", 3, "rgba(23,14,43,.35)")}
        <path d="M30 36 Q60 28 90 36 L86 46 Q60 38 34 46Z" fill="#6b4329" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="60" cy="6" r="5" fill="#6b4329" stroke="${B}" stroke-width="3.5"/>`,
    },

    mimen: {
      farge: P,
      tegn: () => `
        ${hode(P)}
        ${strek("M26 44 Q38 30 52 42M68 42 Q82 30 94 44", 5)}
        <ellipse cx="40" cy="58" rx="7" ry="9" fill="${B}"/><ellipse cx="80" cy="58" rx="7" ry="9" fill="${B}"/>
        <circle cx="38" cy="55" r="2.2" fill="${P}"/><circle cx="78" cy="55" r="2.2" fill="${P}"/>
        <path d="M40 72 l3 6 l-3 6 l-3 -6Z M80 72 l3 6 l-3 6 l-3 -6Z" fill="${B}"/>
        <path d="M50 94 Q55 88 60 92 Q65 88 70 94 Q60 101 50 94Z" fill="#ff5a4e" stroke="${B}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M18 32 Q22 4 66 6 Q104 8 100 28 Q60 18 18 32Z" fill="${B}"/>
        ${strek("M64 6 Q66 -2 72 -2", 4)}`,
    },

    tankeleseren: {
      farge: "#ff5cd6",
      tegn: (f) => `
        ${strek("M60 16 V4", 4.5)}
        <circle cx="60" cy="2" r="6.5" fill="${LAMPE}" stroke="${B}" stroke-width="4"/>
        ${strek("M44 6 Q40 0 44 -6M76 6 Q80 0 76 -6M36 12 Q30 2 36 -8M84 12 Q90 2 84 -8", 3.5, LAMPE)}
        ${hode(f)}
        ${kinn(82)}
        <circle cx="40" cy="58" r="13" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        <circle cx="80" cy="58" r="13" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        <g class="g-spiral">${strek("M40 58 m0 0 a2 2 0 0 1 4 0 a4 4 0 0 1 -8 0 a6 6 0 0 1 12 0 a8 8 0 0 1 -16 0", 2.6)}</g>
        <g class="g-spiral">${strek("M80 58 m0 0 a2 2 0 0 1 4 0 a4 4 0 0 1 -8 0 a6 6 0 0 1 12 0 a8 8 0 0 1 -16 0", 2.6)}</g>
        ${strek("M46 92 Q60 102 74 92", 5)}`,
    },

    hviskeren: {
      farge: "#c9a2ff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(78)}
        <path d="M28 58 Q40 48 52 58 Q40 64 28 58Z" fill="${P}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M68 58 Q80 48 92 58 Q80 64 68 58Z" fill="${P}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="45" cy="57" r="3.8" fill="${B}"/><circle cx="85" cy="57" r="3.8" fill="${B}"/>
        ${strek("M28 52 Q40 46 52 52M68 52 Q80 46 92 52", 5)}
        <ellipse cx="52" cy="93" rx="6" ry="5" fill="${B}"/>
        <path d="M58 116 V84 a6 6 0 0 1 12 0 V116Z" fill="${f}" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        ${strek("M84 92 q8 -4 0 -8M90 100 q12 -8 0 -16M96 108 q16 -12 0 -24", 3.5, P)}`,
    },

    lognhalsen: {
      farge: "#ff8f6b",
      tegn: (f) => `
        ${hode(f)}
        ${oyne({ y: 54, dx: -5, dy: 1 })}
        ${strek("M26 34 Q38 30 50 38M70 32 Q82 26 94 30", 6)}
        <path d="M58 64 L114 58 Q122 63 114 70 L58 78 Z" fill="#ffb08a" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M40 94 Q46 88 52 94 Q58 100 64 94 Q70 88 76 94" fill="none" stroke="${B}" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M22 30 q8 12 0 17 q-8 -5 0 -17z" fill="#59b9ff" stroke="${B}" stroke-width="2.5"/>
        <path d="M100 58 Q104 46 112 44 Q108 52 100 58Z" fill="#9be15d" stroke="${B}" stroke-width="2.5" stroke-linejoin="round"/>`,
    },

    kunstneren: {
      farge: "#f7a6ff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        ${gladeOyne(58)}
        <path d="M36 88 Q60 112 84 88 Z" fill="${B}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M48 98 Q60 92 72 98 Q60 106 48 98Z" fill="${ROSA}"/>
        <circle cx="26" cy="70" r="5" fill="#59b9ff"/><circle cx="33" cy="80" r="3" fill="${LAMPE}"/><circle cx="92" cy="72" r="4" fill="#3de3b0"/>
        <path d="M14 36 Q12 6 58 6 Q102 6 100 28 Q60 20 14 36Z" fill="#ff5a4e" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        ${strek("M56 6 Q58 -2 64 -3", 4)}
        ${strek("M92 120 L112 82", 7, "#8a5a3b")}
        <path d="M108 86 L114 72 Q120 64 122 74 L116 90Z" fill="${LAMPE}" stroke="${B}" stroke-width="3.5" stroke-linejoin="round"/>
        <rect x="104" y="80" width="12" height="9" rx="2" fill="#b8c2d6" stroke="${B}" stroke-width="3" transform="rotate(25 110 84)"/>`,
    },

    sauen: {
      farge: "#f3ece2",
      tegn: (f, valg) => {
        const ull = valg && valg.svart ? "#3b3054" : f;
        const ansikt = valg && valg.svart ? "#f3ece2" : "#3b3054";
        const prikk = valg && valg.svart ? B : P;
        const sirkler = [];
        for (let i = 0; i < 12; i++) {
          const v = (i / 12) * Math.PI * 2;
          sirkler.push([60 + Math.cos(v) * 40, 62 + Math.sin(v) * 40, 15]);
        }
        const kant = sirkler.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${ull}" stroke="${B}" stroke-width="5"/>`).join("");
        const fyll = sirkler.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r - 2.5}" fill="${ull}"/>`).join("");
        return `${kant}${fyll}<circle cx="60" cy="62" r="40" fill="${ull}"/>
          <ellipse cx="26" cy="64" rx="13" ry="7" fill="${ansikt}" stroke="${B}" stroke-width="4" transform="rotate(20 26 64)"/>
          <ellipse cx="94" cy="64" rx="13" ry="7" fill="${ansikt}" stroke="${B}" stroke-width="4" transform="rotate(-20 94 64)"/>
          <ellipse cx="60" cy="74" rx="25" ry="30" fill="${ansikt}" stroke="${B}" stroke-width="4.5"/>
          <circle cx="50" cy="44" r="10" fill="${ull}"/><circle cx="62" cy="40" r="11" fill="${ull}"/><circle cx="73" cy="45" r="9" fill="${ull}"/>
          <circle cx="49" cy="70" r="7" fill="${P}" stroke="${B}" stroke-width="3"/><circle cx="71" cy="70" r="7" fill="${P}" stroke="${B}" stroke-width="3"/>
          <circle cx="50" cy="71" r="3.3" fill="${B}"/><circle cx="72" cy="71" r="3.3" fill="${B}"/>
          ${strek("M52 92 Q56 96 60 92 Q64 96 68 92", 3.5, prikk)}
          <ellipse cx="60" cy="86" rx="4" ry="2.6" fill="${prikk}"/>`;
      },
    },

    varulven: {
      farge: "#7d86c9",
      tegn: (f) => `
        <path d="M98 2 A20 20 0 1 0 118 26 A15 15 0 1 1 98 2Z" fill="${LAMPE}" opacity=".9"/>
        <path d="M20 44 L22 2 L52 24Z" fill="${f}" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M100 44 L98 2 L68 24Z" fill="${f}" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M27 34 L28 14 L42 25Z M93 34 L92 14 L78 25Z" fill="${ROSA}"/>
        ${hode(f)}
        <path d="M14 70 L4 78 L16 82 L8 92 L22 92 M106 70 L116 78 L104 82 L112 92 L98 92" fill="${f}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <ellipse cx="40" cy="54" rx="10" ry="9" fill="${LAMPE}" stroke="${B}" stroke-width="4"/>
        <ellipse cx="80" cy="54" rx="10" ry="9" fill="${LAMPE}" stroke="${B}" stroke-width="4"/>
        <ellipse cx="40" cy="54" rx="2.6" ry="6" fill="${B}"/><ellipse cx="80" cy="54" rx="2.6" ry="6" fill="${B}"/>
        ${strek("M26 38 L52 46M94 38 L68 46", 6.5)}
        <ellipse cx="60" cy="86" rx="25" ry="18" fill="#c9cdf0" stroke="${B}" stroke-width="4.5"/>
        <ellipse cx="60" cy="76" rx="9" ry="6.5" fill="${B}"/>
        ${strek("M44 92 Q60 102 76 92", 4.5)}
        <path d="M47 94 L50 103 L53 96Z M73 94 L70 103 L67 96Z" fill="${P}" stroke="${B}" stroke-width="2" stroke-linejoin="round"/>`,
    },

    bokstavtrollet: {
      farge: "#7bc96f",
      tegn: (f) => `
        <path d="M14 58 L2 44 L20 46Z M106 58 L118 44 L100 46Z" fill="${f}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        ${hode(f)}
        <path d="M38 22 Q30 2 48 8 Q50 -4 62 6 Q72 -6 76 10 Q92 4 84 24 Q60 12 38 22Z" fill="#6b4329" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="46" cy="52" r="8" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="74" cy="52" r="8" fill="${P}" stroke="${B}" stroke-width="4"/>
        <circle cx="48" cy="53" r="3.6" fill="${B}"/><circle cx="72" cy="53" r="3.6" fill="${B}"/>
        ${strek("M32 40 Q44 32 54 40M66 40 Q76 32 88 40", 7, "#6b4329")}
        <ellipse cx="60" cy="72" rx="16" ry="13" fill="#a8e09a" stroke="${B}" stroke-width="4.5"/>
        <circle cx="54" cy="76" r="2.4" fill="${B}"/><circle cx="66" cy="76" r="2.4" fill="${B}"/>
        ${strek("M38 94 Q60 108 82 94", 5)}
        <rect x="54" y="98" width="9" height="8" rx="2" fill="${P}" stroke="${B}" stroke-width="2.5"/>
        <rect x="84" y="80" width="32" height="32" rx="7" fill="${LAMPE}" stroke="${B}" stroke-width="4.5" transform="rotate(10 100 96)"/>
        ${tekst(100, 106, "A", 24, B, 10)}`,
    },

    skjaera: {
      farge: "#2f3f7a",
      tegn: () => `
        <circle cx="60" cy="64" r="48" fill="#283a6b" stroke="${B}" stroke-width="5"/>
        <path d="M14 74 Q22 112 60 112 Q98 112 106 74 Q86 86 60 86 Q34 86 14 74Z" fill="${P}" stroke="${B}" stroke-width="4" stroke-linejoin="round"/>
        ${strek("M26 30 Q44 18 60 22", 5, "#3de3b0")}${strek("M30 40 Q42 32 52 34", 4, "#59b9ff")}
        <circle cx="42" cy="56" r="11" fill="${P}" stroke="${B}" stroke-width="4"/><circle cx="78" cy="56" r="11" fill="${P}" stroke="${B}" stroke-width="4"/>
        <circle cx="46" cy="57" r="5" fill="${B}"/><circle cx="82" cy="57" r="5" fill="${B}"/>
        ${strek("M30 42 L52 46M90 42 L68 46", 5, P)}
        <path d="M48 70 L60 64 L72 70 L60 92Z" fill="${B}" stroke="${B}" stroke-width="3" stroke-linejoin="round"/>
        ${strek("M54 72 L60 69", 2.5, "rgba(255,241,221,.6)")}
        <circle cx="74" cy="96" r="11" fill="none" stroke="${LAMPE}" stroke-width="5"/>
        <path d="M80 84 l3 -6 l3 6 l-3 3z" fill="#59b9ff" stroke="${B}" stroke-width="1.5"/>`,
    },

    elefanten: {
      farge: "#9fb3d9",
      tegn: (f) => `
        <ellipse cx="16" cy="62" rx="22" ry="30" fill="${f}" stroke="${B}" stroke-width="5"/>
        <ellipse cx="104" cy="62" rx="22" ry="30" fill="${f}" stroke="${B}" stroke-width="5"/>
        <ellipse cx="18" cy="64" rx="12" ry="19" fill="#ffb0c8"/><ellipse cx="102" cy="64" rx="12" ry="19" fill="#ffb0c8"/>
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 54, r: 10, pr: 4.8, x1: 40, x2: 80, dy: 1 })}
        ${strek("M30 38 Q40 32 50 38M70 38 Q80 32 90 38", 5)}
        <path d="M46 98 Q40 104 44 108" fill="none" stroke="${P}" stroke-width="5" stroke-linecap="round"/>
        <path d="M74 98 Q80 104 76 108" fill="none" stroke="${P}" stroke-width="5" stroke-linecap="round"/>
        <path d="M50 64 Q48 96 58 110 Q66 120 76 114 Q82 108 76 102 Q70 106 66 100 Q60 90 70 64Z" fill="${f}" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        ${strek("M56 82 h8M57 92 h7", 3)}`,
    },

    // ---------- Newer members (same order as before, when they were placeholders) ----------

    // Ordugla (daily word game): a wise owl holding three letter tiles.
    ordugla: {
      farge: "#d99a5e",
      tegn: (f, v) => `
        ${form("M26 44 Q14 30 10 6 Q20 13 26 17 Q27 7 33 1 Q38 16 46 26Z", f)}${form("M94 44 Q106 30 110 6 Q100 13 94 17 Q93 7 87 1 Q82 16 74 26Z", f)}
        ${hode(f)}
        ${form("M60 48.8 A22 22 0 1 0 60 67.2 A22 22 0 1 0 60 48.8Z", "#ffe8c9", 4)}
        ${oyne({ y: 58, r: 12.5, pr: 6, dx: 1, dy: 1 })}
        ${strek("M21 38 Q38 29 56 42M99 38 Q82 29 64 42", 5.5)}
        ${form("M52.5 66 Q60 62 67.5 66 L60 80Z", "#ff9f3a", 3.5)}
        ${kinn(84)}
        ${/* the game's own tiles: solid mint = right place, yellow ring = elsewhere */ ""}${flis(35, 101, ordFor(v, "ugle")[0], MYNT, -9)}<rect x="49" y="92" width="22" height="22" rx="4.5" fill="#2a1a4a" stroke="${B}" stroke-width="4"/><circle cx="60" cy="103" r="7.6" fill="none" stroke="${LAMPE}" stroke-width="2.6"/>${tekst(60, 107.2, ordFor(v, "ugle")[1], 11.5, "#fff1dd")}${flis(85, 101, ordFor(v, "ugle")[2], MYNT, 9)}`,
    },

    // Nissen (Secret Santa): a Norwegian nisse, red cap and grey beard.
    nissen: {
      farge: "#f2545b",
      tegn: (f) => {
        const skjegg = [];
        for (let i = 0; i <= 8; i++) skjegg.push([n1(60 + Math.cos((i / 8) * Math.PI) * 40), n1(78 + Math.sin((i / 8) * Math.PI) * 28)]);
        const kant = skjegg.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#e4e0ec" stroke="${B}" stroke-width="4.5"/>`).join("");
        const fyll = skjegg.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10.6" fill="#e4e0ec"/>`).join("");
        return `
          ${hode(HUD)}
          ${oyne({ y: 58, r: 10.5, pr: 5, dy: 1 })}
          ${kant}${fyll}<ellipse cx="60" cy="92" rx="38" ry="20" fill="#e4e0ec"/>
          <ellipse cx="60" cy="94" rx="6" ry="4.5" fill="${B}"/>
          ${form("M60 79 Q47 70 37 79 Q45 90 60 84 Q75 90 83 79 Q73 70 60 79Z", "#f4f1f8", 3.5)}
          <circle cx="60" cy="72" r="6.5" fill="#ff8f86" stroke="${B}" stroke-width="3.5"/>
          ${form("M8 42 C8 12 40 -8 74 -8 C100 -8 116 8 119 30 Q121 44 118 56 Q112 40 104 26 Q108 34 112 42 Q60 20 8 42Z", f)}
          ${form("M8 42 Q60 20 112 42 L112 52 Q60 30 8 52Z", "#d8404d", 4)}
          <circle cx="117" cy="60" r="8" fill="#f4f1f8" stroke="${B}" stroke-width="4"/>`;
      },
    },

    // Terninga (Yatzy): a white die-faced head with a red die tumbling past.
    terninga: {
      farge: "#f4f0ff",
      tegn: (f) => `
        ${terning(104, 8, 17, 14)}
        ${strek("M78 2 l-9 -3M80 12 h-10", 4, LAMPE)}
        ${hode(f)}
        <circle cx="34.5" cy="38.5" r="6" fill="${B}"/><circle cx="85.5" cy="38.5" r="6" fill="${B}"/>
        <circle cx="34.5" cy="89.5" r="6" fill="${B}"/><circle cx="85.5" cy="89.5" r="6" fill="${B}"/>
        <ellipse cx="38" cy="75" rx="6" ry="4" fill="${KINN}"/><ellipse cx="82" cy="75" rx="6" ry="4" fill="${KINN}"/>
        ${oyne({ y: 60, x1: 44, x2: 76, r: 11, pr: 5, dx: 1, dy: 1 })}
        ${smil(80, 11)}`,
    },

    // Tidsmaskinen (timeline): a time-machine robot that is also an alarm clock.
    tidsmaskinen: {
      farge: "#5ad1ff",
      tegn: (f) => {
        const merker = [];
        for (let i = 0; i < 12; i++) {
          const [x1, y1] = rundt(i % 3 ? 40 : 36, i * 30);
          const [x2, y2] = rundt(44, i * 30);
          merker.push(`M${x1} ${y1} L${x2} ${y2}`);
        }
        return `
          ${form("M12 30 A16 16 0 0 1 44 30Z", LAMPE)}
          ${form("M76 30 A16 16 0 0 1 108 30Z", LAMPE)}
          ${pinne("M60 18 V4", METALL, 3)}<circle cx="60" cy="2" r="5" fill="${METALL}" stroke="${B}" stroke-width="3.5"/>
          ${pinne("M36 104 L26 118M84 104 L94 118", METALL, 4)}
          ${hode(f)}
          ${strek(merker.join(""), 3.5, "rgba(23,14,43,.45)")}
          ${kinn(78)}
          ${oyne({ y: 56 })}
          <rect x="44" y="82" width="32" height="14" rx="5" fill="${P}" stroke="${B}" stroke-width="4"/>
          ${strek("M52 84 V94M60 84 V94M68 84 V94", 2.5)}
          ${form("M2 52 h8 v24 h-8 a4 4 0 0 1 -4 -4 v-16 a4 4 0 0 1 4 -4Z", METALL, 4)}
          ${form("M118 52 h-8 v24 h8 a4 4 0 0 0 4 -4 v-16 a4 4 0 0 0 -4 -4Z", METALL, 4)}`;
      },
    },

    // Tieren (ten answers): a shiny 10-kroner coin.
    tieren: {
      farge: "#ffb347",
      tegn: (f) => {
        const riller = [];
        for (let i = 0; i < 48; i++) {
          const [x1, y1] = rundt(42.5, i * 7.5);
          const [x2, y2] = rundt(46, i * 7.5);
          riller.push(`M${x1} ${y1} L${x2} ${y2}`);
        }
        return `
          ${hode(f)}
          ${strek(riller.join(""), 2, "rgba(23,14,43,.28)")}
          <circle cx="60" cy="64" r="40" fill="none" stroke="#d9861c" stroke-width="3"/>
          ${tekst(61, 47, "10", 22, "rgba(255,241,221,.8)")}${tekst(60, 46, "10", 22, "#a85a0a")}
          ${kinn(84)}
          ${oyne({ y: 64, r: 11.5 })}
          ${smil(88, 13)}
          ${glans("M22 54 Q24 38 34 30", 4)}
          ${glimt(108, 14, 9, P)}${glimt(12, 104, 6)}`;
      },
    },

    // Admiralen (battleship): naval cap and a brass telescope.
    admiralen: {
      farge: "#4f7dff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(84)}
        ${strek("M29 66 Q40 60 51 66", 5)}
        ${strek("M28 54 Q40 50 52 56", 5.5)}
        ${strek("M46 94 Q56 90 68 94", 5)}
        <g transform="rotate(-14 72 64)">
          ${form("M64 54 H86 V74 H64 a4 4 0 0 1 -4 -4 V58 a4 4 0 0 1 4 -4Z", MESSING)}
          ${form("M86 52 H104 V76 H86Z", MESSING)}
          ${form("M104 48 H120 a4 4 0 0 1 4 4 V76 a4 4 0 0 1 -4 4 H104Z", MESSING)}
          ${strek("M108 54 V74", 3, "rgba(255,241,221,.8)")}
        </g>
        ${form("M10 28 Q8 4 60 2 Q112 4 110 28 Q60 38 10 28Z", P)}
        <path d="M24 28 Q60 36 96 28 V38 Q60 46 24 38Z" fill="${B}"/>
        ${form("M24 38 Q60 46 96 38 Q94 50 60 51 Q26 50 24 38Z", B, 3)}
        ${strek("M32 43 Q60 49 88 43", 2.5, LAMPE)}
        <circle cx="60" cy="24" r="8" fill="${LAMPE}" stroke="${B}" stroke-width="3"/>
        ${strek("M60 19 V30M56 22 H64M55 26 Q60 31 65 26", 2)}`,
    },

    // Ballongen (hangman for kids): a balloon with a string and a letter tag.
    ballongen: {
      farge: "#ff6fb5",
      tegn: (f) => `
        ${pinne("M60 121 C62 129 76 127 80 120 C84 112 90 108 96 110", P, 3)}
        ${hode(f)}
        <path d="M24 56 Q22 34 42 24 Q50 21 52 26 Q53 30 46 32 Q34 38 32 54 Q31 60 27 60 Q24 60 24 56Z" fill="rgba(255,255,255,.7)"/>
        ${form("M50 123 L60 108 L70 123 Q60 127 50 123Z", f, 4)}
        ${kinn(80)}
        ${oyne({ y: 58, dy: -2 })}
        ${strek("M28 40 Q40 34 52 40M68 40 Q80 34 92 40", 5)}
        ${form("M42 84 Q60 104 78 84Z", B, 4)}<path d="M50 94 Q60 88 70 94 Q60 101 50 94Z" fill="${ROSA}"/>
        <g transform="rotate(12 104 110)">${form("M94 100 H114 V120 H94Z", LAMPE, 3.5)}${tekst(104, 116, "A", 13)}</g>`,
    },

    // Nynneren (hum the song): eyes closed, humming, notes floating up.
    nynneren: {
      farge: "#b48cff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(78)}
        ${gladeOyne(62)}
        ${strek("M28 44 Q40 38 52 44M68 44 Q80 38 92 44", 5)}
        ${form("M52 90 Q60 84 68 90 Q60 96 52 90Z", B, 3)}
        ${noter(98, 40, LAMPE, 10)}${note(6, 34, MYNT, -14)}${note(86, 8, ROSA, 8)}`,
    },

    // Papegøyen (the yes/no game): a parrot whose «JA» is crossed out.
    papegoyen: {
      farge: "#53d769",
      tegn: (f, v) => `
        ${form("M52 24 Q36 0 48 -8 Q60 4 60 22Z", ROD)}
        ${form("M60 22 Q60 -6 74 -9 Q80 8 68 26Z", LAMPE)}
        ${form("M68 26 Q82 4 98 6 Q94 22 74 32Z", HIMMEL)}
        ${hode(f)}
        ${oyne({ y: 52, x1: 36, x2: 84, r: 11.5, dx: -2 })}
        ${rodme(78, 24, 96, 7)}
        ${form("M44 62 Q60 50 76 62 Q78 82 60 98 Q42 82 44 62Z", "#ffb23a")}
        ${strek("M52 78 Q60 84 68 78", 3)}
        ${form("M2 0 h36 a6 6 0 0 1 6 6 v18 a6 6 0 0 1 -6 6 h-10 l-6 8 v-8 h-20 a6 6 0 0 1 -6 -6 v-18 a6 6 0 0 1 6 -6z", P, 3.5)}
        ${tekst(20, 20.5, ordFor(v, "ja"), ordFor(v, "ja").length > 2 ? 9.5 : 13)}
        <circle cx="20" cy="15" r="10.5" fill="none" stroke="${ROD}" stroke-width="3.2"/>
        ${strek("M12.6 22.4 L27.4 7.6", 3.2, ROD)}`,
    },

    // Bingoballen (party bingo): a bingo ball with its number.
    bingoballen: {
      farge: "#ffd23f",
      tegn: (f) => `
        ${hode(f)}
        ${glans("M22 60 Q22 42 34 32", 4.5)}
        <circle cx="60" cy="34" r="15" fill="${P}" stroke="${B}" stroke-width="4"/>
        ${tekst(60, 40, "42", 15)}
        ${kinn(84)}
        ${oyne({ y: 66, r: 11 })}
        ${form("M44 88 Q60 106 76 88Z", B, 4)}<path d="M51 97 Q60 92 69 97 Q60 103 51 97Z" fill="${ROSA}"/>`,
    },

    // Brikka (Ludo): a glossy board-game pawn.
    brikka: {
      farge: "#ff7a45",
      tegn: (f) => `
        ${hode(f)}
        ${glans("M24 54 Q26 34 44 25", 6)}
        ${kinn(74)}
        ${oyne({ y: 52, dx: 4, dy: -1 })}
        ${strek("M28 34 Q39 30 50 36M70 34 Q81 28 92 32", 5)}
        ${form("M45 76 Q62 94 77 74Z", B, 4)}<path d="M55 85 Q62 81 69 83 Q64 90 55 85Z" fill="${ROSA}"/>
        ${form("M30 106 Q32 112 16 116 Q8 118 8 122 H112 Q112 118 104 116 Q88 112 90 106Z", "#e8602e")}
        ${form("M14 102 Q14 94 60 94 Q106 94 106 102 Q106 110 60 110 Q14 110 14 102Z", "#e8602e")}
        ${glans("M24 99 Q36 97 48 97", 3)}
        ${strek("M4 58 h-9M2 70 h-11M6 82 h-8", 4, LAMPE)}`,
    },

    // Verktøykassa (party tools): holds a red toolbox with a die, a coin and a timer.
    verktoykassa: {
      farge: "#9aa9c2",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(62)}
        ${oyne({ y: 44, dy: 4 })}
        ${strek("M28 26 Q40 21 52 26M68 26 Q80 21 92 26", 5)}
        ${smil(60, 10)}
        <g transform="rotate(-18 34 86)">
          <rect x="25" y="77" width="18" height="18" rx="4" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          <circle cx="30" cy="82" r="2.2" fill="${B}"/><circle cx="34" cy="86" r="2.2" fill="${B}"/><circle cx="38" cy="90" r="2.2" fill="${B}"/>
        </g>
        <circle cx="60" cy="84" r="9" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/>
        <circle cx="60" cy="84" r="4.5" fill="none" stroke="rgba(23,14,43,.35)" stroke-width="2"/>
        <g transform="rotate(16 86 86)">
          <rect x="83" y="72" width="6" height="6" rx="1.5" fill="${METALL}" stroke="${B}" stroke-width="2.5"/>
          <circle cx="86" cy="86" r="9.5" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          ${strek("M86 86 V80M86 86 L90 88", 2.5)}
        </g>
        ${form("M20 90 H100 V112 a7 7 0 0 1 -7 7 H27 a7 7 0 0 1 -7 -7Z", ROD)}
        ${strek("M20 100 H100", 3.5)}
        <rect x="53" y="95" width="14" height="10" rx="2.5" fill="${LAMPE}" stroke="${B}" stroke-width="3"/>`,
    },

    // Kortkongen (solitaire): a crowned king with a fan of cards.
    kortkongen: {
      farge: "#ff4f6b",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 58, dx: -3 })}
        ${strek("M27 44 Q40 38 52 43M68 41 Q80 34 93 40", 5.5)}
        ${strek("M40 88 Q54 98 70 86", 5)}
        ${form("M24 36 L16 6 L40 20 L60 -2 L80 20 L104 6 L96 36 Q60 26 24 36Z", LAMPE)}
        <circle cx="16" cy="6" r="4.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/><circle cx="60" cy="-2" r="4.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/><circle cx="104" cy="6" r="4.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/>
        <circle cx="60" cy="24" r="5" fill="${HIMMEL}" stroke="${B}" stroke-width="3"/>
        <circle cx="38" cy="28" r="3.5" fill="${ROSA}" stroke="${B}" stroke-width="2.5"/><circle cx="82" cy="28" r="3.5" fill="${ROSA}" stroke="${B}" stroke-width="2.5"/>
        ${vifte(98, 122, [[-30, spar(98, 102, 6)], [-8, hjerte(98, 102, 6, ROSA)], [16, `${tekst(92, 98, "K", 11)}${hjerte(100, 108, 5)}`]])}`,
    },

    // Tallknuseren (sudoku): calm, peeking over a sudoku box.
    tallknuseren: {
      farge: "#7fd6c2",
      tegn: (f) => `
        ${hode(f)}
        ${rodme(68)}
        ${oyne({ y: 50, dx: 1, dy: 5 })}
        ${strek("M29 33 Q40 26 51 31M69 31 Q80 26 91 33", 5)}
        ${strek("M49 70 Q60 79 71 70", 4.5)}
        <g transform="rotate(-5 60 100)">
          <rect x="39" y="79" width="42" height="42" rx="5" fill="${P}" stroke="${B}" stroke-width="4.5"/>
          ${strek("M53 81 V119M67 81 V119M41 93 H79M41 107 H79", 2.2, "rgba(23,14,43,.5)")}
          ${tekst(46, 90, "5", 11)}${tekst(74, 90, "3", 11)}${tekst(60, 104, "9", 11, ROSA)}${tekst(46, 118, "7", 11)}
        </g>
        <ellipse cx="38" cy="98" rx="7" ry="9" fill="${f}" stroke="${B}" stroke-width="4"/>
        <ellipse cx="82" cy="98" rx="7" ry="9" fill="${f}" stroke="${B}" stroke-width="4"/>`,
    },

    // Sjakkhesten (chess): the knight, a proud horse in three-quarter view.
    sjakkhesten: {
      farge: "#c9b28f",
      tegn: (f) => {
        const MAN = "#8a5a3b";
        const tupper = [[-102, 59], [-126, 63], [-150, 64], [-174, 63], [-198, 61], [-222, 57]];
        let man = `M${rundt(44, -84).join(" ")}`;
        tupper.forEach(([g, r]) => (man += ` L${rundt(r, g).join(" ")} L${rundt(50, g - 12).join(" ")}`));
        man += ` L${rundt(44, -240).join(" ")} L60 64Z`;
        return `
          ${form("M30 104 Q32 112 16 116 Q8 118 8 122 H112 Q112 118 104 116 Q88 112 90 104Z", "#a88d68")}
          ${form("M12 104 Q12 96 60 96 Q108 96 108 104 Q108 112 60 112 Q12 112 12 104Z", "#a88d68")}
          ${form(man, MAN)}
          ${form("M49 26 Q43 8 52 -2 Q62 10 64 23Z", f)}${form("M72 23 Q77 5 90 1 Q91 15 85 28Z", f)}
          <path d="M53 20 Q50 9 53 4 Q58 12 59 20Z M77 21 Q80 10 86 7 Q86 15 82 23Z" fill="#a8896a"/>
          ${hode(f)}
          ${form("M42 24 Q56 12 72 19 L65 25 L67 33 L59 27 L54 37 L50 27 L41 31Z", MAN, 4)}
          ${form("M70 58 Q96 51 112 61 Q122 69 121 83 Q120 98 104 102 Q88 106 74 98Z", "#ecdcc0")}
          <ellipse cx="111" cy="73" rx="3.5" ry="5" fill="${B}" transform="rotate(-25 111 73)"/>
          ${strek("M88 96 Q100 98 112 92", 3.5)}
          ${blunk(53, `
            <circle cx="40" cy="54" r="11.5" fill="${P}" stroke="${B}" stroke-width="4.5"/>
            <circle cx="70" cy="52" r="10" fill="${P}" stroke="${B}" stroke-width="4.5"/>
            <circle cx="44" cy="56" r="5.2" fill="${B}"/><circle cx="73.5" cy="54" r="4.6" fill="${B}"/>
            <circle cx="42.3" cy="54" r="1.6" fill="${P}"/><circle cx="71.8" cy="52" r="1.5" fill="${P}"/>
            ${form("M29.3 50 A12 12 0 0 1 50.7 50Z", f, 4.5)}${form("M60.8 48.5 A10.5 10.5 0 0 1 79.2 48.5Z", f, 4.5)}`)}
          ${strek("M28 35 Q38 29 50 33M62 32 Q70 27 80 31", 5)}
          <ellipse cx="38" cy="78" rx="8" ry="5" fill="${KINN}"/>`;
      },
    },

    // Fireren (four in a row): a yellow disc dropping into the blue board.
    fireren: {
      farge: "#ffcf3f",
      tegn: (f) => `
        ${strek("M26 4 v9M40 -3 v10M80 -3 v10M94 4 v9", 4, LAMPE)}
        ${hode(f)}
        <circle cx="60" cy="64" r="37" fill="none" stroke="rgba(23,14,43,.2)" stroke-width="3.5"/>
        ${kinn(66)}
        ${oyne({ y: 46, dy: 4 })}
        ${smil(64, 12)}
        <rect x="-3" y="80" width="126" height="40" rx="9" fill="#3f6fe6" stroke="${B}" stroke-width="4.5"/>
        ${[14, 37, 60, 83, 106].map((x, i) => `<circle cx="${x}" cy="100" r="8.5" fill="${[ROD, "#1d1338", LAMPE, ROD, "#1d1338"][i]}" stroke="${B}" stroke-width="3.5"/>`).join("")}`,
    },

    // Bonden (tic-tac-toe): a cheerful farmer with straw hat, a straw and a game of X and O.
    bonden: {
      farge: "#a3d977",
      tegn: (f) => `
        ${hode(f)}
        ${rodme(82)}
        <circle cx="25" cy="80" r="1.5" fill="#a0603a"/><circle cx="30" cy="84" r="1.5" fill="#a0603a"/><circle cx="34" cy="79" r="1.5" fill="#a0603a"/>
        <circle cx="95" cy="80" r="1.5" fill="#a0603a"/><circle cx="90" cy="84" r="1.5" fill="#a0603a"/><circle cx="86" cy="79" r="1.5" fill="#a0603a"/>
        ${oyne({ y: 62, r: 11.5 })}
        ${form("M38 86 Q60 108 82 86Z", B, 4)}<path d="M47 97 Q60 91 73 97 Q60 104 47 97Z" fill="${ROSA}"/>
        ${form("M0 38 Q60 14 120 38 Q60 54 0 38Z", "#f5d36b")}
        ${form("M30 33 C28 0 92 0 90 33 Q60 26 30 33Z", "#f5d36b")}
        <path d="M30.4 24 Q60 17 89.6 24 L90 32 Q60 25 30 32Z" fill="${ROD}"/>
        ${strek("M12 38 l8 3M28 43 l7 2M85 43 l7 -2M100 41 l8 -3", 2.5, "rgba(23,14,43,.3)")}
        <g transform="rotate(8 99 99)">
          ${form("M82 82 H116 V116 H82Z", P, 4)}
          ${strek("M93.3 85 V113M104.7 85 V113M85 93.3 H113M85 104.7 H113", 2.5)}
          ${strek("M85 85 l5.5 5.5M90.5 85 l-5.5 5.5M107 107 l5.5 5.5M112.5 107 l-5.5 5.5", 3, ROSA)}
          <circle cx="99" cy="99" r="3.6" fill="none" stroke="${HIMMEL}" stroke-width="3"/><circle cx="110" cy="88" r="3.6" fill="none" stroke="${HIMMEL}" stroke-width="3"/>
        </g>`,
    },

    // Minesveiperen (minesweeper): a nervous sea mine that has been flagged.
    minesveiperen: {
      farge: "#8f9bb3",
      tegn: (f) => {
        const pigger = [-135, -45, 0, 45, 90, 135, 180]
          .map((g) => {
            const lang = g === 90 ? 59 : g % 90 ? 63 : 66;
            return form(`M${rundt(44, g - 17).join(" ")} L${rundt(lang, g).join(" ")} L${rundt(44, g + 17).join(" ")}Z`, f, 4);
          })
          .join("");
        return `
          ${pigger}
          ${hode(f)}
          ${pinne("M60 22 V-6", P, 3)}
          ${form("M62 -7 L88 1 L62 10Z", ROD, 3.5)}
          ${glans("M24 58 Q24 42 34 32", 4)}
          ${kinn(80)}
          ${oyne({ y: 60, r: 11.5, dy: -3 })}
          ${strek("M28 46 Q38 40 50 38M92 46 Q82 40 70 38", 5)}
          ${strek("M46 92 Q52 87 58 92 Q64 97 70 92 Q73 89 76 91", 4.5)}
          ${form("M98 38 q8 10 0 15 q-8 -5 0 -15z", HIMMEL, 2.5)}`;
      },
    },

    // Dobleren (2048): lifts the 2048 tile over its head.
    dobleren: {
      farge: "#ffb26b",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(82)}
        ${oyne({ y: 62, dy: -4 })}
        ${strek("M28 46 Q40 40 52 46M68 46 Q80 40 92 46", 5)}
        ${form("M42 84 Q60 104 78 84Z", B, 4)}<path d="M50 94 Q60 88 70 94 Q60 101 50 94Z" fill="${ROSA}"/>
        <g transform="rotate(-4 60 10)">
          ${form("M30 -8 H90 a8 8 0 0 1 8 8 V22 a8 8 0 0 1 -8 8 H30 a8 8 0 0 1 -8 -8 V0 a8 8 0 0 1 8 -8Z", LAMPE)}
          ${tekst(60, 18, "2048", 20)}
        </g>
        <ellipse cx="22" cy="28" rx="7" ry="8.5" fill="${f}" stroke="${B}" stroke-width="4"/>
        <ellipse cx="98" cy="24" rx="7" ry="8.5" fill="${f}" stroke="${B}" stroke-width="4"/>
        ${glimt(6, 4, 7, P)}${glimt(114, -2, 6)}`,
    },

    // Slangen (snake): a friendly snake resting on its own coil, with an apple.
    slangen: {
      farge: "#6fe07a",
      tegn: (f) => `
        ${form("M104 10 C96 2 84 8 86 20 C88 32 98 34 104 30 C110 34 120 32 122 20 C124 8 112 2 104 10Z", ROD, 3.5)}
        ${pinne("M104 10 Q104 4 108 0", "#8a5a3b", 2.5)}
        ${form("M106 6 Q114 -2 120 2 Q114 10 106 6Z", "#9be15d", 2.5)}
        ${hode(f)}
        <ellipse cx="44" cy="28" rx="6" ry="4" fill="#47c056"/><ellipse cx="62" cy="22" rx="6" ry="4" fill="#47c056"/><ellipse cx="78" cy="30" rx="6" ry="4" fill="#47c056"/>
        ${oyne({ y: 52 })}
        ${rodme(70)}
        ${smil(74, 13)}
        ${pinne("M60 84 V95 M60 94 L54 101 M60 94 L66 101", ROD, 2.5)}
        ${strek("M6 90 Q2 112 30 113 Q60 115 90 111 Q112 107 113 92", 19)}
        ${strek("M6 90 Q2 112 30 113 Q60 115 90 111 Q112 107 113 92", 11, f)}
        ${form("M107.5 93 Q106 76 97 66 Q114 72 118.5 93Z", f, 4)}
        ${strek("M10 100 l4 -4M28 109 l4 -5M48 111 l4 -5M68 111 l4 -5M88 108 l4 -5M106 98 l5 -3", 3, "#47c056")}`,
    },

    // Blyanten (mini crossword): a pencil-tipped head with a small crossword.
    blyanten: {
      farge: "#ffd66e",
      tegn: (f, v) => `
        ${hode(f)}
        ${form("M25 34 L60 -9 L95 34 Q86.25 27 77.5 34 Q68.75 27 60 34 Q51.25 27 42.5 34 Q33.75 27 25 34Z", "#f8d5a4")}
        ${form("M51.1 2 L60 -9 L68.9 2 Q60 -1 51.1 2Z", "#5d5378", 3.5)}
        ${kinn(82)}
        ${oyne({ y: 60, dx: -4, dy: 4 })}
        ${form("M64 93 C64 103 72 105 75 99 C77 95 74 91 71 90Z", ROSA, 3)}
        ${strek("M46 90 Q58 98 72 89", 5)}
        <g transform="rotate(-10 22 98)">
          <rect x="4" y="80" width="36" height="36" rx="3" fill="${P}"/>
          <rect x="28" y="80" width="12" height="12" fill="${B}"/><rect x="4" y="104" width="12" height="12" fill="${B}"/>
          ${strek("M16 80 V116M28 80 V116M4 92 H40M4 104 H40", 2)}
          ${tekst(10, 101.5, ordFor(v, "kryss")[0], 9)}${tekst(22, 101.5, ordFor(v, "kryss")[1], 9)}${tekst(34, 101.5, ordFor(v, "kryss")[2], 9)}
          <rect x="4" y="80" width="36" height="36" rx="3" fill="none" stroke="${B}" stroke-width="4"/>
        </g>`,
    },

    // Ringen (18+, ring of cards): cards fanned in a ring, a party cup.
    ringen: {
      farge: "#ff8a5c",
      tegn: (f) => {
        const krans = [-72, -48, -24, 0, 24, 48, 72]
          .map(
            (v, i) =>
              `<g transform="rotate(${v} 60 64)"><rect x="49" y="-2" width="22" height="30" rx="4" fill="${i % 2 ? ROSA : P}" stroke="${B}" stroke-width="3.5"/>${
                i % 2 ? `<rect x="53.5" y="2.5" width="13" height="21" rx="2" fill="none" stroke="${P}" stroke-width="2"/>` : i % 4 ? spar(60, 9, 5) : hjerte(60, 9, 5)
              }</g>`,
          )
          .join("");
        return `
          ${krans}
          ${hode(f)}
          ${kinn(80)}
          ${oyne({ y: 58, dx: 2 })}
          ${strek("M27 42 Q40 34 52 40M68 42 Q80 38 93 44", 5.5)}
          ${form("M40 84 Q60 104 80 84Z", B, 4)}<path d="M44 86 H76 L74 90 H46Z" fill="${P}"/>
          ${form("M87 84 H117 L112 119 Q102 122 92 119Z", ROD, 4)}
          ${form("M85 80 H119 V88 H85Z", P, 3.5)}`;
      },
    },

    // Pyramiden (18+, pyramid): balancing a house of cards on its head.
    pyramiden: {
      farge: "#e6b450",
      tegn: (f) => {
        const kort = (x, y, bak) =>
          `<rect x="${x - 7}" y="${y - 8.5}" width="14" height="17" rx="2.5" fill="${bak ? ROSA : P}" stroke="${B}" stroke-width="3"/>` +
          (bak ? `<rect x="${x - 3.5}" y="${y - 5}" width="7" height="10" rx="1" fill="none" stroke="${P}" stroke-width="1.6"/>` : hjerte(x, y, 3.6));
        return `
          ${hode(f)}
          ${kort(44, 26, true)}${kort(60, 26)}${kort(76, 26, true)}
          ${kort(52, 12)}${kort(68, 12, true)}
          ${kort(60, -2, true)}
          ${kinn(84)}
          ${oyne({ y: 62, dy: -5 })}
          ${strek("M28 44 Q40 40 52 46M68 46 Q80 40 92 44", 5)}
          ${strek("M46 92 Q56 96 66 92", 5)}
          ${form("M60 94 Q66 104 72 96Z", ROSA, 3)}
          ${form("M100 44 q8 10 0 15 q-8 -5 0 -15z", HIMMEL, 2.5)}`;
      },
    },

    // Bussen (18+, ride the bus): a party bus.
    bussen: {
      farge: "#ff5577",
      tegn: (f, v) => `
        <circle cx="30" cy="110" r="11" fill="#3b3054" stroke="${B}" stroke-width="4"/><circle cx="30" cy="110" r="4" fill="${METALL}"/>
        <circle cx="90" cy="110" r="11" fill="#3b3054" stroke="${B}" stroke-width="4"/><circle cx="90" cy="110" r="4" fill="${METALL}"/>
        ${hode(f)}
        ${form("M18 60 Q18 38 40 37 H80 Q102 38 102 60 Q102 68 94 69 H26 Q18 68 18 60Z", "#c4ecff")}
        ${strek("M60 38 V68", 3)}
        ${oyne({ y: 54, x1: 39, x2: 81, r: 10.5, pr: 5 })}
        <rect x="34" y="14" width="52" height="18" rx="4" fill="${B}"/>
        ${tekst(60, 28, ordFor(v, "fest"), ordFor(v, "fest").length > 4 ? 11 : 13, LAMPE)}
        <circle cx="27" cy="84" r="7.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/><circle cx="93" cy="84" r="7.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/>
        ${form("M42 79 Q60 97 78 79Z", B, 4)}
        ${form("M30 100 H90 a5 5 0 0 1 0 10 H30 a5 5 0 0 1 0 -10Z", METALL, 3.5)}`,
    },

    // Hjulet (18+, spin the wheel): a wheel of fortune with a face on the hub.
    hjulet: {
      farge: "#56e0d0",
      tegn: (f) => {
        const FARGER = [ROSA, LAMPE, HIMMEL, "#ff8a3d", P];
        const seg = [];
        for (let i = 0; i < 10; i++) {
          const [ax, ay] = rundt(46, i * 36);
          const [bx, by] = rundt(46, (i + 1) * 36);
          const [cx, cy] = rundt(35, (i + 1) * 36);
          const [dx, dy] = rundt(35, i * 36);
          seg.push(`<path d="M${ax} ${ay} A46 46 0 0 1 ${bx} ${by} L${cx} ${cy} A35 35 0 0 0 ${dx} ${dy}Z" fill="${FARGER[i % 5]}" stroke="${B}" stroke-width="2.5" stroke-linejoin="round"/>`);
          const [px, py] = rundt(41, i * 36 + 18);
          seg.push(`<circle cx="${px}" cy="${py}" r="2" fill="${B}"/>`);
        }
        return `
          ${form("M50 100 L38 121 H82 L70 100Z", METALL)}
          ${hode(f)}
          <g class="g-spiral" style="animation-duration:14s">${seg.join("")}</g>
          <circle cx="60" cy="64" r="48" fill="none" stroke="${B}" stroke-width="5"/>
          <circle cx="60" cy="64" r="35" fill="${f}" stroke="${B}" stroke-width="4"/>
          ${rodme(73, 41, 79, 5.5, 3.6)}
          ${oyne({ y: 58, x1: 46, x2: 74, r: 10, pr: 4.8 })}
          ${form("M51 74 Q60 90 69 74Z", B, 3.5)}
          ${form("M51 2 H69 L60 24Z", ROSA, 4)}`;
      },
    },

    // Tørsten (18+, never have I ever): sipping through a bendy straw.
    torsten: {
      farge: "#c77dff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 54, dx: 4, dy: 4 })}
        ${strek("M27 36 Q38 28 50 33M70 33 Q82 28 93 36", 5.5)}
        <ellipse cx="64" cy="88" rx="7" ry="6" fill="${B}"/>
        ${pinne("M103 110 V62 L68 87", P, 4)}
        <path d="M103 110 V62 L68 87" fill="none" stroke="${ROSA}" stroke-width="4" stroke-dasharray="5 5"/>
        <path d="M85 88 H114 L110.5 116 Q99 119 88.5 116Z" fill="#ffa64d"/>
        <rect x="88" y="82" width="11" height="11" rx="2" fill="rgba(255,255,255,.75)" stroke="${B}" stroke-width="2" transform="rotate(12 93 87)"/>
        ${form("M82 72 H117 L112 118 Q99 122 87 118Z", "rgba(196,236,255,.3)", 4)}
        ${form("M114 72 a10 10 0 0 1 -16 -8 h16z", LAMPE, 3)}`,
    },

    // Julekalenderen (Advent calendar): a green calendar page in a nisse cap with a star on the tip.
    julekalenderen: {
      farge: "#4cc38a",
      tegn: (f) => {
        const stjerne = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 6 : 14;
          const v = -Math.PI / 2 + (i * Math.PI) / 5;
          stjerne.push(`${n1(104 + Math.cos(v) * r)} ${n1(4 + Math.sin(v) * r)}`);
        }
        return `
          <rect x="12" y="26" width="96" height="88" rx="18" fill="${f}" stroke="${B}" stroke-width="5"/>
          ${form("M22 36 C30 6 70 -6 98 6 Q90 16 92 30Z", "#e8414f")}
          ${form("M10 38 Q12 28 24 28 H88 Q100 28 102 38 Q100 46 88 46 H24 Q12 46 10 38Z", P, 4.5)}
          ${form(`M${stjerne.join(" L")}Z`, LAMPE, 3.5)}
          ${oyne({ y: 66, r: 11, pr: 5.2, dy: 1 })}
          ${kinn(82)}
          ${smil(84, 11)}
          <rect x="20" y="92" width="22" height="16" rx="4" fill="${P}" stroke="${B}" stroke-width="3.5"/>${tekst(31, 104.5, "1", 11, B)}
          <rect x="78" y="92" width="22" height="16" rx="4" fill="#2a1a4a" stroke="${B}" stroke-width="3.5"/>${tekst(89, 105, "★", 11, LAMPE)}
          ${form("M78 92 L70 95 V111 L78 108Z", P, 3)}`;
      },
    },

    // Firkløveren (daily word groups): a round clover head with four heart leaves peeking out,
    // one leaf in each of the game's level colours.
    firklover: {
      farge: "#7bd88f",
      tegn: (f) => {
        const blad = (x, y, v, farge) =>
          `<path transform="translate(${x} ${y}) rotate(${v}) scale(1.55)" d="M0 14 C-14 4 -20 -8 -12 -16 C-6 -21 0 -16 0 -11 C0 -16 6 -21 12 -16 C20 -8 14 4 0 14Z" fill="${farge}" stroke="${B}" stroke-width="3"/>`;
        return `
          ${blad(22, 24, -45, MYNT)}${blad(98, 24, 45, HIMMEL)}${blad(22, 104, -135, LAMPE)}${blad(98, 104, 135, ROSA)}
          ${hode(f)}
          ${strek("M60 16 Q62 8 70 4", 5)}
          ${oyne({ y: 58, r: 12, pr: 5.8, dx: 1, dy: 1 })}
          ${kinn(80)}
          ${smil(88, 15)}`;
      },
    },

    // Femmeren: a stopwatch with a face — the crown on top has caught fire like a fuse, the eyes
    // are wide and the mouth is open mid-shout («tre ting!»).
    femmeren: {
      farge: "#ffd23f",
      tegn: (f) => `
        ${strek("M66 8 Q72 -2 84 0 Q94 2 98 -6", 4.5)}
        ${glimt(100, -7, 10, ROD)}${glimt(100, -7, 5, P)}
        <rect x="50" y="4" width="20" height="13" rx="3.5" fill="${METALL}" stroke="${B}" stroke-width="4.5"/>
        <rect x="88" y="16" width="14" height="10" rx="3" fill="${METALL}" stroke="${B}" stroke-width="4" transform="rotate(40 95 21)"/>
        ${hode(f)}
        ${strek("M60 22 V29M102 64 H95M60 106 V99M18 64 H25", 4)}
        ${kinn(80)}
        ${oyne({ y: 56, r: 13, dy: -1 })}
        ${strek("M27 37 Q38 30 50 35M70 35 Q82 30 93 37", 5)}
        <ellipse cx="60" cy="86" rx="11" ry="12" fill="${B}"/>
        <ellipse cx="60" cy="92" rx="6" ry="4" fill="${ROSA}"/>`,
    },

    // Meyer (dice bluffing): a sly fellow with a leather dice cup tipped on his head like a hat,
    // one eye winking, a knowing grin — and a die peeking out under the brim.
    meyer: {
      farge: "#e85d75",
      tegn: (f) => `
        ${terning(100, 30, 13, -12)}
        ${hode(f)}
        ${kinn(80)}
        ${blunk(58, `<circle cx="40" cy="58" r="12" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="43" cy="59" r="5.5" fill="${B}"/><circle cx="41" cy="56.8" r="1.7" fill="${P}"/>`)}
        ${strek("M69 59 Q80 52 91 59", 5.5)}
        ${strek("M44 86 Q62 98 80 84", 5)}
        ${strek("M76 82 l6 1", 4)}
        <g transform="rotate(-14 56 22)">
          ${form("M32 30 L38 -6 Q56 -11 74 -6 L80 30 Q56 36 32 30Z", "#7a2338")}
          <path d="M34 20 Q56 26 78 20 L79.5 28 Q56 34 32.5 28Z" fill="#a9364f"/>
          ${strek("M35 19 Q56 25 77 19", 2.2, LAMPE)}
          ${glans("M44 2 L41 16", 3.5)}
          ${form("M37 -6 Q56 -12 75 -6 Q56 -1 37 -6Z", "#5c1a2b", 3.5)}
        </g>
        ${glimt(18, 22, 6)}`,
    },

    // Stigespillet: a round climber with a wooden ladder on one side and a pink slide curving down the other.
    stigespillet: {
      farge: "#ffb347",
      tegn: (f) => `
        ${strek("M4 116 L20 8M24 116 L40 8", 10)}${strek("M4 116 L20 8M24 116 L40 8", 4.5, "#c98b4a")}
        ${strek("M8 96 H27M11 76 H30M14 56 H33M17 36 H36M19 18 H38", 8)}${strek("M8 96 H27M11 76 H30M14 56 H33M17 36 H36M19 18 H38", 3.5, "#c98b4a")}
        ${hode(f)}
        ${glans("M28 50 Q31 32 47 23", 6)}
        ${kinn(80)}
        ${oyne({ y: 58, dx: -3, dy: -4 })}
        ${smil(88, 15)}
        ${strek("M30 38 Q40 32 50 37M70 37 Q80 32 90 38", 5)}
        ${form("M96 24 Q126 40 112 76 Q104 98 126 112 L116 120 Q90 100 100 74 Q110 46 88 32Z", ROSA)}
        ${strek("M100 34 Q116 48 107 74 Q100 94 118 110", 2.5, "rgba(255,241,221,.8)")}
        ${glimt(110, 4, 7)}`,
    },

    // Dam (draughts): a wooden piece that has reached the far row – and got its crown.
    dam: {
      farge: "#c98b5a",
      tegn: (f) => `
        ${hode(f)}
        <circle cx="60" cy="64" r="38" fill="none" stroke="rgba(23,14,43,.22)" stroke-width="3.5"/>
        <circle cx="60" cy="64" r="29" fill="none" stroke="rgba(23,14,43,.12)" stroke-width="3"/>
        ${form("M33 30 L28 4 L45 17 L60 -2 L75 17 L92 4 L87 30 Q60 22 33 30Z", LAMPE)}
        <circle cx="28" cy="4" r="4.5" fill="${ROSA}" stroke="${B}" stroke-width="3"/>
        <circle cx="60" cy="-2" r="5" fill="${ROSA}" stroke="${B}" stroke-width="3"/>
        <circle cx="92" cy="4" r="4.5" fill="${ROSA}" stroke="${B}" stroke-width="3"/>
        ${kinn(82)}
        ${oyne({ y: 60, dx: 2, dy: 1 })}
        ${smil(86, 14)}`,
    },

    // Reversi: a disc caught in the middle of turning over – half dark, half light, a little dizzy.
    reversi: {
      farge: "#7dd3a8",
      tegn: (f) => `
        ${hode(f)}
        <path d="M60 16 A48 48 0 0 0 60 112Z" fill="#5a4785"/>
        <circle cx="60" cy="64" r="48" fill="none" stroke="${B}" stroke-width="5"/>
        ${strek("M60 18 V110", 3, "rgba(23,14,43,.35)")}
        ${strek("M20 18 Q60 -10 100 18", 4.5, LAMPE)}
        ${form("M100 18 L88 16 L97 7Z", LAMPE, 3)}
        <ellipse cx="88" cy="80" rx="8" ry="5" fill="rgba(255, 79, 139, 0.32)"/>
        ${oyne({ y: 58, dx: 3, dy: -2, dx2: -3, dy2: 2 })}
        ${form("M44 84 Q60 98 76 84 Q60 90 44 84Z", P, 4)}`,
    },

    // Blokka: a round blue head balancing three little blocks on top, one of them just clicking into place.
    blokka: {
      farge: "#6c8cff",
      tegn: (f) => `
        ${hode(f)}
        ${form("M36 24 h17 v-17 h-17Z", LAMPE, 4)}
        ${form("M53 24 h17 v-17 h-17Z", ROSA, 4)}
        ${form("M53 7 h17 v-17 h-17Z", MYNT, 4)}
        ${strek("M76 -4 l5 -5 M80 4 l7 -2 M76 12 l7 2", 3, LAMPE)}
        ${kinn(80)}
        ${oyne({ y: 58, dx: 2, dy: -3 })}
        ${smil(84, 15)}`,
    },

    // Skrønemakeren: a sly storyteller with a feather quill behind the ear, one eyebrow up and a
    // little paper slip with a big question mark — is it true, or a tall tale?
    skronemakeren: {
      farge: "#b48cff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 58, dx: 4, dy: -1 })}
        ${strek("M27 38 Q38 30 50 38M70 36 Q82 40 93 34", 6)}
        ${strek("M44 90 Q56 98 78 86", 5)}
        ${form("M88 6 Q112 -2 116 10 Q106 30 92 44 Q90 26 88 6Z", "#fff1dd", 4)}
        ${strek("M90 42 L110 6M96 30 L104 26M99 22 L108 18", 2.5)}
        <g transform="rotate(-14 22 98)">
          <rect x="4" y="84" width="34" height="30" rx="3" fill="${P}" stroke="${B}" stroke-width="4"/>
          ${tekst(21, 108, "?", 24, "#7a4fd6")}
        </g>
        ${glimt(16, 20, 6)}`,
    },

    // Vri åtter: a lively red fellow who has just turned a big eight on its side to change the colour.
    vriatter: {
      farge: "#ff6b6b",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 56, dx: 4, dy: 2 })}
        ${strek("M28 38 Q40 31 52 37M68 35 Q80 29 92 34", 5)}
        ${form("M44 84 Q60 100 78 82Z", B, 4)}<path d="M52 91 Q61 87 70 89 Q62 96 52 91Z" fill="${ROSA}"/>
        <g transform="rotate(-18 96 104)">
          <rect x="80" y="80" width="32" height="44" rx="5" fill="${P}" stroke="${B}" stroke-width="4"/>
          ${tekst(96, 110, "8", 26, ROD)}
          ${hjerte(87, 89, 3.5)}
        </g>
        ${strek("M8 40 Q2 22 16 10", 4, LAMPE)}${form("M10 6 L20 9 L13 17Z", LAMPE, 3)}
        ${vifte(22, 122, [[-20, spar(22, 102, 5)], [4, hjerte(22, 102, 5, ROSA)]])}
        ${glimt(108, 18, 7)}`,
    },

    // Hatten: a round fellow under a tall hat, with paper slips flying out of it.
    hatten: {
      farge: "#ffb347",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(82)}
        ${oyne({ y: 64, dx: 2, dy: -3 })}
        ${smil(90, 13)}
        <g transform="rotate(-24 14 22)"><rect x="1" y="12" width="26" height="17" rx="2.5" fill="${P}" stroke="${B}" stroke-width="3.5"/>${strek("M7 18.5 H21M7 23.5 H16", 2.5)}</g>
        <g transform="rotate(18 106 14)"><rect x="93" y="4" width="26" height="17" rx="2.5" fill="${P}" stroke="${B}" stroke-width="3.5"/>${strek("M99 10.5 H113M99 15.5 H108", 2.5)}</g>
        <g transform="rotate(-6 60 30)">
          ${form("M38 34 L41 -4 H79 L82 34 Z", "#46327a")}
          <path d="M39.5 22 H80.5 L81.3 31 H38.7Z" fill="${ROSA}"/>
          ${glans("M47 2 L45.5 16", 3.5)}
          ${form("M16 36 Q60 26 104 36 Q60 47 16 36Z", "#46327a")}
        </g>
        ${glimt(30, 6, 6)}`,
    },


    // Skilpadda: a jade-green turtle in its patterned shell, balancing the top of a tile pyramid on
    // its back – two tiles below, one on top, the way the classic turtle layout ends.
    skilpadda: {
      farge: "#34b892",
      tegn: (f) => `
        ${hode(f)}
        ${form("M13 58 Q8 12 60 8 Q112 12 107 58 Q86 46 60 46 Q34 46 13 58Z", "#1f7a5c")}
        ${strek("M45 20 L60 15 L75 20 L77 34 L60 40 L43 34Z", 3, "rgba(255,241,221,.5)")}
        ${strek("M43 34 L22 46M77 34 L98 46M45 20 L31 15M75 20 L89 15M60 40 V46", 3, "rgba(255,241,221,.5)")}
        <rect x="47" y="7" width="14" height="17" rx="3" fill="#b89462" stroke="${B}" stroke-width="3.2"/>
        <rect x="63" y="7" width="14" height="17" rx="3" fill="#b89462" stroke="${B}" stroke-width="3.2"/>
        <rect x="44" y="4" width="14" height="17" rx="3" fill="${P}" stroke="${B}" stroke-width="3.2"/>
        <rect x="60" y="4" width="14" height="17" rx="3" fill="${P}" stroke="${B}" stroke-width="3.2"/>
        <circle cx="51" cy="12.5" r="3.4" fill="none" stroke="#1f66a8" stroke-width="2.3"/>
        <rect x="65.4" y="7.5" width="3.2" height="10" rx="1.5" fill="#0f6e54"/>
        <rect x="55" y="-5" width="14" height="17" rx="3" fill="#b89462" stroke="${B}" stroke-width="3.2"/>
        <rect x="52" y="-8" width="14" height="17" rx="3" fill="${P}" stroke="${B}" stroke-width="3.2"/>
        <path d="M54.6 4.6 54 -2.6l3 2.7L59 -4.2l2 4.3 3-2.7-.6 7.2Z" fill="#b3202a"/>
        ${kinn(84)}
        ${oyne({ y: 66, dx: 2, dy: -2 })}
        ${smil(92, 13)}
        ${glimt(104, 4, 7)}`,
    },

    // Stjernekikkeren: a round periwinkle head squinting through a brass telescope, one big eye open
    // to the sky and two little stars twinkling above.
    stjernekikkeren: {
      farge: "#7d8cff",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(82)}
        ${blunk(56, `<circle cx="40" cy="56" r="12" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="43" cy="52.5" r="5.5" fill="${B}"/><circle cx="41" cy="50.3" r="1.7" fill="${P}"/>`)}
        ${strek("M67 58 Q79 51 91 58", 5)}
        ${smil(88, 13)}
        ${form("M74.9 53.2 L106.9 19.2 L117.1 28.8 L85.1 62.8Z", MESSING, 4.5)}
        ${form("M99 24.6 L105.5 17.8 L118.6 30.2 L112.2 37Z", METALL, 4)}
        ${glans("M84 50 L102 31", 3)}
        ${glimt(22, 14, 9)}
        ${glimt(46, -3, 6, P)}`,
    },

    // Sebraen: a round zebra head – cream with ink stripes, a striped mane on top and two pricked
    // ears – holding a black dot and a white ring like a pair of spectacles.
    sebraen: {
      farge: "#f2ecff",
      tegn: (f) => `
        ${form("M30 26 L22 0 L44 18Z", f, 4.5)}
        ${form("M90 26 L98 0 L76 18Z", f, 4.5)}
        ${hode(f)}
        ${strek("M30 34 Q40 44 34 58M90 34 Q80 44 86 58M22 76 Q34 74 36 86M98 76 Q86 74 84 86", 6)}
        ${form("M46 18 Q50 4 56 16 Q60 2 64 16 Q70 4 74 18 Q60 24 46 18Z", B, 4)}
        ${kinn(84)}
        <circle cx="40" cy="58" r="15" fill="${B}" stroke="${B}" stroke-width="4"/>
        <circle cx="80" cy="58" r="15" fill="#fff" stroke="${B}" stroke-width="6"/>
        ${strek("M55 58 H65", 4)}
        <circle cx="40" cy="58" r="5" fill="${P}"/>
        <circle cx="80" cy="58" r="5.5" fill="${B}"/>
        ${smil(92, 12)}`,
    },

    // Nøstet: a round pink ball of yarn with wound strands across it, happy eyes, and a loose
    // thread curling away to a knitting needle with a little sewing button on it.
    nostet: {
      farge: "#ff8fb8",
      tegn: (f) => `
        ${hode(f)}
        ${strek("M18 46 Q60 24 102 46M14 66 Q60 46 106 66M22 88 Q60 70 98 88", 3.5, "rgba(23,14,43,.35)")}
        ${strek("M40 20 Q30 64 44 108M80 20 Q92 64 76 108", 3.5, "rgba(23,14,43,.35)")}
        ${kinn(80)}
        ${gladeOyne(60)}
        ${smil(84, 12)}
        ${pinne("M100 96 Q118 104 112 116 Q104 124 96 116", ROSA, 4)}
        ${pinne("M84 -6 L116 26", METALL, 4)}
        <circle cx="116" cy="26" r="4" fill="${LAMPE}" stroke="${B}" stroke-width="3"/>
        <circle cx="24" cy="18" r="8" fill="${P}" stroke="${B}" stroke-width="3.5"/>
        <circle cx="21.5" cy="18" r="1.5" fill="${B}"/><circle cx="26.5" cy="18" r="1.5" fill="${B}"/>`,
    },
  };

  // Fallback for a game whose mascot is not drawn yet: the standard head with the first letter on
  // the forehead. Only fills ids missing from FIGURER (all of these are drawn above now), so a new
  // game can be listed here first and get its real design later.
  const plassholder = (farge, bokstav) => ({
    farge,
    plassholder: true,
    tegn: (f) => `${hode(f)}${kinn(82)}${oyne({ y: 60 })}${smil(90, 14)}${tekst(60, 40, bokstav, 22, B)}`,
  });
  const NYE = {
    ordugla: ["#d99a5e", "O"],
    nissen: ["#f2545b", "N"],
    terninga: ["#f4f0ff", "T"],
    tidsmaskinen: ["#5ad1ff", "T"],
    tieren: ["#ffb347", "10"],
    admiralen: ["#4f7dff", "A"],
    ballongen: ["#ff6fb5", "B"],
    nynneren: ["#b48cff", "♪"],
    papegoyen: ["#53d769", "P"],
    bingoballen: ["#ffd23f", "B"],
    brikka: ["#ff7a45", "F"],
    verktoykassa: ["#9aa9c2", "V"],
    kortkongen: ["#ff4f6b", "K"],
    tallknuseren: ["#7fd6c2", "9"],
    sjakkhesten: ["#c9b28f", "S"],
    fireren: ["#ffcf3f", "4"],
    bonden: ["#a3d977", "X"],
    minesveiperen: ["#8f9bb3", "M"],
    dobleren: ["#ffb26b", "2"],
    slangen: ["#6fe07a", "S"],
    blyanten: ["#ffd66e", "B"],
    ringen: ["#ff8a5c", "R"],
    pyramiden: ["#e6b450", "P"],
    bussen: ["#ff5577", "B"],
    hjulet: ["#56e0d0", "H"],
    torsten: ["#c77dff", "T"],
    // Part 3 (rusj/SPILL3.md): placeholders until each game's own drawing is merged.
    hatten: ["#ffb347", "H"],
    femmeren: ["#ffd23f", "5"],
    meyer: ["#e85d75", "M"],
    firklover: ["#7bd88f", "F"],
    dam: ["#c98b5a", "D"],
    reversi: ["#7dd3a8", "R"],
    vriatter: ["#ff6b6b", "8"],
    stigespillet: ["#ffb347", "S"],
    blokka: ["#6c8cff", "B"],
    skronemakeren: ["#b48cff", "S"],
    // Part 4 (rusj/SPILL4.md)
    skilpadda: ["#34b892", "S"],
    stjernekikkeren: ["#7d8cff", "S"],
    sebraen: ["#f2ecff", "Z"],
    nostet: ["#ff8fb8", "N"],
    samleren: ["#4fb8f0", "S"],
  };
  for (const [id, [farge, bokstav]] of Object.entries(NYE)) if (!FIGURER[id]) FIGURER[id] = plassholder(farge, bokstav);

  const REKKEFOLGE = Object.keys(FIGURER);

  function svg(id, valg) {
    valg = valg || {};
    const fig = FIGURER[id];
    if (!fig) throw new Error("Ukjent figur: " + id);
    const klasse = "figur figur-" + id + (valg.klasse ? " " + valg.klasse : "");
    const tittel = valg.tittel ? `<title>${valg.tittel}</title>` : "";
    const aria = valg.tittel ? 'role="img"' : 'aria-hidden="true" focusable="false"';
    return `<svg class="${klasse}" viewBox="-6 -10 132 132" ${aria}>${tittel}${fig.tegn(fig.farge, valg)}</svg>`;
  }

  // Standalone SVG file (icons, share images): needs the xmlns attribute.
  function fil(id, valg) {
    return svg(id, valg).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  }

  // ---------- The rusj wordmark ----------
  // Lowercase strokes in the same two-layer style as the Luringen logo; the dot on the j is
  // "klatten" (the slush blob), the brand's signature shape.
  const MYNTE = "#3de3b0";
  const KLATT = "M0 -11 C7 -12 12 -6 11 1 C10 8 5 12 -1 11 C-8 10 -12 5 -11 -2 C-10 -8 -6 -10 0 -11Z";
  function logo(valg) {
    valg = valg || {};
    const bokstaver = [
      ["M0 44V2M0 20Q3 1 27 2", 27],
      ["M0 0V22A18 18 0 0 0 36 22V0M36 22V44", 36],
      ["M30 7C27 2 20 0 15 0C7 0 2 5 2 12C2 26 30 18 30 32C30 40 23 44 15 44C9 44 3 41 0 37", 30],
      ["M8 0V54C8 66 -2 70 -12 64", 8],
    ];
    let x = 0;
    let stier = "";
    const mellom = 24;
    let jX = 0;
    bokstaver.forEach(([d, bredde], i) => {
      stier += `<path transform="translate(${x} 0)" d="${d}"/>`;
      if (i === 3) jX = x + 8;
      x += bredde + mellom;
    });
    const b = x - mellom;
    const klatt = (dx, dy, farge, klasse) =>
      `<path class="${klasse}" transform="translate(${jX + dx} ${-24 + dy})" d="${KLATT}" fill="${farge}"/>`;
    const fill = valg.farger !== false;
    const bak = fill ? ` stroke="${ROSA}"` : "";
    const forran = fill ? ` stroke="${LAMPE}"` : "";
    const xmlns = valg.fil ? ' xmlns="http://www.w3.org/2000/svg"' : "";
    const aria = valg.tittel ? `role="img" aria-label="${valg.tittel}"` : 'aria-hidden="true" focusable="false"';
    return `<svg${xmlns} class="rusj-logo ${valg.klasse || ""}" viewBox="-14 -44 ${b + 36} 128" ${aria}>
      <g class="logo-bak" fill="none"${bak} stroke-width="14" stroke-linecap="round" stroke-linejoin="round" transform="translate(5 7)">${stier}</g>
      ${klatt(5, 7, fill ? ROSA : "currentColor", "logo-klatt-bak")}
      <g class="logo-for" fill="none"${forran} stroke-width="14" stroke-linecap="round" stroke-linejoin="round">${stier}</g>
      ${klatt(0, 0, fill ? MYNTE : "currentColor", "logo-klatt")}
    </svg>`;
  }

  return {
    svg: svg,
    fil: fil,
    logo: logo,
    klatt: KLATT,
    farge: (id) => (FIGURER[id] ? FIGURER[id].farge : ROSA),
    finnes: (id) => !!FIGURER[id],
    alle: REKKEFOLGE,
  };
});
