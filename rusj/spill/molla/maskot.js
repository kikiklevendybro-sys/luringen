    // Mølla: a round wheat-yellow head in front of a windmill's four latticed sails (a mill), which
    // peek out at the corners, a brass hub on the forehead, a happy look and rosy cheeks.
    molla: {
      farge: "#f2b45c",
      tegn: (f) => `
        ${[45, 135, 225, 315].map((a) => `<g transform="rotate(${a} 60 64)">${form("M53 18 H67 V-6 H53Z", P, 3.5)}${strek("M60 18 V-6M53 10 H67M53 2 H67", 2, "rgba(23,14,43,.4)")}</g>`).join("")}
        ${hode(f)}
        <circle cx="60" cy="30" r="6" fill="${MESSING}" stroke="${B}" stroke-width="3.5"/>
        ${kinn(80)}
        ${oyne({ y: 60, dx: 2, dy: 1 })}
        ${smil(88, 13)}`,
    },
// alias: ["#f2b45c", "M"]
