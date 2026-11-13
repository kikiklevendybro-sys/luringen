    // Såmannen: a round leaf-green head with a little sprout growing on top, a happy squint and
    // rosy cheeks, and a sack of marbles at the side with three coloured ones rolling out of it.
    samannen: {
      farge: "#7fcf6a",
      tegn: (f) => `
        ${pinne("M60 18 Q58 8 62 -2", "#3f9a3a", 4)}
        ${form("M61 4 Q72 -10 88 -4 Q78 10 61 4Z", "#9be07a", 3.5)}
        ${form("M60 8 Q48 -4 34 2 Q44 14 60 8Z", "#9be07a", 3.5)}
        ${hode(f)}
        ${rodme(80)}
        ${gladeOyne(60)}
        ${smil(86, 14)}
        ${form("M92 86 Q84 100 90 112 Q104 120 118 112 Q124 98 114 86 Q110 80 104 84 Q98 80 92 86Z", "#d9a066", 4)}
        ${strek("M94 88 Q104 92 114 87", 3, B)}
        <circle cx="86" cy="118" r="5" fill="${ROSA}" stroke="${B}" stroke-width="2.5"/>
        <circle cx="76" cy="114" r="4.5" fill="${LAMPE}" stroke="${B}" stroke-width="2.5"/>
        <circle cx="100" cy="76" r="4.5" fill="${HIMMEL}" stroke="${B}" stroke-width="2.5"/>`,
    },
// alias: ["#7fcf6a", "S"]
