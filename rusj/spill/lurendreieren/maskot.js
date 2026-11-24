    // Lurendreieren: the trickster – a rogue's mask over narrow eyes that glance sideways, one
    // eyebrow up, a crooked smirk, and two dice tucked behind the head where nobody is meant to
    // see them.
    lurendreieren: {
      farge: "#b86fc6",
      tegn: (f) => `
        ${terning(99, 30, 14, 12)}
        ${terning(20, 34, 12, -16, ["#fff0b0", LAMPE, "#e0ac1c"], B)}
        ${hode(f)}
        ${kinn(84)}
        <path d="M13 52 Q60 37 107 52 L105 68 Q86 77 73 67 Q60 59 47 67 Q34 77 15 68Z" fill="${B}"/>
        ${blunk(59, `<path d="M28 59 Q40 51 52 59 Q40 68 28 59Z" fill="${P}"/><path d="M68 59 Q80 51 92 59 Q80 68 68 59Z" fill="${P}"/><circle cx="45" cy="60" r="4.3" fill="${B}"/><circle cx="85" cy="60" r="4.3" fill="${B}"/>`)}
        ${strek("M27 37 Q40 28 53 36", 5.5)}${strek("M68 40 Q80 37 93 43", 5.5)}
        ${strek("M41 89 Q60 101 81 85", 5)}
        ${strek("M78 81 l6.5 2", 4)}
        ${glimt(108, 62, 5)}`,
    },
// alias: ["#b86fc6", "L"]
