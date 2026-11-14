// alias: ["#8fdc5c", "S"]
    // Sjefen: a green boss in a peaked cap with a gold star, eyebrows set for business and a
    // yellow megaphone – the cards give the orders, and Sjefen reads them out.
    sjefen: {
      farge: "#8fdc5c",
      tegn: (f) => `
        ${hode(f)}
        ${form("M14 44 Q16 8 60 6 Q104 8 106 44 Q60 30 14 44Z", "#34306e", 4.5)}
        ${form("M10 46 Q60 30 110 46 Q112 56 102 56 Q60 44 18 56 Q8 56 10 46Z", B, 3)}
        ${glimt(60, 24, 9, LAMPE)}
        ${strek("M27 52 L50 58M93 52 L70 58", 5)}
        ${kinn(84)}
        ${oyne({ y: 68, r: 10.5, dx: 2, dy: 1, pr: 5 })}
        ${strek("M46 92 Q60 101 74 92", 5)}
        ${form("M88 98 L114 84 L114 116 L88 104Z", LAMPE, 4)}
        ${form("M80 96 L90 96 L90 106 L80 106Z", "#ff9f43", 3.5)}
        ${strek("M118 92 L124 88M119 100 L126 100M118 108 L124 112", 3, P)}`,
    },
