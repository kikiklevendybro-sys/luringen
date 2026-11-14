// alias: ["#9be36b", "E"]
    // Edderkoppen: a round, leafy-green spider hanging from a silk thread, eight bendy legs with
    // little feet, two big friendly eyes and a small smile – the thread is the word being spun.
    edderkoppen: {
      farge: "#9be36b",
      tegn: (f) => `
        ${strek("M60 0 V18", 3, P)}
        ${strek("M22 46 Q8 30 4 16M16 62 Q2 56 -2 44M16 78 Q2 84 -2 98M24 94 Q12 106 10 120", 5.5)}
        ${strek("M98 46 Q112 30 116 16M104 62 Q118 56 122 44M104 78 Q118 84 122 98M96 94 Q108 106 110 120", 5.5)}
        <circle cx="4" cy="16" r="3.5" fill="${B}"/><circle cx="116" cy="16" r="3.5" fill="${B}"/>
        <circle cx="10" cy="120" r="3.5" fill="${B}"/><circle cx="110" cy="120" r="3.5" fill="${B}"/>
        ${hode(f)}
        ${kinn(80)}
        ${oyne({ y: 58, r: 13, pr: 6, dy: 1 })}
        ${smil(86, 13)}
        ${glans("M28 44 Q34 32 46 26", 4)}`,
    },
