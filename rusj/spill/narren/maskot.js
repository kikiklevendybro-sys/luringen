// alias: ["#a77bff", "N"]
    // Narren: a purple court jester with a cheeky grin under a three-pointed fool's cap with bells,
    // holding two cards – the one who is left with cards at the end.
    narren: {
      farge: "#a77bff",
      tegn: (f) => `
        ${hode(f)}
        ${form("M20 40 Q10 22 -1 10 Q22 8 42 26Z", ROSA)}
        ${form("M40 28 Q48 4 60 -6 Q72 4 80 28Z", LAMPE)}
        ${form("M78 26 Q98 8 121 10 Q110 22 100 40Z", ROSA)}
        <circle cx="-1" cy="10" r="5.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.2"/>
        <circle cx="60" cy="-6" r="5.5" fill="${P}" stroke="${B}" stroke-width="3.2"/>
        <circle cx="121" cy="10" r="5.5" fill="${LAMPE}" stroke="${B}" stroke-width="3.2"/>
        ${form("M15 46 Q60 22 105 46 L103 36 Q60 12 17 36Z", LAMPE, 3.8)}
        <path d="M38 33 l4 -5 4 5 -4 5Z M56 27 l4 -5 4 5 -4 5Z M74 33 l4 -5 4 5 -4 5Z" fill="${ROSA}"/>
        ${kinn(80)}
        ${oyne({ y: 62, dx: 3, dy: 1 })}
        ${strek("M28 46 Q40 41 51 47M69 45 Q80 39 92 44", 4.5)}
        ${form("M40 82 Q60 104 80 82 Q60 90 40 82Z", B, 3.5)}<path d="M50 89 Q60 93 70 89 Q62 98 50 89Z" fill="${ROSA}"/>
        ${vifte(100, 124, [[-16, spar(100, 104, 5)], [10, hjerte(100, 104, 5, ROSA)]])}
        ${glimt(10, 92, 6)}`,
    },
