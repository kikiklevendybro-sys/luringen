    // Sfinksen: a sandy lion-faced sphinx in a striped blue-and-gold headdress, one eyebrow raised and
    // a knowing smile – and a small question mark floating by: it has a riddle for you.
    sfinksen: {
      farge: "#e0b25a",
      tegn: (f) => `
        ${form("M8 112 L14 40 Q20 10 60 8 Q100 10 106 40 L112 112 L86 112 L88 58 L32 58 L34 112Z", HIMMEL, 4.5)}
        ${strek("M18 70 H32M16 86 H33M15 102 H34M88 70 H102M87 86 H104M86 102 H105", 5, LAMPE)}
        ${hode(f)}
        ${form("M22 46 Q24 12 60 10 Q96 12 98 46 Q80 30 60 30 Q40 30 22 46Z", LAMPE, 4.2)}
        ${strek("M34 24 Q46 18 60 18M86 24 Q74 18 60 18", 4.2, HIMMEL)}
        ${kinn(82)}
        ${oyne({ y: 60, r: 10.5, pr: 5, dx: 1.5, dy: 1 })}
        ${strek("M30 44 Q40 40 50 46M70 40 Q80 34 90 38", 4.2)}
        ${strek("M48 86 Q60 94 74 84", 4.5)}
        <path d="M56 72 H64 L60 77Z" fill="${B}"/>
        ${tekst(110, 24, "?", 26, P)}`,
    },
// alias: ["#e0b25a", "S"]
