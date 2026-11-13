// alias: ["#ffb35c", "P"]
    // Planeten: a warm orange planet with a few craters on its forehead and a tilted ring around its
    // middle, a little moon circling above – the planet that swallows its twin and grows.
    planeten: {
      farge: "#ffb35c",
      tegn: (f) => `
        <g transform="rotate(-12 60 92)">${strek("M-4 92 A64 14 0 0 1 124 92", 11)}${strek("M-4 92 A64 14 0 0 1 124 92", 5.5, "#ffe3a3")}</g>
        ${hode(f)}
        <ellipse cx="33" cy="36" rx="6" ry="4.5" fill="#e58f3a"/><ellipse cx="78" cy="27" rx="4.5" ry="3.4" fill="#e58f3a"/><ellipse cx="95" cy="44" rx="3.4" ry="2.6" fill="#e58f3a"/>
        ${kinn(76)}
        ${oyne({ y: 56, dx: 2, dy: -2 })}
        ${smil(80, 13)}
        <g transform="rotate(-12 60 92)">${strek("M-4 92 A64 14 0 0 0 124 92", 11)}${strek("M-4 92 A64 14 0 0 0 124 92", 5.5, "#ffe3a3")}</g>
        <circle cx="109" cy="8" r="9" fill="#ece6d6" stroke="${B}" stroke-width="4"/><circle cx="106" cy="6" r="2.4" fill="#cfc7b0"/>
        ${glimt(14, 14, 6)}${glimt(122, 34, 4, P)}`,
    },
