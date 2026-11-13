// alias: ["#4fc97a", "G"]
    // Golfballen: a dimpled golf ball in a green flat cap, holding a little flag – and a card,
    // because this golf is played with cards.
    golfballen: {
      farge: "#4fc97a",
      tegn: (f) => `
        ${hode("#f7f3ea")}
        <g fill="${B}" fill-opacity=".1">
          <circle cx="24" cy="66" r="4"/><circle cx="20" cy="82" r="3.6"/><circle cx="30" cy="96" r="3.6"/>
          <circle cx="96" cy="66" r="4"/><circle cx="100" cy="82" r="3.6"/><circle cx="90" cy="96" r="3.6"/>
          <circle cx="44" cy="100" r="3"/><circle cx="76" cy="100" r="3"/><circle cx="60" cy="106" r="3"/>
          <circle cx="60" cy="72" r="2.6"/><circle cx="50" cy="40" r="3"/><circle cx="70" cy="40" r="3"/>
        </g>
        ${form("M15 46 Q14 12 60 10 Q104 12 103 42 Q60 30 15 46Z", f)}
        ${form("M74 40 Q102 30 118 40 Q104 50 78 48Z", "#2f9a55", 4)}
        <circle cx="60" cy="13" r="4.5" fill="#2f9a55" stroke="${B}" stroke-width="3"/>
        ${strek("M30 34 Q46 24 64 24", 3, "rgba(255,241,221,.55)")}
        ${kinn(80)}
        ${oyne({ y: 62, dx: 2, dy: 1 })}
        ${smil(84, 15)}
        ${pinne("M8 116 L8 70", "#fff1dd", 2.5)}
        ${form("M10 70 L30 76 L10 84Z", ROD, 3.2)}
        ${vifte(104, 124, [[12, `${tekst(104, 98, "2", 14, ROD)}${hjerte(104, 107, 4.5)}`]])}`,
    },
