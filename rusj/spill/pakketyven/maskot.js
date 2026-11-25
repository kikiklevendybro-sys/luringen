    // Pakketyven: a cheerful little thief – knitted cap, a mask over the eyes that look to the
    // side, a pleased smirk – already hugging a wrapped parcel with a big bow.
    pakketyven: {
      farge: "#ff6b5e",
      tegn: (f) => `
        ${hode(f)}
        ${form("M15 50 Q12 8 60 8 Q108 8 105 50 Q60 34 15 50Z", "#3b2a6b", 5)}
        ${strek("M21 31 Q60 15 99 31", 6, P)}
        ${form("M11 46 Q60 29 109 46 L108 57 Q60 41 12 57Z", P, 4.5)}
        <circle cx="60" cy="5" r="8" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        ${form("M13 61 Q60 49 107 61 L105 79 Q84 73 60 80 Q36 73 15 79Z", B, 3)}
        ${oyne({ y: 67, x1: 41, x2: 79, r: 9.5, pr: 4.8, dx: 3.5, dy: 0.5 })}
        ${kinn(89)}
        ${strek("M45 95 Q57 103 70 92", 5)}
        ${strek("M70 92 Q73 90 73 87", 4)}
        ${form("M70 97 L111 91 L115 119 L74 122Z", LAMPE, 4.5)}
        ${form("M88 94.4 L97 93.1 L101 120.8 L92 121.5Z", MYNT, 3)}
        ${form("M92 93 Q78 78 76 88 Q77 95 92 93Z", MYNT, 3.5)}
        ${form("M92 93 Q100 74 110 82 Q112 90 92 93Z", MYNT, 3.5)}
        <circle cx="92" cy="92" r="4" fill="${MYNT}" stroke="${B}" stroke-width="3"/>
        <circle cx="70" cy="107" r="7.5" fill="${f}" stroke="${B}" stroke-width="4"/>
        ${glimt(110, 62, 6)}
        ${glimt(9, 96, 4.5)}`,
    },
// alias: ["#ff6b5e", "P"]
