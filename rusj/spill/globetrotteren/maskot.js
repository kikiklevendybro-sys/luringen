// alias: ["#58a6ff", "G"]
    // Globetrotteren: a round blue globe with green continents, a jaunty red travel cap and a
    // little red pennant on a pole – off to see the world.
    globetrotteren: {
      farge: "#58a6ff",
      tegn: (f) => `
        ${pinne("M114 114 V16", METALL, 3.5)}
        ${form("M114 16 L127 23 L114 30Z", ROD, 3.2)}
        ${hode(f)}
        ${form("M28 36 Q40 26 54 30 Q60 40 50 46 Q46 56 36 54 Q24 50 28 36Z", MYNT, 3.5)}
        ${form("M74 86 Q86 78 96 84 Q100 96 90 104 Q78 108 74 98Z", MYNT, 3.5)}
        ${form("M16 72 Q22 66 26 74 Q24 84 16 82Z", MYNT, 3)}
        ${strek("M14 64 Q60 76 106 64", 2.5, "rgba(23,14,43,.25)")}
        <g transform="rotate(-10 60 24)">
          ${form("M30 30 Q34 0 62 -2 Q90 0 92 30Z", ROD, 4.5)}
          ${strek("M44 6 Q56 2 68 4", 3, "rgba(255,241,221,.6)")}
          ${form("M20 32 Q60 20 104 30 Q108 38 100 38 Q60 30 24 40 Q14 40 20 32Z", LAMPE, 4)}
        </g>
        ${kinn(82)}
        ${oyne({ y: 62, r: 11, dx: 2, dy: -1 })}
        ${smil(84, 13)}`,
    },
