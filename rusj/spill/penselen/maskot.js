// alias: ["#6fc8ff", "P"]
    // Penselen: a sky-blue painter in a red beret with a stalk, dots of paint on one cheek, a happy
    // grin – and a paintbrush with a yellow tip held up beside the face.
    penselen: {
      farge: "#6fc8ff",
      tegn: (f) => `
        ${hode(f)}
        ${form("M18 40 Q22 10 66 12 Q108 16 100 36 Q86 44 56 42 Q30 42 18 40Z", ROD, 5)}
        ${pinne("M62 12 Q64 4 70 2", ROD, 3)}
        ${kinn(80)}
        ${oyne({ y: 62, r: 11.5, pr: 5.4, dx: 2, dy: -1 })}
        ${strek("M44 88 Q60 102 76 88", 5)}
        <circle cx="30" cy="94" r="4.5" fill="${LAMPE}" stroke="${B}" stroke-width="2.5"/><circle cx="40" cy="102" r="3.2" fill="#ff7eb6" stroke="${B}" stroke-width="2.2"/><circle cx="26" cy="106" r="2.6" fill="#8bd346" stroke="${B}" stroke-width="2"/>
        ${pinne("M96 118 L110 70", "#c98b5a", 5)}
        ${form("M106 70 L114 72 L116 64 L108 62Z", METALL, 3.4)}
        ${form("M108 62 Q106 48 116 40 Q122 52 116 64Z", LAMPE, 3.6)}`,
    },
