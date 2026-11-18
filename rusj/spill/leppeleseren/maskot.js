    // Leppeleseren (the headphone lip-reading game): a head with big headphones and huge talking lips.
    leppeleseren: {
      farge: "#ff6fa5",
      tegn: (f) => `
        ${pinne("M16 60 Q14 10 60 9 Q106 10 104 60", HIMMEL, 6)}
        ${hode(f)}
        ${form("M9 46 h11 a5 5 0 0 1 5 5 v30 a5 5 0 0 1 -5 5 h-11 a5 5 0 0 1 -5 -5 v-30 a5 5 0 0 1 5 -5z", HIMMEL)}
        ${form("M100 46 h11 a5 5 0 0 1 5 5 v30 a5 5 0 0 1 -5 5 h-11 a5 5 0 0 1 -5 -5 v-30 a5 5 0 0 1 5 -5z", HIMMEL)}
        ${strek("M11 54 v24M109 54 v24", 3, P)}
        ${oyne({ y: 47, x1: 43, x2: 77, r: 10.5, pr: 5, dy: -1 })}
        ${form("M36 80 Q60 72 84 80 Q78 104 60 104 Q42 104 36 80Z", B, 3)}
        ${form("M47 81 Q60 78 73 81 L72 87 Q60 89 48 87Z", P, 2.5)}
        ${form("M32 80 Q44 66 60 74 Q76 66 88 80 Q74 84 60 82 Q46 84 32 80Z", ROD, 4)}
        ${form("M37 92 Q60 99 83 92 Q78 109 60 109 Q42 109 37 92Z", ROD, 4)}
        ${glans("M44 74 Q50 71 55 73", 3)}
        ${noter(96, 26, LAMPE, 12)}${note(10, 28, MYNT, -12)}`,
    },
// alias: ["#ff6fa5", "L"]
