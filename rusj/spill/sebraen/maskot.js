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
// alias: ["#f2ecff", "Z"]
