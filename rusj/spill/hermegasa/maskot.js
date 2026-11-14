// alias: ["#ffa14a", "H"]
    // Hermegåsa: a white goose with a curl on top, an orange beak open in a honk and a blue scarf;
    // the four shapes of the game (circle, star, square, triangle) float around it.
    hermegasa: {
      farge: "#ffa14a",
      tegn: (f) => `
        ${form("M22 104 Q60 126 98 104 L104 118 Q60 134 16 118Z", HIMMEL, 4)}
        ${hode("#f7f3ec")}
        ${form("M58 18 Q50 2 62 -2 Q56 8 66 12 Q70 4 76 8 Q66 12 66 20Z", "#f7f3ec", 3.8)}
        ${kinn(80)}
        ${oyne({ y: 54, r: 11.5, pr: 5.6, dx: 1, dy: 1 })}
        ${strek("M29 37 Q38 32 48 37M72 37 Q82 32 91 37", 4.2)}
        ${form("M44 84 Q60 94 76 84 Q60 104 44 84Z", "#e0721c", 4)}
        ${form("M38 76 Q60 60 82 76 Q74 86 60 86 Q46 86 38 76Z", f, 4.2)}
        <circle cx="52" cy="74" r="2" fill="${B}"/><circle cx="68" cy="74" r="2" fill="${B}"/>
        ${glans("M48 70 Q54 66 60 66", 2.6)}
        <circle cx="6" cy="40" r="7.5" fill="#ff5a6e" stroke="${B}" stroke-width="3.2"/>
        ${form("M112 20 L115.2 27 L122.8 27.8 L117.2 33 L118.8 40.6 L112 36.8 L105.2 40.6 L106.8 33 L101.2 27.8 L108.8 27Z", LAMPE, 3)}
        ${form("M-2 78 H12 V92 H-2Z", "#4fb2ff", 3.2)}
        ${form("M114 78 L122 92 L106 92Z", MYNT, 3.2)}`,
    },
