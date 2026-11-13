// alias: ["#3cc6b4", "S"]
    // Skyveren: a teal square tile with rounded corners and a cheeky sideways glance, pushing a
    // little paper tile «15» along with both hands – sliding it into the empty square.
    skyveren: {
      farge: "#3cc6b4",
      tegn: (f) => `
        ${strek("M92 44 h18M98 36 h14", 4, LAMPE)}
        <rect x="84" y="54" width="34" height="34" rx="7" fill="${P}" stroke="${B}" stroke-width="4"/>
        ${tekst(101, 78, "15", 17)}
        ${form("M6 32 Q6 16 22 16 H66 Q82 16 82 32 V96 Q82 112 66 112 H22 Q6 112 6 96Z", f, 5)}
        ${glans("M16 36 V27 Q16 25 20 25 H32", 5)}
        <ellipse cx="20" cy="76" rx="7" ry="4.5" fill="rgba(255, 79, 139, 0.32)"/><ellipse cx="68" cy="76" rx="7" ry="4.5" fill="rgba(255, 79, 139, 0.32)"/>
        ${oyne({ y: 54, x1: 28, x2: 60, r: 10, pr: 5, dx: 4, dy: 0 })}
        ${strek("M18 38 Q28 33 37 37M51 35 Q60 31 70 36", 4.5)}
        ${strek("M32 84 Q45 93 58 82", 5)}
        <ellipse cx="84" cy="64" rx="6.5" ry="6" fill="${f}" stroke="${B}" stroke-width="3.5"/>
        <ellipse cx="84" cy="80" rx="6.5" ry="6" fill="${f}" stroke="${B}" stroke-width="3.5"/>`,
    },
