// alias: ["#3fb6c8", "D"]
    // Dobbelsekseren: a teal face wearing the double six as a tilted hat – an ivory tile with six
    // pips on each half – and a winking grin.
    dobbelsekseren: {
      farge: "#3fb6c8",
      tegn: (f) => `
        ${hode(f)}
        <g transform="rotate(-10 60 14)">
          <rect x="30" y="1" width="60" height="28" rx="6" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          ${strek("M60 5 V25", 2.5, "rgba(23,14,43,.55)")}
          ${[[38, 8], [46, 8], [54, 8], [38, 22], [46, 22], [54, 22], [66, 8], [74, 8], [82, 8], [66, 22], [74, 22], [82, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${B}"/>`).join("")}
        </g>
        ${rodme(80)}
        ${blunk(60, `<circle cx="40" cy="58" r="12" fill="${P}" stroke="${B}" stroke-width="4.5"/><circle cx="42" cy="59" r="5.5" fill="${B}"/><circle cx="40" cy="56.8" r="1.7" fill="${P}"/>${strek("M69 58 Q80 50 91 58", 5.5)}`)}
        ${strek("M44 86 Q60 100 78 84", 5)}`,
    },
