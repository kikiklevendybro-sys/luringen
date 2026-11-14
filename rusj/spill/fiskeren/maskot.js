// alias: ["#4fc3d9", "F"]
    // Fiskeren: a round, sea-blue fisher in a yellow sou'wester, a fishing rod over the shoulder with
    // a playing card (the 10 of diamonds, «store kasino») hooked on the line.
    fiskeren: {
      farge: "#4fc3d9",
      tegn: (f) => `
        ${strek("M96 112 L112 6", 4.5)}
        ${strek("M112 6 Q118 30 116 52", 2, B)}
        <rect x="104" y="52" width="16" height="22" rx="3" fill="${P}" stroke="${B}" stroke-width="3"/>
        <path d="M112 57 L116 63 L112 69 L108 63Z" fill="#dc2440"/>
        ${hode(f)}
        ${form("M10 52 Q14 14 60 12 Q106 14 110 52 Q60 40 10 52Z", LAMPE, 4.5)}
        ${strek("M30 30 Q60 22 90 30", 3, "#c99a1a")}
        ${kinn(82)}
        ${oyne({ y: 66, r: 11.5, pr: 5.4, dx: 2 })}
        ${smil(90, 13)}`,
    },
