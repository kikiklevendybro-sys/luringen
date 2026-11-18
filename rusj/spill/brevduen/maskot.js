    // Brevduen («Hvem skrev det?»): a round, soft-blue carrier pigeon with a little tuft, a shimmering
    // purple-and-mint neck ring and one wing tucked in – holding a sealed letter in its beak.
    brevduen: {
      farge: "#8fb8ff",
      tegn: (f) => `
        ${form("M54 20 Q50 4 62 0 Q60 10 68 17Z", f, 4)}
        ${form("M12 60 Q-4 72 2 96 Q18 94 26 78Z", "#6f98e8", 4)}
        ${hode(f)}
        ${glans("M24 56 Q24 38 38 28", 4.5)}
        ${form("M18 90 Q60 112 102 90 Q100 102 92 108 Q60 122 28 108 Q20 102 18 90Z", "#8a6cf0", 4)}
        ${strek("M28 100 Q60 116 92 100", 3.2, MYNT)}
        ${kinn(74)}
        ${oyne({ y: 52, x1: 40, x2: 78, r: 11, dx: 2, pr: 5.2 })}
        <g transform="rotate(-10 84 86)">
          ${form("M64 74 H104 V100 H64Z", P, 3.6)}
          ${strek("M64 74 L84 89 L104 74", 3)}
          <circle cx="84" cy="90" r="5" fill="${ROSA}" stroke="${B}" stroke-width="2.4"/>
        </g>
        ${form("M50 64 Q60 58 70 64 L60 80Z", "#ffb23a", 4)}`,
    },
// alias: ["#8fb8ff", "B"]
