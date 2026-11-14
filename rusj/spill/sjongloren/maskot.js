// alias: ["#ff9f5a", "S"]
    // Sjongløren: a round, apricot juggler with a striped jester-ish hat brim, eyes looking up at three
    // letter balls in the air above her head (pink, yellow and mint), a happy open smile.
    sjongloren: {
      farge: "#ff9f5a",
      tegn: (f) => `
        ${hode(f)}
        ${form("M22 40 Q60 6 98 40 Q60 26 22 40Z", P, 4)}
        ${strek("M40 27 L46 36M60 22 V33M80 27 L74 36", 3.5, "#ff6f9f")}
        <circle cx="22" cy="12" r="10" fill="#ff86c8" stroke="${B}" stroke-width="3.5"/>
        <circle cx="60" cy="2" r="10" fill="${LAMPE}" stroke="${B}" stroke-width="3.5"/>
        <circle cx="98" cy="12" r="10" fill="#7fe0b5" stroke="${B}" stroke-width="3.5"/>
        ${kinn(82)}
        ${oyne({ y: 62, r: 12, pr: 5.6, dy: -4 })}
        ${form("M46 88 Q60 104 74 88Z", "#ff6f6f", 4)}`,
    },
