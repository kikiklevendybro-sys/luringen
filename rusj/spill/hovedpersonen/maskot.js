    // Hovedpersonen: a warm coral face in front of a tall wooden chair back, a spotlight sparkle on
    // each side and a big grin – the one in the hot seat, ready for the next question.
    hovedpersonen: {
      farge: "#ff7a59",
      tegn: (f) => `
        ${form("M8 6 Q60 -8 112 6 L110 24 Q60 10 10 24Z", "#b8743c", 4.5)}
        ${form("M12 18 H26 V116 H12Z", "#a4622e", 4.5)}${form("M94 18 H108 V116 H94Z", "#a4622e", 4.5)}
        ${glans("M18 8 Q40 2 60 1", 3)}
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 58, r: 11.5, pr: 5.6, dy: -1 })}
        ${strek("M30 40 Q40 34 50 39M70 39 Q80 34 90 40", 4.2)}
        ${form("M42 82 Q60 106 78 82Z", "#7a1f2b", 4.2)}
        <path d="M50 94 Q60 101 70 94 Q60 90 50 94Z" fill="#ff8fa6"/>
        ${glimt(8, 70, 8)}${glimt(113, 62, 6)}${glimt(104, 104, 5, P)}`,
    },
// alias: ["#ff7a59", "H"]
