// alias: ["#ff9ec4", "L"]
    // Lykkegrisen: a pink pig with pointy ears and a big snout, a die on its head (the one shows
    // its single red pip) and a lucky four-leaf clover tucked behind one ear.
    lykkegrisen: {
      farge: "#ff9ec4",
      tegn: (f) => `
        ${form("M22 34 L18 6 L46 22Z", f)}
        ${form("M98 34 L102 6 L74 22Z", f)}
        <path d="M24 28 L22 13 L37 22Z" fill="#ff6fa4"/>
        <path d="M96 28 L98 13 L83 22Z" fill="#ff6fa4"/>
        ${hode(f)}
        ${[[104, 14, 0], [112, 22, 90], [104, 30, 180], [96, 22, 270]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="7.5" fill="#53d769" stroke="${B}" stroke-width="2.5" transform="rotate(${r + 45} ${x} ${y})"/>`).join("")}
        <circle cx="104" cy="22" r="2.6" fill="${B}"/>
        <rect x="47" y="2" width="26" height="26" rx="6" fill="${P}" stroke="${B}" stroke-width="3.5" transform="rotate(-8 60 15)"/>
        <circle cx="60" cy="15" r="4.2" fill="#e3364f"/>
        ${oyne({ y: 54, x1: 41, x2: 79, r: 11, pr: 5, dx: 1, dy: 1 })}
        <ellipse cx="60" cy="80" rx="19" ry="13" fill="#ff7fae" stroke="${B}" stroke-width="4.5"/>
        <ellipse cx="53" cy="80" rx="3.6" ry="5" fill="${B}"/>
        <ellipse cx="67" cy="80" rx="3.6" ry="5" fill="${B}"/>
        ${kinn(70)}
        ${strek("M50 100 Q60 106 70 100", 4)}`,
    },
