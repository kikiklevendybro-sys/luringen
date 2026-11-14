    // Smilefjeset: a sunny yellow face winking with one eye and grinning wide, with a small speech
    // bubble of emoji shapes (a heart, a star, a drop) – the riddle it is about to tell.
    smilefjeset: {
      farge: "#ffc93c",
      tegn: (f) => `
        ${hode(f)}
        ${kinn(80)}
        <circle cx="40" cy="56" r="11.5" fill="${P}" stroke="${B}" stroke-width="4.5"/>
        <circle cx="41" cy="57" r="5.6" fill="${B}"/><circle cx="39" cy="54.6" r="1.7" fill="${P}"/>
        ${strek("M70 58 Q80 48 91 58", 5.5)}
        ${strek("M29 38 Q40 32 51 37M70 44 Q80 40 90 44", 4.2)}
        ${form("M36 76 Q60 108 84 76Z", "#7a1f2b", 4.2)}
        <path d="M40 78 H80 L77 84 H43Z" fill="${P}"/>
        ${form("M84 6 H118 Q122 6 122 10 V28 Q122 32 118 32 H100 L92 40 L94 32 H84 Q80 32 80 28 V10 Q80 6 84 6Z", P, 3.6)}
        ${hjerte(92, 19, 5)}${glimt(104, 19, 5.5)}<circle cx="114" cy="20" r="3.4" fill="#59b9ff"/>`,
    },
// alias: ["#ffc93c", "S"]
