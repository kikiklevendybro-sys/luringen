// alias: ["#6c9cff", "M"]
    // Mistanken: a blue head with one eyebrow raised and the eyes darting sideways, a hand by the
    // mouth whispering «psst», and a little question mark floating above – who here …?
    mistanken: {
      farge: "#6c9cff",
      tegn: (f) => `
        ${hode(f)}
        ${strek("M28 38 Q40 30 52 40", 5)}${strek("M68 44 Q80 42 92 46", 5)}
        ${oyne({ y: 58, r: 11, dx: 5, dy: 0, pr: 5 })}
        ${rodme(80)}
        ${strek("M48 88 Q56 84 66 88", 4.5)}
        ${form("M70 86 Q78 78 88 82 Q96 86 92 98 Q86 108 74 102 Q66 96 70 86Z", "#ffd9b3", 4)}
        ${strek("M76 90 L86 88M76 96 L88 96", 2.5)}
        ${tekst(106, 22, "?", 26, LAMPE)}
        ${strek("M100 66 Q110 62 114 54M102 76 Q114 76 120 70", 3, P)}`,
    },
