// alias: ["#f2b84b", "L"]
    // Låsesmeden: a brass padlock with a face, its shackle up, holding a big old key in one hand –
    // and three coloured pegs (a circle, a square, a triangle) on its belly plate.
    lasesmeden: {
      farge: "#f2b84b",
      tegn: (f) => `
        ${strek("M30 46 V30 Q30 6 60 6 Q90 6 90 30 V46", 17)}${strek("M30 46 V30 Q30 6 60 6 Q90 6 90 30 V46", 9, METALL)}
        ${form("M14 46 Q14 40 20 40 H100 Q106 40 106 46 V100 Q106 114 92 114 H28 Q14 114 14 100Z", f, 5)}
        ${glans("M24 52 V74", 5)}
        ${kinn(80)}
        ${oyne({ y: 64, r: 11, dx: -2, dy: 1 })}
        ${smil(80, 11)}
        <rect x="34" y="92" width="52" height="16" rx="6" fill="${B}"/>
        <circle cx="44" cy="100" r="4.6" fill="${ROD}"/>
        <rect x="55.5" y="95.5" width="9" height="9" rx="1.6" fill="${HIMMEL}"/>
        <path d="M76 95 L81 104 H71Z" fill="${LAMPE}"/>
        <g transform="rotate(-28 112 70)">
          ${pinne("M100 72 H126", MESSING, 4)}
          <circle cx="98" cy="72" r="7" fill="${MESSING}" stroke="${B}" stroke-width="3.5"/>
          <circle cx="98" cy="72" r="2.4" fill="${B}"/>
          ${strek("M118 72 V79M124 72 V78", 3.5)}
        </g>`,
    },
