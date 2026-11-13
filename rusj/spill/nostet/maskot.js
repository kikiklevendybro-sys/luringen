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
// alias: ["#ff8fb8", "N"]
