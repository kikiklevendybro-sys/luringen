// alias: ["#ff86c8", "M"]
    // Maneten: a pink jellyfish whose head is the bell – a lighter dome on top, a frilled rim and
    // four wavy tentacles below, swimming up with a trail of bubbles.
    maneten: {
      farge: "#ff86c8",
      tegn: (f) => `
        ${hode(f)}
        <path d="M17 58 Q20 20 60 18 Q100 20 103 58 Q86 42 60 42 Q34 42 17 58Z" fill="#ffb3dc"/>
        ${glans("M34 34 Q44 26 56 25", 4.5)}
        ${oyne({ y: 58, dx: 2, dy: -2 })}
        ${kinn(74)}
        ${smil(76, 11)}
        ${pinne("M36 96 Q28 106 36 113 Q43 119 36 124", "#ffc4e4", 3.5)}
        ${pinne("M52 99 Q58 108 51 115 Q45 121 51 125", "#ffc4e4", 3.5)}
        ${pinne("M68 99 Q62 108 69 115 Q75 121 69 125", "#ffc4e4", 3.5)}
        ${pinne("M84 96 Q92 106 84 113 Q77 119 84 124", "#ffc4e4", 3.5)}
        ${form("M13 86 Q19 99 28 90 Q35 102 44 92 Q52 104 60 93 Q68 104 76 92 Q85 102 92 90 Q101 99 107 86 Q60 101 13 86Z", "#ffc4e4", 4)}
        <circle cx="108" cy="22" r="6" fill="none" stroke="${P}" stroke-width="3"/>
        <circle cx="116" cy="4" r="4" fill="none" stroke="${P}" stroke-width="2.5"/>
        <circle cx="104" cy="-4" r="2.6" fill="none" stroke="${P}" stroke-width="2"/>
        ${glimt(12, 14, 6)}`,
    },
