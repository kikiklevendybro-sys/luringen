    // Hopperen: a round apricot head caught mid-hop, two motion arcs behind it, eyes wide with
    // excitement and a big open smile; three coloured pegs bounce along beside it, and a little
    // six-pointed star (the board) waits below.
    hopperen: {
      farge: "#ffb74d",
      tegn: (f) => `
        ${strek("M6 70 Q4 46 18 30", 4, "rgba(255,241,221,.55)")}
        ${strek("M-2 82 Q-6 56 8 36", 3, "rgba(255,241,221,.35)")}
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 58, dy: -3, r: 13 })}
        ${form("M44 84 Q60 104 76 84 Q60 90 44 84Z", B, 3)}
        <path d="M14 96 L17 102 L24 102 L19 107 L21 114 L14 110 L7 114 L9 107 L4 102 L11 102Z" fill="${LAMPE}" stroke="${B}" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="98" cy="22" r="6" fill="${ROSA}" stroke="${B}" stroke-width="3"/>
        <circle cx="111" cy="38" r="5" fill="${HIMMEL}" stroke="${B}" stroke-width="3"/>
        <circle cx="114" cy="56" r="4.5" fill="${MYNT}" stroke="${B}" stroke-width="3"/>`,
    },
// alias: ["#ffb74d", "H"]
