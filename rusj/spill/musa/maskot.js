// alias: ["#c3b1f5", "M"]
    // Musa: a lavender mouse with big round ears, a pink nose and whiskers, two little front teeth –
    // and a wedge of cheese, the goal of every maze.
    musa: {
      farge: "#c3b1f5",
      tegn: (f) => `
        <circle cx="22" cy="30" r="22" fill="${f}" stroke="${B}" stroke-width="5"/>
        <circle cx="98" cy="30" r="22" fill="${f}" stroke="${B}" stroke-width="5"/>
        <circle cx="23" cy="31" r="12.5" fill="#ff9ec4"/><circle cx="97" cy="31" r="12.5" fill="#ff9ec4"/>
        ${hode(f)}
        ${kinn(82)}
        ${oyne({ y: 58, r: 11.5, pr: 5.6, dy: 1 })}
        ${strek("M46 84 L16 78M46 89 L18 94M74 84 L104 78M74 89 L102 94", 2.8)}
        ${form("M55.5 92 H64.5 V100.5 Q60 102.5 55.5 100.5Z", P, 2.8)}${strek("M60 92 V100", 2)}
        ${strek("M50 89 Q60 95 70 89", 4)}
        <ellipse cx="60" cy="82" rx="8" ry="6" fill="#ff6f9f" stroke="${B}" stroke-width="3.5"/>
        ${glans("M56.5 80 Q58.5 78.5 61 79", 2.2)}
        ${form("M84 120 L84 104 L116 90 L120 98 L120 114Z", LAMPE, 3.8)}
        ${form("M84 104 L116 90 L120 98Z", "#ffe788", 3.2)}
        <circle cx="96" cy="111" r="3.2" fill="#e8a91e"/><circle cx="109" cy="106" r="2.4" fill="#e8a91e"/><circle cx="112" cy="114" r="1.8" fill="#e8a91e"/>`,
    },
