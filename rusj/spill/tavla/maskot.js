// alias: ["#d8613f", "T"]
    // Tavla: a terracotta face with a fringe of backgammon points (sand and felt green) and a little
    // stack of checkers, two dark and two cream, balanced on top like a hat.
    tavla: {
      farge: "#d8613f",
      tegn: (f) => `
        ${hode(f)}
        ${[0, 1, 2, 3].map((i) => form(`M${32 + i * 14} 30 L${46 + i * 14} 30 L${39 + i * 14} 50Z`, i % 2 ? "#1d5b4c" : "#f2d39b", 3)).join("")}
        <ellipse cx="60" cy="21" rx="21" ry="7" fill="#2b1f47" stroke="${B}" stroke-width="3.5"/>
        <ellipse cx="60" cy="15" rx="21" ry="7" fill="#2b1f47" stroke="${B}" stroke-width="3.5"/>
        <ellipse cx="60" cy="9" rx="21" ry="7" fill="${P}" stroke="${B}" stroke-width="3.5"/>
        <ellipse cx="60" cy="3" rx="21" ry="7" fill="${P}" stroke="${B}" stroke-width="3.5"/>
        <ellipse cx="60" cy="3" rx="11" ry="3.5" fill="none" stroke="rgba(23,14,43,.28)" stroke-width="2"/>
        ${kinn(84)}
        ${oyne({ y: 66, dx: 2, dy: -1 })}
        ${smil(90, 13)}
        ${glimt(100, 18, 6)}`,
    },
