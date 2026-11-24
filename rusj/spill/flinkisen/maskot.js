    // Flinkisen: the keen pupil who always has the answer – one arm stretched straight up behind
    // the head, round glasses with the eyes on the teacher, a wide open smile and a gold star
    // stuck on the forehead.
    flinkisen: {
      farge: "#4cc9b0",
      tegn: (f) => `
        ${form("M88 56 Q84 26 92 12 Q99 0 108 7 Q116 14 113 32 Q111 46 106 58Z", f)}
        ${strek("M98 9 V19M105 9 V18", 3)}
        ${strek("M116 6 l5 -5M119 16 h7", 3.5, LAMPE)}
        ${hode(f)}
        ${rodme(82)}
        ${oyne({ y: 58, r: 11, pr: 5, dx: 1.5, dy: -2.5 })}
        <circle cx="40" cy="58" r="15.5" fill="rgba(255,241,221,.2)" stroke="${B}" stroke-width="4.5"/>
        <circle cx="80" cy="58" r="15.5" fill="rgba(255,241,221,.2)" stroke="${B}" stroke-width="4.5"/>
        ${strek("M55.5 56 Q60 52 64.5 56", 4.5)}
        ${strek("M28 38 Q40 32 50 38M70 38 Q80 32 92 38", 5)}
        <path d="M44 86 Q60 106 76 86Z" fill="#7a2338" stroke="${B}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M52 95 Q60 90 68 95 Q60 101 52 95Z" fill="${ROSA}"/>
        <path d="M24 5 L27.4 13.3 L36.4 14 L29.6 19.8 L31.6 28.5 L24 23.9 L16.4 28.5 L18.4 19.8 L11.6 14 L20.6 13.3Z" fill="${LAMPE}" stroke="${B}" stroke-width="3.5" stroke-linejoin="round"/>`,
    },
// alias: ["#4cc9b0", "F"]
