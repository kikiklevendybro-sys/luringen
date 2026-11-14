    // Bobla: a round soap-bubble head in light sky blue with a big shine at the top left, a rainbow
    // sheen along the lower right edge, two little bubbles floating off and a delighted open smile.
    bobla: {
      farge: "#7fd8ff",
      tegn: (f) => `
        ${hode(f)}
        ${strek("M98 84 Q92 100 76 108", 4.5, "rgba(255,79,139,.75)")}
        ${strek("M103 72 Q101 86 95 96", 4, "rgba(255,210,63,.9)")}
        ${glans("M24 50 Q26 28 46 20", 6)}
        ${glans("M30 60 Q30 56 31 53", 4)}
        <circle cx="103" cy="12" r="11" fill="rgba(191,236,255,.75)" stroke="${B}" stroke-width="3.5"/>
        ${glans("M97 9 Q98 5 102 4", 2.5)}
        <circle cx="117" cy="-3" r="5.5" fill="rgba(191,236,255,.75)" stroke="${B}" stroke-width="3"/>
        ${rodme(80)}
        ${oyne({ y: 58, dx: 2, dy: -3 })}
        <path d="M45 84 Q60 104 75 84Z" fill="${B}" stroke="${B}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M52 93 Q60 99 68 93 Q60 90 52 93Z" fill="${ROSA}"/>`,
    },
// alias: ["#7fd8ff", "B"]
