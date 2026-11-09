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
  const tekst = (x, y, t, s = 16, f = B, rot = 0) =>
    `<text x="${x}" y="${y}" font-family="ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold',system-ui,sans-serif" font-weight="900" font-size="${s}" text-anchor="middle" fill="${f}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}>${t}</text>`;

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

    besserwisseren: {
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
  };

  // Placeholders for new games until their real mascot is drawn: the standard head with the
  // first letter on the forehead. (Replace each entry with a real design.)
  const plassholder = (farge, bokstav) => ({
    farge,
    plassholder: true,
    tegn: (f) => `${hode(f)}${kinn(82)}${oyne({ y: 60 })}${smil(90, 14)}${tekst(60, 40, bokstav, 22, B)}`,
  });
  const NYE = {
    ordugla: ["#e8c547", "O"],
    nissen: ["#ff5a4e", "N"],
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
