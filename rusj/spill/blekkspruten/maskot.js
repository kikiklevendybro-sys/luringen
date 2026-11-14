// alias: ["#c08cff", "B"]
    // Blekkspruten: a lilac octopus with a round dome of a head and four curly arms; one arm holds
    // up a little squared card with inked squares – the picture it is painting.
    blekkspruten: {
      farge: "#c08cff",
      tegn: (f) => `
        ${strek("M30 86 Q12 98 20 110 Q27 118 34 108", 15)}${strek("M30 86 Q12 98 20 110 Q27 118 34 108", 8, f)}
        ${strek("M48 94 Q40 108 50 116", 15)}${strek("M48 94 Q40 108 50 116", 8, f)}
        ${strek("M72 94 Q80 108 70 116", 15)}${strek("M72 94 Q80 108 70 116", 8, f)}
        ${strek("M94 84 Q122 80 116 44", 15)}${strek("M94 84 Q122 80 116 44", 8, f)}
        <g transform="rotate(-12 110 28) translate(8 4)">
          <rect x="86" y="8" width="32" height="32" rx="4" fill="${P}" stroke="${B}" stroke-width="3.5"/>
          <path d="M94 16h8v8h-8zM102 24h8v8h-8zM94 32h8v4h-8z" fill="${B}"/>
          ${strek("M94 16h16v16h-16zM102 16v16M94 24h16", 1.2, "rgba(23,14,43,.35)")}
        </g>
        <path d="M16 74 Q12 16 60 14 Q108 16 104 74 Q102 96 60 96 Q18 96 16 74Z" fill="${f}" stroke="${B}" stroke-width="5"/>
        ${glans("M34 30 Q42 22 52 21", 5)}
        ${kinn(74)}
        ${oyne({ y: 56, r: 11, dx: 3, dy: -2 })}
        ${smil(78, 12)}`,
    },
