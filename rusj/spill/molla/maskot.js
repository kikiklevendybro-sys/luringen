    // Mølla: a round wheat-yellow head under a windmill's four latticed sails (a mill), with a brass
    // hub on top, a happy look and cheeks like two game pieces, one cream and one plum.
    molla: {
      farge: "#f2b45c",
      tegn: (f) => `
        ${[-45, 45, 135, 225].map((a) => `<g transform="rotate(${a} 60 14)">${form("M53 10 H67 V-26 H53Z", P, 3.5)}${strek("M60 10 V-26M53 -2 H67M53 -14 H67", 2, "rgba(23,14,43,.4)")}</g>`).join("")}
        ${hode(f)}
        <circle cx="60" cy="14" r="7" fill="${MESSING}" stroke="${B}" stroke-width="3.5"/>
        <circle cx="30" cy="80" r="7" fill="${P}" stroke="${B}" stroke-width="3"/>
        <circle cx="90" cy="80" r="7" fill="#5a4785" stroke="${B}" stroke-width="3"/>
        ${oyne({ y: 60, dx: 2, dy: 1 })}
        ${smil(88, 13)}`,
    },
// alias: ["#f2b45c", "M"]
